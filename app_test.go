package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"testing"
)

func TestConfiguredStreamSignalEndpointOverride(t *testing.T) {
	t.Setenv("LIVEPANEL_STREAMSIGNAL_ENDPOINT", "http://127.0.0.1:49999")

	endpoints := configuredStreamSignalEndpoints()
	if len(endpoints) != 1 || endpoints[0] != "http://127.0.0.1:49999" {
		t.Fatalf("unexpected configured endpoints: %+v", endpoints)
	}
}

func TestConfiguredStreamSignalEndpointOverrideRejectsRemoteHosts(t *testing.T) {
	t.Setenv("LIVEPANEL_STREAMSIGNAL_ENDPOINT", "http://example.com:47020")

	endpoints := configuredStreamSignalEndpoints()
	if len(endpoints) != 10 || endpoints[0] != "http://127.0.0.1:47020" || endpoints[9] != "http://127.0.0.1:47029" {
		t.Fatalf("expected fallback local endpoints, got %+v", endpoints)
	}
}

func TestStreamSignalExecutableCandidatesPreferLocalBuild(t *testing.T) {
	candidates := streamSignalExecutableCandidates()
	if len(candidates) < 1 {
		t.Fatal("expected executable candidates")
	}
	executable := "StreamSignal-dev"
	if runtime.GOOS == "windows" {
		executable = "StreamSignal.exe"
	}
	want := filepath.Clean(filepath.Join("..", "StreamSignal", "build", "bin", executable))
	if candidates[0] != want {
		t.Fatalf("expected first candidate %q, got %q", want, candidates[0])
	}
}

func TestAppRefreshModulesUsesConfiguredStreamSignalEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/app":
			_, _ = w.Write([]byte(`{"appId":"streamsignal","name":"StreamSignal","version":"0.3.1","mode":"standalone","protocolVersion":"1.0"}`))
		case "/api/v1/health":
			_, _ = w.Write([]byte(`{"status":"ready","message":"StreamSignal is ready for local SIP participation."}`))
		case "/api/v1/capabilities":
			_, _ = w.Write([]byte(`{"supportsProfiles":true,"supportsStatusReporting":true,"supportsAnnouncements":true}`))
		case "/api/v1/status":
			_, _ = w.Write([]byte(`{"state":"idle","message":"Ready for announcement setup."}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv("LIVEPANEL_STREAMSIGNAL_ENDPOINT", server.URL)

	app := NewApp()
	modules := app.RefreshModules()

	if len(modules) != 1 {
		t.Fatalf("expected one detected module, got %+v", modules)
	}
	if modules[0].Name != "StreamSignal" || !modules[0].Healthy {
		t.Fatalf("unexpected module from app refresh: %+v", modules[0])
	}
	if listed := app.GetModules(); len(listed) != 1 || listed[0].Endpoint != server.URL {
		t.Fatalf("expected refreshed module to be listed, got %+v", listed)
	}
}
