package main

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"LivePanel/internal/modules"
	"LivePanel/internal/sessionlog"
	"LivePanel/internal/sip"
)

func appLogRecords(t *testing.T, directory string) []map[string]any {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(directory, "*.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	var records []map[string]any
	for _, path := range files {
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
			records = append(records, record)
		}
		f.Close()
	}
	return records
}

func TestActionTimelineCorrelatesRequestsWithoutSensitiveContent(t *testing.T) {
	const secret = "private-announcement-token"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/app":
			io.WriteString(w, `{"name":"StreamSignal","version":"0.5.1","protocolVersion":1}`)
		case "/api/v1/health":
			io.WriteString(w, `{"status":"ready"}`)
		case "/api/v1/capabilities":
			io.WriteString(w, `{}`)
		case "/api/v1/status":
			io.WriteString(w, `{"state":"idle","obsConnected":true,"obsSummary":"Connected: private-scene"}`)
		case "/api/v1/announce":
			body, _ := io.ReadAll(r.Body)
			if !strings.Contains(string(body), secret) {
				t.Error("action body not sent")
			}
			io.WriteString(w, `{"success":false,"error":"password=private-announcement-token"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	dir := t.TempDir()
	l := sessionlog.New(dir)
	defer l.Close()
	a := &App{ctx: context.Background(), logs: l, service: modules.NewService([]modules.Provider{modules.NewSIPProvider("streamsignal", []string{server.URL}, time.Second)})}
	a.service.SetObserver(a.observeModule)
	response := a.AnnounceStreamSignal([]sip.UpdateAnnouncementFieldRequest{{ID: "message", Value: secret}})
	if response.Success {
		t.Fatal("expected returned failure")
	}
	entries := appLogRecords(t, dir)
	ids := map[string]string{}
	for _, entry := range entries {
		if name, ok := entry["msg"].(string); ok && entry["action_id"] != "" {
			ids[name], _ = entry["action_id"].(string)
		}
	}
	if ids["action_started"] == "" || ids["action_started"] != ids["action_finished"] || ids["action_started"] != ids["sip_request_finished"] {
		t.Fatalf("missing correlation: %v", ids)
	}
	data, _ := json.Marshal(entries)
	for _, sensitive := range []string{secret, "password", "private-scene"} {
		if strings.Contains(string(data), sensitive) {
			t.Fatalf("log leaked %s", sensitive)
		}
	}
	a.RefreshModules()
	if got := len(appLogRecords(t, dir)); got != len(entries) {
		t.Fatalf("unchanged refresh added %d records", got-len(entries))
	}
}

func TestUnavailableActionIsRecorded(t *testing.T) {
	dir := t.TempDir()
	l := sessionlog.New(dir)
	defer l.Close()
	a := &App{logs: l, service: modules.NewService(nil)}
	if a.EndStreamSignalStream().Success {
		t.Fatal("expected missing module failure")
	}
	entries := appLogRecords(t, dir)
	if len(entries) != 2 || entries[1]["outcome"] != "failed" || entries[1]["error_kind"] != "unavailable" {
		t.Fatalf("missing failure timeline: %v", entries)
	}
}

func TestLogDirectoryAndEarlyConfigurationFailure(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LIVEPANEL_LOG_DIR", dir)
	config := filepath.Join(t.TempDir(), "invalid.json")
	os.WriteFile(config, []byte("not JSON"), 0o600)
	t.Setenv("LIVEPANEL_CONFIG_PATH", config)
	a := NewApp()
	a.initSessionLogging()
	defer a.logs.Close()
	if a.GetSessionLogWarning() != "" {
		t.Fatal(a.GetSessionLogWarning())
	}
	entries := appLogRecords(t, dir)
	if len(entries) != 2 || entries[0]["msg"] != "session_started" || entries[1]["msg"] != "configuration_load_failed" {
		t.Fatalf("missing early configuration failure: %v", entries)
	}
}

func TestPublishingTimeoutIsLoggedAsUnknownOutcome(t *testing.T) {
	dir := t.TempDir()
	l := sessionlog.New(dir)
	defer l.Close()
	a := &App{logs: l}
	_, finish := a.beginAction("streamsignal", "announce")
	finish(false, "context deadline exceeded", false)
	entries := appLogRecords(t, dir)
	if len(entries) != 2 || entries[1]["outcome"] != "unknown" || entries[1]["error_kind"] != "timeout" {
		t.Fatalf("incorrect timeout outcome: %v", entries)
	}
}

func TestOwnerDestinationMetadataIsSafeAndDeduplicated(t *testing.T) {
	dir := t.TempDir()
	logger := sessionlog.New(dir)
	defer logger.Close()
	app := &App{logs: logger}
	published := true
	event := sip.RequestEvent{Context: context.Background(), Method: "GET", Path: "/api/v1/announce/status", RequestID: "request", SessionID: "owner", OperationID: "operation", Outcome: "partial", Results: []sip.DestinationResult{{DestinationID: "private-destination-name", Platform: "bluesky", State: "failed", Phase: "live_now", ErrorCode: "FOLLOW_UP_FAILED", Message: "password=secret", Published: &published}}}
	for i := 0; i < 10; i++ {
		app.observeRequest("streamsignal")(event)
	}
	entries := appLogRecords(t, dir)
	if len(entries) != 2 {
		t.Fatalf("poll metadata flooded log: %d", len(entries))
	}
	data, _ := json.Marshal(entries)
	if strings.Contains(string(data), "private-destination-name") || strings.Contains(string(data), "secret") {
		t.Fatal("diagnostic metadata leaked content")
	}
	if entries[1]["published"] != true {
		t.Fatal("confirmed publication lost")
	}
}

func TestProducerDependencyTimestampsDoNotFloodTheLog(t *testing.T) {
	dir := t.TempDir()
	logger := sessionlog.New(dir)
	defer logger.Close()
	app := &App{logs: logger}
	source := map[string]any{"state": "ready", "observedAt": "2026-11-07T00:00:00Z", "errorCode": "", "title": "private-title"}
	module := modules.Module{ID: "tidereader", Running: true, Healthy: true, Status: map[string]any{"dependencies": map[string]any{"source": source, "overlay": map[string]any{"state": "ready"}}}}
	app.observeModule(module)
	source["observedAt"] = "2026-11-07T00:01:00Z"
	app.observeModule(module)
	if len(appLogRecords(t, dir)) != 1 {
		t.Fatal("producer heartbeats flooded the log")
	}
	source["state"] = "stale"
	app.observeModule(module)
	entries := appLogRecords(t, dir)
	if len(entries) != 2 {
		t.Fatal("source transition was lost")
	}
	data, _ := json.Marshal(entries)
	if strings.Contains(string(data), "private-title") {
		t.Fatal("dependency content leaked")
	}
}

func TestOBSNotRunningTransitionIsLogged(t *testing.T) {
	dir := t.TempDir()
	l := sessionlog.New(dir)
	a := &App{logs: l}
	a.observeModule(modules.Module{ID: "tuberswitch", Running: true, Healthy: true, Status: map[string]any{"obsConnected": false, "obsConnectionState": "not_running"}})
	l.Close()
	records := appLogRecords(t, dir)
	for _, record := range records {
		state, _ := record["state"].(map[string]any)
		if state["obs_state"] == "not_running" && state["obs_connected"] == false {
			return
		}
	}
	t.Fatal("missing OBS not_running transition")
}
