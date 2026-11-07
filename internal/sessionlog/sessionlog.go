// Package sessionlog stores a bounded, local troubleshooting timeline. It accepts
// typed metadata only: callers must never pass request bodies, profile content,
// credentials, raw status maps, or untrusted error messages.
package sessionlog

import (
	"archive/zip"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	MaxFileBytes  int64 = 5 << 20
	MaxTotalBytes int64 = 100 << 20
	Retention           = 14 * 24 * time.Hour
)

var logName = regexp.MustCompile(`^session-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{24}-[0-9]{4,}\.jsonl$`)
var token = regexp.MustCompile(`^[a-zA-Z0-9_.:/+-]{1,96}$`)

// State deliberately excludes human-readable summaries, scene/profile names,
// endpoints, and arbitrary module data.
type State struct {
	SourceState           string `json:"source_state,omitempty"`
	OverlayState          string `json:"overlay_state,omitempty"`
	BrowserState          string `json:"browser_state,omitempty"`
	SourceObservedAt      string `json:"source_observed_at,omitempty"`
	OverlayObservedAt     string `json:"overlay_observed_at,omitempty"`
	SourceErrorCode       string `json:"source_error_code,omitempty"`
	OverlayErrorCode      string `json:"overlay_error_code,omitempty"`
	OBSObservedAt         string `json:"obs_observed_at,omitempty"`
	OBSLastConnectedAt    string `json:"obs_last_connected_at,omitempty"`
	OBSLastDisconnectedAt string `json:"obs_last_disconnected_at,omitempty"`
	OBSNextReconnectAt    string `json:"obs_next_reconnect_at,omitempty"`
	OBSLastDisconnectCode string `json:"obs_last_disconnect_code,omitempty"`

	Running      bool   `json:"running"`
	Healthy      bool   `json:"healthy"`
	Version      string `json:"version"`
	HealthStatus string `json:"health_status,omitempty"`
	ProfileRef   string `json:"profile_ref,omitempty"`
	OBSConnected *bool  `json:"obs_connected,omitempty"`
	OBSState     string `json:"obs_state,omitempty"`
	ErrorKind    string `json:"error_kind,omitempty"`
}

type Event struct {
	Integration                                           string
	DestinationRef, Platform                              string
	Published                                             *bool
	Name, Module, Operation, ActionID, Outcome, ErrorKind string
	RequestID, OwnerSessionID, OperationID, ErrorCode     string
	DurationMS                                            int64
	HTTPStatus                                            int
	State                                                 *State
}

type Logger struct {
	mu                sync.Mutex
	dir, session      string
	file              *os.File
	size              int64
	segment           int
	err               error
	closed            bool
	maxFile, maxTotal int64
	retention         time.Duration
	logger            *slog.Logger
	states            map[string]State
	readErrors        map[string]string
	ownerStates       map[string]string
}

func New(dir string) *Logger {
	l := &Logger{dir: dir, session: time.Now().UTC().Format("20060102T150405Z") + "-" + ID(), maxFile: MaxFileBytes, maxTotal: MaxTotalBytes, retention: Retention, states: map[string]State{}}
	l.logger = slog.New(slog.NewJSONHandler(l, &slog.HandlerOptions{ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
		if a.Key == slog.TimeKey {
			return slog.Time(slog.TimeKey, a.Value.Time().UTC())
		}
		return a
	}})).With("session_id", l.session)
	l.mu.Lock()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		l.err = err
	} else if err := l.openLocked(); err != nil {
		l.err = err
	} else {
		l.err = l.pruneLocked()
	}
	if l.err != nil && l.file != nil {
		_ = l.file.Close()
		l.file = nil
	}
	l.mu.Unlock()
	return l
}

func ID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("sessionlog: random ID unavailable")
	}
	return hex.EncodeToString(b[:])
}

// Reference permits profile-change detection without storing the profile ID or name.
func Reference(value string) string {
	if value == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:12])
}

func safe(value string) string {
	if value == "" {
		return ""
	}
	if !token.MatchString(value) {
		return "omitted"
	}
	return value
}

func (l *Logger) Record(e Event) {
	if l == nil {
		return
	}
	attrs := []any{"module", safe(e.Module), "operation", safe(e.Operation), "action_id", safe(e.ActionID), "outcome", safe(e.Outcome), "error_kind", safe(e.ErrorKind), "duration_ms", e.DurationMS}
	if e.RequestID != "" {
		attrs = append(attrs, "request_id", safe(e.RequestID))
	}
	if e.OwnerSessionID != "" {
		attrs = append(attrs, "owner_session_id", safe(e.OwnerSessionID))
	}
	if e.OperationID != "" {
		attrs = append(attrs, "operation_id", safe(e.OperationID))
	}
	if e.ErrorCode != "" {
		attrs = append(attrs, "error_code", safe(e.ErrorCode))
	}
	if e.Name == "integration_result" {
		attrs = append(attrs, "integration", safe(e.Integration))
	}
	if e.Name == "destination_result" {
		attrs = append(attrs, "destination_ref", safe(e.DestinationRef), "platform", safe(e.Platform), "published", e.Published)
	}
	if e.HTTPStatus != 0 {
		attrs = append(attrs, "http_status", e.HTTPStatus)
	}
	if e.State != nil {
		state := *e.State
		state.Version, state.OBSState, state.ErrorKind = safe(state.Version), safe(state.OBSState), safe(state.ErrorKind)
		state.HealthStatus, state.ProfileRef = safe(state.HealthStatus), safe(state.ProfileRef)
		attrs = append(attrs, "state", state)
	}
	level := slog.LevelInfo
	if e.ErrorKind != "" || e.Outcome == "failed" {
		level = slog.LevelWarn
	}
	l.logger.Log(context.Background(), level, safe(e.Name), attrs...)
}

func (l *Logger) Start(version string) {
	if l == nil {
		return
	}
	l.logger.Info("session_started", "app_version", safe(version), "go_version", runtime.Version(), "os", runtime.GOOS, "arch", runtime.GOARCH, "schema_version", 1)
}

func (l *Logger) Transition(module string, state State) {
	if l == nil {
		return
	}
	// Copy optional pointers so state comparison does not depend on caller memory.
	if state.OBSConnected != nil {
		v := *state.OBSConnected
		state.OBSConnected = &v
	}
	l.mu.Lock()
	previous, exists := l.states[module]
	equal := exists && previous.Running == state.Running && previous.Healthy == state.Healthy && previous.Version == state.Version && previous.HealthStatus == state.HealthStatus && previous.ProfileRef == state.ProfileRef && previous.SourceState == state.SourceState && previous.OverlayState == state.OverlayState && previous.BrowserState == state.BrowserState && previous.SourceErrorCode == state.SourceErrorCode && previous.OverlayErrorCode == state.OverlayErrorCode && previous.OBSLastDisconnectCode == state.OBSLastDisconnectCode && previous.OBSState == state.OBSState && previous.ErrorKind == state.ErrorKind && equalBool(previous.OBSConnected, state.OBSConnected)
	l.states[module] = state
	l.mu.Unlock()
	if !equal {
		l.Record(Event{Name: "module_state_changed", Module: module, State: &state})
	}
}

func equalBool(a, b *bool) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }

// ErrorKind intentionally does not retain raw error text. Even server error
// messages can echo credentials or user-entered content.
func ErrorKind(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) {
		return "canceled"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	var n net.Error
	if errors.As(err, &n) && n.Timeout() {
		return "timeout"
	}
	var p *os.PathError
	if errors.As(err, &p) {
		return "filesystem_error"
	}
	text := strings.ToLower(err.Error())
	switch {
	case strings.Contains(text, "deadline exceeded"), strings.Contains(text, "timeout"):
		return "timeout"
	case strings.Contains(text, "connection refused"):
		return "connection_refused"
	case strings.Contains(text, "no such host"):
		return "dns_error"
	case strings.Contains(text, "invalid sip response"):
		return "invalid_response"
	case strings.Contains(text, "unavailable"):
		return "unavailable"
	}
	return "operation_error"
}

func (l *Logger) Directory() string {
	if l == nil {
		return ""
	}
	return l.dir
}
func (l *Logger) SessionID() string {
	if l == nil {
		return ""
	}
	return l.session
}
func (l *Logger) Warning() string {
	if l == nil {
		return "Session logging is unavailable."
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.err != nil {
		return "Session logging could not write or maintain its files. Troubleshooting logs may be incomplete."
	}
	return ""
}

func (l *Logger) openLocked() error {
	name := fmt.Sprintf("session-%s-%04d.jsonl", l.session, l.segment)
	f, err := os.OpenFile(filepath.Join(l.dir, name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	l.file, l.size = f, 0
	return nil
}

// Write writes directly to the OS file without a userspace buffer. A crash may
// lose data still in the OS cache; Close syncs orderly shutdowns.
func (l *Logger) Write(data []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.closed {
		return 0, os.ErrClosed
	}
	if l.file == nil {
		return 0, l.err
	}
	if l.size+int64(len(data)) > l.maxFile && l.size > 0 {
		if err := l.file.Close(); err != nil {
			l.err = err
			return 0, err
		}
		l.file = nil
		l.segment++
		if err := l.openLocked(); err != nil {
			l.err = err
			return 0, err
		}
	}
	n, err := l.file.Write(data)
	l.size += int64(n)
	if err == nil {
		err = l.pruneLocked()
	}
	if err != nil {
		l.err = err
		// Stop recording rather than growing without bound when retention or disk
		// writes fail. A new app session can retry after the filesystem is repaired.
		_ = l.file.Close()
		l.file = nil
	}
	return n, err
}

type retainedFile struct {
	path string
	info os.FileInfo
}

func (l *Logger) filesLocked() ([]retainedFile, error) {
	entries, err := os.ReadDir(l.dir)
	if err != nil {
		return nil, err
	}
	var files []retainedFile
	for _, entry := range entries {
		if !logName.MatchString(entry.Name()) || entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		if info.Mode().IsRegular() {
			files = append(files, retainedFile{filepath.Join(l.dir, entry.Name()), info})
		}
	}
	sort.Slice(files, func(i, j int) bool {
		if files[i].info.ModTime().Equal(files[j].info.ModTime()) {
			return files[i].path < files[j].path
		}
		return files[i].info.ModTime().Before(files[j].info.ModTime())
	})
	return files, nil
}

func (l *Logger) pruneLocked() error {
	files, err := l.filesLocked()
	if err != nil {
		return err
	}
	var total int64
	for _, f := range files {
		total += f.info.Size()
	}
	for _, f := range files {
		if l.file != nil && f.path == l.file.Name() {
			continue
		}
		if time.Since(f.info.ModTime()) <= l.retention && total <= l.maxTotal {
			continue
		}
		if err := os.Remove(f.path); err != nil {
			return err
		}
		total -= f.info.Size()
	}
	return nil
}

// Export includes only retained, recognized JSONL files, never arbitrary files
// in the directory or another app's data. The active session is included.
func (l *Logger) Export(destination string) (err error) {
	if l == nil {
		return errors.New("session logging unavailable")
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	root, err := filepath.EvalSymlinks(l.dir)
	if err != nil {
		return err
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(destination))
	if err != nil {
		return err
	}
	root, _ = filepath.Abs(root)
	parent, _ = filepath.Abs(parent)
	rel, err := filepath.Rel(root, parent)
	if err != nil || rel == "." || rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return errors.New("export must be outside the logs directory")
	}
	if info, statErr := os.Lstat(destination); statErr == nil && (!info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0) {
		return errors.New("export target must be a regular file")
	}
	files, err := l.filesLocked()
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return errors.New("no session logs available")
	}
	// Write an adjacent temporary file first so a failed export leaves any existing
	// destination intact. The save dialog owns overwrite confirmation.
	f, err := os.CreateTemp(parent, ".livepanel-export-*.zip")
	if err != nil {
		return err
	}
	temporary := f.Name()
	defer func() { _ = f.Close(); _ = os.Remove(temporary) }()
	archive := zip.NewWriter(f)
	for _, entry := range files {
		if err := copyEntry(archive, entry); err != nil {
			_ = archive.Close()
			return err
		}
	}
	if err := archive.Close(); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(temporary, destination)
}

func copyEntry(archive *zip.Writer, entry retainedFile) error {
	f, err := os.Open(entry.path)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if !os.SameFile(entry.info, info) {
		return errors.New("log changed during export")
	}
	w, err := archive.Create(filepath.Base(entry.path))
	if err != nil {
		return err
	}
	_, err = io.CopyN(w, f, entry.info.Size())
	return err
}

func (l *Logger) Close() error {
	if l == nil {
		return nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.closed {
		return nil
	}
	l.closed = true
	if l.file == nil {
		return l.err
	}
	syncErr := l.file.Sync()
	closeErr := l.file.Close()
	l.file = nil
	if syncErr != nil {
		l.err = syncErr
	} else if closeErr != nil {
		l.err = closeErr
	}
	return l.err
}

type actionKey struct{}

func WithActionID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, actionKey{}, id)
}
func ActionID(ctx context.Context) string { id, _ := ctx.Value(actionKey{}).(string); return id }

// Request logs writes once per action and read failures/recoveries only. Repeated
// failing polls do not flood the log, and healthy reads are omitted.
func (l *Logger) Request(ctx context.Context, module, method, path string, duration time.Duration, status int, err error) {
	if l == nil {
		return
	}
	kind := ErrorKind(err)
	if method == "GET" {
		key := module + ":" + path
		l.mu.Lock()
		previous, seen := l.readErrors[key]
		if l.readErrors == nil {
			l.readErrors = map[string]string{}
		}
		if len(l.readErrors) >= 512 {
			clear(l.readErrors)
		}
		l.readErrors[key] = kind
		l.mu.Unlock()
		if previous == kind || !seen && kind == "" {
			return
		}
	}
	l.Record(Event{Name: "sip_request_finished", Module: module, Operation: path, ActionID: ActionID(ctx), Outcome: outcomeForError(err), ErrorKind: kind, DurationMS: duration.Milliseconds(), HTTPStatus: status})
}
func outcomeForError(err error) string {
	if err != nil {
		return "failed"
	}
	return "success"
}

// OwnerOperation records state changes rather than repeating terminal operation
// metadata on every status poll. The cache is bounded for long app sessions.
func (l *Logger) OwnerOperation(e Event) {
	if l == nil {
		return
	}
	key := e.Module + ":" + e.OperationID + ":" + e.Name + ":" + e.Integration + ":" + e.DestinationRef + ":" + e.Operation
	signature := e.OwnerSessionID + ":" + e.Outcome + ":" + e.ErrorCode
	l.mu.Lock()
	if l.ownerStates == nil {
		l.ownerStates = map[string]string{}
	}
	previous := l.ownerStates[key]
	if len(l.ownerStates) >= 512 {
		clear(l.ownerStates)
	}
	l.ownerStates[key] = signature
	l.mu.Unlock()
	if previous != signature {
		l.Record(e)
	}
}
