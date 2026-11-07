package sessionlog

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func records(t *testing.T, dir string) []map[string]any {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join(dir, "*.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	var result []map[string]any
	for _, path := range paths {
		f, err := os.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			var record map[string]any
			if err := json.Unmarshal(scanner.Bytes(), &record); err != nil {
				t.Fatal(err)
			}
			result = append(result, record)
		}
		if err := scanner.Err(); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	return result
}

func TestPersistenceAcrossSessionsAndConcurrentRecords(t *testing.T) {
	dir := t.TempDir()
	first := New(dir)
	first.Start("0.2.1")
	firstID := first.SessionID()
	var workers sync.WaitGroup
	for n := 0; n < 8; n++ {
		workers.Go(func() {
			for i := 0; i < 20; i++ {
				first.Record(Event{Name: "action_finished", ActionID: ID(), Outcome: "success"})
			}
		})
	}
	workers.Wait()
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	second := New(dir)
	defer second.Close()
	second.Start("0.2.1")
	entries := records(t, dir)
	if len(entries) != 162 {
		t.Fatalf("got %d records", len(entries))
	}
	if firstID == second.SessionID() {
		t.Fatal("session IDs must differ")
	}
	var old, current bool
	for _, entry := range entries {
		old = old || entry["session_id"] == firstID
		current = current || entry["session_id"] == second.SessionID()
	}
	if !old || !current {
		t.Fatal("old and current records must both persist")
	}
}

func TestRotationRetentionAndUnrelatedFiles(t *testing.T) {
	dir := t.TempDir()
	l := New(dir)
	defer l.Close()
	l.maxFile = 500
	l.maxTotal = 1400
	unrelated := filepath.Join(dir, "credentials.json")
	if err := os.WriteFile(unrelated, []byte("private"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := filepath.Join(dir, "session-20000101T000000Z-0123456789abcdef01234567-0000.jsonl")
	if err := os.WriteFile(old, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	past := time.Now().Add(-Retention - time.Hour)
	if err := os.Chtimes(old, past, past); err != nil {
		t.Fatal(err)
	}
	for n := 0; n < 20; n++ {
		l.Record(Event{Name: "action_finished", ActionID: ID(), Outcome: "success"})
	}
	if _, err := os.Stat(old); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("expired file survived retention")
	}
	if _, err := os.Stat(unrelated); err != nil {
		t.Fatal("unrelated file was removed")
	}
	l.mu.Lock()
	files, err := l.filesLocked()
	l.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	var total int64
	for _, file := range files {
		total += file.info.Size()
		if file.info.Size() > l.maxFile {
			t.Fatal("rotation exceeded file limit")
		}
	}
	if total > l.maxTotal {
		t.Fatalf("retained %d bytes, limit %d", total, l.maxTotal)
	}
	if l.segment == 0 {
		t.Fatal("expected rotation")
	}
}

func TestExportIncludesRetainedAndActiveSessionOnly(t *testing.T) {
	dir := t.TempDir()
	first := New(dir)
	first.Start("0.2.1")
	first.Close()
	l := New(dir)
	defer l.Close()
	l.Start("0.2.1")
	os.WriteFile(filepath.Join(dir, "config.json"), []byte("secret"), 0o600)
	destination := filepath.Join(t.TempDir(), "sessions.zip")
	if err := l.Export(destination); err != nil {
		t.Fatal(err)
	}
	archive, err := zip.OpenReader(destination)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	if len(archive.File) != 2 {
		t.Fatalf("expected two sessions, got %d", len(archive.File))
	}
	for _, file := range archive.File {
		if !logName.MatchString(file.Name) {
			t.Fatalf("unexpected export entry %s", file.Name)
		}
	}
	if err := l.Export(filepath.Join(dir, "export.zip")); err == nil {
		t.Fatal("export must not write into the log store")
	}
	if err := l.Export(filepath.Join(t.TempDir(), "missing", "export.zip")); err == nil {
		t.Fatal("bad destinations must fail")
	}
}

func TestExportRejectsSymlinks(t *testing.T) {
	dir := t.TempDir()
	l := New(dir)
	defer l.Close()
	l.Start("0.2.1")
	secret := filepath.Join(t.TempDir(), "secret.jsonl")
	os.WriteFile(secret, []byte("secret"), 0o600)
	name := "session-20000101T000000Z-0123456789abcdef01234567-0000.jsonl"
	if err := os.Symlink(secret, filepath.Join(dir, name)); err != nil {
		t.Skip(err)
	}
	target := filepath.Join(t.TempDir(), "export.zip")
	if err := l.Export(target); err != nil {
		t.Fatal(err)
	}
	archive, err := zip.OpenReader(target)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	if len(archive.File) != 1 {
		t.Fatal("export included a symlink")
	}
	link := filepath.Join(t.TempDir(), "export.zip")
	if err := os.Symlink(secret, link); err != nil {
		t.Fatal(err)
	}
	if err := l.Export(link); err == nil {
		t.Fatal("export followed target symlink")
	}
}

func TestReadFailuresAndStateChangesAreDeduplicated(t *testing.T) {
	dir := t.TempDir()
	l := New(dir)
	defer l.Close()
	connected := true
	state := State{Running: true, Healthy: true, Version: "0.7.2", OBSConnected: &connected}
	for n := 0; n < 20; n++ {
		l.Transition("tuberswitch", state)
		l.Request(context.Background(), "tuberswitch", "GET", "/api/v1/status", time.Millisecond, 0, context.DeadlineExceeded)
	}
	connected = false
	l.Transition("tuberswitch", state)
	l.Request(context.Background(), "tuberswitch", "GET", "/api/v1/status", time.Millisecond, 200, nil)
	for n := 0; n < 20; n++ {
		l.Request(context.Background(), "tuberswitch", "GET", "/api/v1/status", time.Millisecond, 200, nil)
	}
	if got := len(records(t, dir)); got != 4 {
		t.Fatalf("got %d records, expected two states and failure/recovery", got)
	}
}

func TestErrorsNeverCopySensitiveMessages(t *testing.T) {
	dir := t.TempDir()
	l := New(dir)
	defer l.Close()
	for _, message := range []string{"password=secret-token", "Authorization: Bearer secret-token", "announcement: personal stream content", strings.Repeat("private", 1000)} {
		l.Request(context.Background(), "streamsignal", "POST", "/api/v1/announce", time.Millisecond, 401, fmt.Errorf("remote error: %s", message))
	}
	l.Record(Event{Name: "injected\nevent", Operation: strings.Repeat("private", 1000)})
	data, _ := json.Marshal(records(t, dir))
	for _, sensitive := range []string{"secret-token", "Authorization", "personal stream content", "private"} {
		if strings.Contains(string(data), sensitive) {
			t.Fatalf("log exposed %s", sensitive)
		}
	}
	if ErrorKind(context.Canceled) != "canceled" || ErrorKind(context.DeadlineExceeded) != "timeout" {
		t.Fatal("incorrect cancellation classification")
	}
}

func TestUnavailableAndFailedWritesProduceWarning(t *testing.T) {
	parent := t.TempDir()
	blocked := filepath.Join(parent, "file")
	os.WriteFile(blocked, []byte("x"), 0o600)
	l := New(filepath.Join(blocked, "logs"))
	defer l.Close()
	l.Record(Event{Name: "test"})
	if l.Warning() == "" {
		t.Fatal("missing initialization warning")
	}
	working := New(t.TempDir())
	defer working.Close()
	working.file.Close() // Simulates a disk/write failure without permission assumptions.
	working.Record(Event{Name: "test"})
	if working.Warning() == "" {
		t.Fatal("missing write warning")
	}
}

func TestPrivatePermissionsAndFailedExportPreservesDestination(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "logs")
	l := New(dir)
	defer l.Close()
	l.Start("0.2.1")
	info, err := os.Stat(l.file.Name())
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("log permissions too broad: %v", info.Mode())
	}
	destination := filepath.Join(t.TempDir(), "export.zip")
	if err := l.Export(destination); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if err := l.Close(); err != nil {
		t.Fatal(err)
	}
	paths, err := filepath.Glob(filepath.Join(dir, "*.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range paths {
		if err := os.Remove(path); err != nil {
			t.Fatal(err)
		}
	}
	if err := l.Export(destination); err == nil {
		t.Fatal("expected empty export to fail")
	}
	after, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("failed export changed existing archive")
	}
}

func TestHealthAndProfileChangesProduceNewStates(t *testing.T) {
	dir := t.TempDir()
	l := New(dir)
	defer l.Close()
	first := State{Running: true, Healthy: true, HealthStatus: "ready", ProfileRef: Reference("private-profile-one")}
	l.Transition("streamsignal", first)
	l.Transition("streamsignal", first)
	first.HealthStatus = "degraded"
	l.Transition("streamsignal", first)
	first.ProfileRef = Reference("private-profile-two")
	l.Transition("streamsignal", first)
	entries := records(t, dir)
	if len(entries) != 3 {
		t.Fatalf("missing transitions: %v", entries)
	}
	data, _ := json.Marshal(entries)
	if strings.Contains(string(data), "private-profile") {
		t.Fatal("profile ID was logged in plaintext")
	}
}
