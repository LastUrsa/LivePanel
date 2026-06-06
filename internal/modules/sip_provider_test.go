package modules

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type launcherStub struct {
	path        string
	started     []string
	startErr    error
	shutdown    bool
	shutdownErr error
}

func (l *launcherStub) Resolve(string) (string, bool) {
	if l.path == "" {
		return "", false
	}
	return l.path, true
}

func (l *launcherStub) Start(_ context.Context, executable string, args ...string) error {
	l.started = append([]string{executable}, args...)
	return l.startErr
}

func (l *launcherStub) Shutdown(context.Context) error {
	l.shutdown = true
	return l.shutdownErr
}

func TestSIPProviderMapsReadySnapshotToModule(t *testing.T) {
	server := httptest.NewServer(streamSignalContractHandler())
	defer server.Close()

	module, err := NewSIPProvider("streamsignal", []string{server.URL}, time.Second).Refresh(context.Background())
	if err != nil {
		t.Fatalf("Refresh returned error: %v", err)
	}

	if module.ID != "streamsignal" || module.Name != "StreamSignal" || module.Version != "0.3.1" || module.Mode != "standalone" {
		t.Fatalf("unexpected module identity: %+v", module)
	}
	if !module.Healthy || module.HealthStatus != "ready" {
		t.Fatalf("expected healthy ready module, got %+v", module)
	}
	if module.Status["state"] != "idle" {
		t.Fatalf("expected raw SIP status to be retained, got %+v", module.Status)
	}
}

func TestSIPProviderTreatsDegradedAsDetectedModule(t *testing.T) {
	server := httptest.NewServer(streamSignalContractHandler(func(path string) string {
		if path == "/api/v1/health" {
			return `{"status":"degraded","message":"Pending Live Now recovery sessions need attention."}`
		}
		if path == "/api/v1/status" {
			return `{"state":"warning","message":"Pending Live Now recovery sessions need attention."}`
		}
		return ""
	}))
	defer server.Close()

	module, err := NewSIPProvider("streamsignal", []string{server.URL}, time.Second).Refresh(context.Background())
	if err != nil {
		t.Fatalf("Refresh returned error: %v", err)
	}
	if !module.Healthy || module.HealthStatus != "degraded" || module.Status["state"] != "warning" {
		t.Fatalf("expected degraded module to remain detected, got %+v", module)
	}
}

func TestSIPProviderFallsBackAcrossConfiguredEndpoints(t *testing.T) {
	server := httptest.NewServer(streamSignalContractHandler())
	defer server.Close()

	module, err := NewSIPProvider("streamsignal", []string{"http://127.0.0.1:1", server.URL}, 20*time.Millisecond).Refresh(context.Background())
	if err != nil {
		t.Fatalf("Refresh returned error: %v", err)
	}
	if module.Endpoint != server.URL {
		t.Fatalf("expected provider to use fallback endpoint %q, got %q", server.URL, module.Endpoint)
	}
}

func TestSIPProviderRejectsRemoteEndpoints(t *testing.T) {
	module, err := NewSIPProvider("streamsignal", []string{"http://example.com:47020"}, time.Second).Refresh(context.Background())
	if err == nil {
		t.Fatal("expected remote endpoint error")
	}
	if module.Running || module.Error == "" {
		t.Fatalf("expected offline module with endpoint error, got %+v", module)
	}
}

func TestSIPProviderReportsUnhealthyErrorModules(t *testing.T) {
	server := httptest.NewServer(streamSignalContractHandler(func(path string) string {
		if path == "/api/v1/health" {
			return `{"status":"error","message":"Announcement profiles are unavailable."}`
		}
		if path == "/api/v1/status" {
			return `{"state":"error","message":"Announcement profiles are unavailable."}`
		}
		return ""
	}))
	defer server.Close()

	module, err := NewSIPProvider("streamsignal", []string{server.URL}, time.Second).Refresh(context.Background())
	if err != nil {
		t.Fatalf("Refresh returned error: %v", err)
	}
	if module.Healthy || module.HealthStatus != "error" || module.Status["state"] != "error" {
		t.Fatalf("expected unhealthy error module, got %+v", module)
	}
}

func TestManagedSIPProviderReportsInstalledOfflineModule(t *testing.T) {
	launcher := &launcherStub{path: "/apps/StreamSignal.exe"}
	provider := NewManagedSIPProvider(RegistryEntry{
		ID:         "streamsignal",
		Name:       "StreamSignal",
		Executable: "StreamSignal.exe",
		Endpoints:  []string{"http://127.0.0.1:1"},
		AutoStart:  true,
	}, launcher, 20*time.Millisecond)

	module, err := provider.Refresh(context.Background())
	if err == nil {
		t.Fatal("expected refresh error")
	}
	if !module.Installed || module.Running || module.HealthStatus != "offline" || module.Executable != "/apps/StreamSignal.exe" {
		t.Fatalf("expected installed offline module, got %+v", module)
	}
}

func TestManagedSIPProviderStartsAndOpensWithStreamSignalFlags(t *testing.T) {
	launcher := &launcherStub{path: "/apps/StreamSignal.exe"}
	provider := NewManagedSIPProvider(RegistryEntry{
		ID:         "streamsignal",
		Name:       "StreamSignal",
		Executable: "StreamSignal.exe",
	}, launcher, time.Second)

	if err := provider.Start(context.Background()); err != nil {
		t.Fatalf("Start returned error: %v", err)
	}
	if len(launcher.started) != 2 || launcher.started[0] != "/apps/StreamSignal.exe" || launcher.started[1] != "--service" {
		t.Fatalf("expected --service launch, got %+v", launcher.started)
	}

	if err := provider.Open(context.Background()); err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	if len(launcher.started) != 2 || launcher.started[1] != "--show" {
		t.Fatalf("expected --show launch, got %+v", launcher.started)
	}
}

func TestManagedSIPProviderReturnsStartErrors(t *testing.T) {
	launcher := &launcherStub{path: "/apps/StreamSignal.exe", startErr: errors.New("blocked")}
	provider := NewManagedSIPProvider(RegistryEntry{
		ID:         "streamsignal",
		Name:       "StreamSignal",
		Executable: "StreamSignal.exe",
	}, launcher, time.Second)

	if err := provider.Start(context.Background()); err == nil {
		t.Fatal("expected start error")
	}
}

func TestManagedSIPProviderShutdownStopsOwnedLauncher(t *testing.T) {
	launcher := &launcherStub{path: "/apps/StreamSignal.exe"}
	provider := NewManagedSIPProvider(RegistryEntry{
		ID:         "streamsignal",
		Name:       "StreamSignal",
		Executable: "StreamSignal.exe",
	}, launcher, time.Second)

	if err := provider.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown returned error: %v", err)
	}
	if !launcher.shutdown {
		t.Fatal("expected provider to shut down launcher")
	}
}

func streamSignalContractHandler(overrides ...func(string) string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		for _, override := range overrides {
			if body := override(r.URL.Path); body != "" {
				_, _ = w.Write([]byte(body))
				return
			}
		}
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
	})
}
