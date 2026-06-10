package main

import (
	"LivePanel/internal/modules"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
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

func TestConfiguredTuberSwitchEndpointOverride(t *testing.T) {
	t.Setenv("LIVEPANEL_TUBERSWITCH_ENDPOINT", "http://127.0.0.1:49997")

	endpoints := configuredTuberSwitchEndpoints()
	if len(endpoints) != 1 || endpoints[0] != "http://127.0.0.1:49997" {
		t.Fatalf("unexpected configured endpoints: %+v", endpoints)
	}
}

func TestConfiguredTuberSwitchEndpointOverrideRejectsRemoteHosts(t *testing.T) {
	t.Setenv("LIVEPANEL_TUBERSWITCH_ENDPOINT", "http://example.com:47040")

	endpoints := configuredTuberSwitchEndpoints()
	if len(endpoints) != 10 || endpoints[0] != "http://127.0.0.1:47040" || endpoints[9] != "http://127.0.0.1:47049" {
		t.Fatalf("expected fallback local endpoints, got %+v", endpoints)
	}
}

func TestTuberSwitchExecutableCandidatesPreferLocalBuild(t *testing.T) {
	candidates := tuberSwitchExecutableCandidates()
	if len(candidates) < 1 {
		t.Fatal("expected executable candidates")
	}
	executable := "TuberSwitch-dev"
	if runtime.GOOS == "windows" {
		executable = "TuberSwitch.exe"
	}
	want := filepath.Clean(filepath.Join("..", "TuberSwitch", "build", "bin", executable))
	if candidates[0] != want {
		t.Fatalf("expected first candidate %q, got %q", want, candidates[0])
	}
}

func TestModuleExecutableConfigUsesSavedPathAfterEnvironment(t *testing.T) {
	tmp := t.TempDir()
	savedPath := filepath.Join(tmp, "StreamSignal.exe")
	envPath := filepath.Join(tmp, "StreamSignal-env.exe")
	if err := os.WriteFile(savedPath, []byte("stub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(envPath, []byte("stub"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("LIVEPANEL_STREAMSIGNAL_EXECUTABLE", envPath)

	definition, _ := moduleDefinitionByID("streamsignal")
	config := moduleExecutableConfig(definition, ModuleConfig{ExecutablePath: savedPath})

	if config.ResolvedPath != envPath || config.PathSource != "environment" || !config.EnvLocked {
		t.Fatalf("expected environment executable to win, got %+v", config)
	}
}

func TestModuleExecutableConfigUsesSavedPath(t *testing.T) {
	tmp := t.TempDir()
	savedPath := filepath.Join(tmp, "TideReader.Desktop.exe")
	if err := os.WriteFile(savedPath, []byte("stub"), 0o755); err != nil {
		t.Fatal(err)
	}

	definition, _ := moduleDefinitionByID("tidereader")
	config := moduleExecutableConfig(definition, ModuleConfig{ExecutablePath: savedPath})

	if config.ResolvedPath != savedPath || config.PathSource != "configured" || !config.Valid {
		t.Fatalf("expected saved executable path to be used, got %+v", config)
	}
}

func TestSetModuleExecutablePathPersistsAndClears(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	app := NewApp()
	app.configs = NewConfigStoreAt(configPath)
	app.config = AppConfig{Modules: map[string]ModuleConfig{}}

	app.SetModuleExecutablePath("tidereader", "C:/Tools/TideReader.Desktop.exe")
	loaded, err := app.configs.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if loaded.Modules["tidereader"].ExecutablePath != "C:/Tools/TideReader.Desktop.exe" {
		t.Fatalf("expected saved TideReader executable path, got %+v", loaded)
	}

	app.ClearModuleExecutablePath("tidereader")
	loaded, err = app.configs.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if _, ok := loaded.Modules["tidereader"]; ok {
		t.Fatalf("expected TideReader override to be cleared, got %+v", loaded)
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

	if len(modules) != 3 {
		t.Fatalf("expected three managed modules, got %+v", modules)
	}
	streamSignal := findModule(modules, "streamsignal")
	if streamSignal == nil || streamSignal.Name != "StreamSignal" || !streamSignal.Healthy {
		t.Fatalf("unexpected StreamSignal module from app refresh: %+v", modules)
	}
	listed := app.GetModules()
	listedStreamSignal := findModule(listed, "streamsignal")
	if len(listed) != 3 || listedStreamSignal == nil || listedStreamSignal.Endpoint != server.URL {
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

func TestAppRefreshModulesUsesConfiguredTuberSwitchEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/app":
			_, _ = w.Write([]byte(`{"appId":"tuberswitch","name":"TuberSwitch","version":"0.5.0","mode":"service","protocolVersion":"1.1"}`))
		case "/api/v1/health":
			_, _ = w.Write([]byte(`{"status":"ready","message":"TuberSwitch operational"}`))
		case "/api/v1/capabilities":
			_, _ = w.Write([]byte(`{"supportsProfiles":true,"supportsStatusReporting":true}`))
		case "/api/v1/status":
			_, _ = w.Write([]byte(`{"state":"ready","message":"Profile active","healthy":true,"activeProfile":"Gaming Stream","activeProfileId":"gaming","activeMode":"3d"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv("LIVEPANEL_TUBERSWITCH_ENDPOINT", server.URL)

	app := NewApp()
	modules := app.RefreshModules()
	tuberSwitch := findModule(modules, "tuberswitch")

	if tuberSwitch == nil || tuberSwitch.Name != "TuberSwitch" || !tuberSwitch.Healthy {
		t.Fatalf("unexpected TuberSwitch module from app refresh: %+v", modules)
	}
	if tuberSwitch.Endpoint != server.URL || tuberSwitch.Status["activeProfile"] != "Gaming Stream" || tuberSwitch.Status["activeMode"] != "3d" {
		t.Fatalf("expected TuberSwitch SIP status to be retained, got %+v", tuberSwitch)
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

func TestFetchLocalJSONLimitsOverlayResponseSize(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"payload":"` + strings.Repeat("x", (1<<20)+1) + `"}`))
	}))
	defer server.Close()

	var payload map[string]interface{}
	if err := fetchLocalJSON(t.Context(), server.URL, &payload); err == nil {
		t.Fatal("expected oversized overlay JSON to fail")
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
