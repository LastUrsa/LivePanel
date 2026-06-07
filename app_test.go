package main

import (
	"LivePanel/internal/modules"
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

func TestConfiguredTideReaderEndpointOverride(t *testing.T) {
	t.Setenv("LIVEPANEL_TIDEREADER_ENDPOINT", "http://127.0.0.1:49998")

	endpoints := configuredTideReaderEndpoints()
	if len(endpoints) != 1 || endpoints[0] != "http://127.0.0.1:49998" {
		t.Fatalf("unexpected configured endpoints: %+v", endpoints)
	}
}

func TestConfiguredTideReaderEndpointOverrideRejectsRemoteHosts(t *testing.T) {
	t.Setenv("LIVEPANEL_TIDEREADER_ENDPOINT", "http://example.com:47030")

	endpoints := configuredTideReaderEndpoints()
	if len(endpoints) != 10 || endpoints[0] != "http://127.0.0.1:47030" || endpoints[9] != "http://127.0.0.1:47039" {
		t.Fatalf("expected fallback local endpoints, got %+v", endpoints)
	}
}

func TestTideReaderExecutableCandidatesPreferLocalBuild(t *testing.T) {
	candidates := tideReaderExecutableCandidates()
	if len(candidates) < 1 {
		t.Fatal("expected executable candidates")
	}
	executable := "TideReader.Desktop"
	if runtime.GOOS == "windows" {
		executable = "TideReader.Desktop.exe"
	}
	want := filepath.Clean(filepath.Join("..", "TideReader", "build", "bin", executable))
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

	if len(modules) != 2 {
		t.Fatalf("expected two managed modules, got %+v", modules)
	}
	streamSignal := findModule(modules, "streamsignal")
	if streamSignal == nil || streamSignal.Name != "StreamSignal" || !streamSignal.Healthy {
		t.Fatalf("unexpected StreamSignal module from app refresh: %+v", modules)
	}
	listed := app.GetModules()
	listedStreamSignal := findModule(listed, "streamsignal")
	if len(listed) != 2 || listedStreamSignal == nil || listedStreamSignal.Endpoint != server.URL {
		t.Fatalf("expected refreshed module to be listed, got %+v", listed)
	}
}

func TestAppRefreshModulesUsesConfiguredTideReaderEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/app":
			_, _ = w.Write([]byte(`{"appId":"tidereader","name":"TideReader","version":"0.4.0","mode":"service","protocolVersion":"1.1"}`))
		case "/api/v1/health":
			_, _ = w.Write([]byte(`{"status":"ready","message":"TideReader operational"}`))
		case "/api/v1/capabilities":
			_, _ = w.Write([]byte(`{"supportsProfiles":true,"supportsStatusReporting":true}`))
		case "/api/v1/status":
			_, _ = w.Write([]byte(`{"state":"active","message":"Overlay active","healthy":true,"activeProfile":"Listening Party","activeProfileId":"listening-party"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv("LIVEPANEL_TIDEREADER_ENDPOINT", server.URL)

	app := NewApp()
	modules := app.RefreshModules()
	tideReader := findModule(modules, "tidereader")

	if tideReader == nil || tideReader.Name != "TideReader" || !tideReader.Healthy {
		t.Fatalf("unexpected TideReader module from app refresh: %+v", modules)
	}
	if tideReader.Endpoint != server.URL || tideReader.Status["activeProfile"] != "Listening Party" {
		t.Fatalf("expected TideReader SIP status to be retained, got %+v", tideReader)
	}
}

func TestGetTideReaderOverlaySnapshotFetchesLocalOverlayData(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/nowplaying.json":
			_, _ = w.Write([]byte(`{"status":"playing","title":"Mine Cart Madness","artist":"J-Trigger","album":"Konged Loose","artworkPath":"cover.jpg"}`))
		case "/overlay-settings.json":
			_, _ = w.Write([]byte(`{"imageSizePx":100,"showAppName":true}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv("LIVEPANEL_TIDEREADER_OVERLAY_URL", server.URL+"/overlay")

	app := NewApp()
	snapshot := app.GetTideReaderOverlaySnapshot()

	if !snapshot.Available || snapshot.OverlayURL != server.URL+"/overlay" {
		t.Fatalf("expected available overlay snapshot from configured local URL, got %+v", snapshot)
	}
	if snapshot.NowPlaying["title"] != "Mine Cart Madness" || snapshot.Settings["imageSizePx"] != float64(100) {
		t.Fatalf("expected now playing and settings payloads, got %+v", snapshot)
	}
	if snapshot.CoverURL != server.URL+"/cover.jpg" {
		t.Fatalf("expected local cover URL, got %q", snapshot.CoverURL)
	}
}

func TestTideReaderOverlayURLsRejectRemoteHosts(t *testing.T) {
	t.Setenv("LIVEPANEL_TIDEREADER_OVERLAY_URL", "http://example.com/overlay")

	app := NewApp()
	if got := app.tideReaderOverlayURL(); got != "http://127.0.0.1:17655/overlay" {
		t.Fatalf("expected remote overlay override to fall back to local default, got %q", got)
	}
	if got := overlaySiblingURL("http://127.0.0.1:17655/overlay", "http://example.com/cover.jpg"); got != "" {
		t.Fatalf("expected remote artwork URL to be rejected, got %q", got)
	}
}

func findModule(modules []modules.Module, id string) *modules.Module {
	for i := range modules {
		if modules[i].ID == id {
			return &modules[i]
		}
	}
	return nil
}
