package modules

import (
	"context"
	"errors"
	"testing"
)

type providerStub struct {
	id     string
	module Module
	err    error
}

func (p providerStub) ID() string {
	return p.id
}

func (p providerStub) Refresh(context.Context) (Module, error) {
	if p.err != nil {
		return p.module, p.err
	}
	return p.module, nil
}

type shutdownProviderStub struct {
	providerStub
	shutdowns *int
	err       error
}

func (p shutdownProviderStub) Shutdown(context.Context) error {
	(*p.shutdowns)++
	return p.err
}

func TestServiceRegistersModules(t *testing.T) {
	service := NewService(nil)
	service.Register(providerStub{
		id: "streamsignal",
		module: Module{
			ID:      "streamsignal",
			Name:    "StreamSignal",
			Version: "0.4.0",
			Healthy: true,
		},
	})

	modules, err := service.Refresh(context.Background())
	if err != nil {
		t.Fatalf("Refresh returned error: %v", err)
	}
	if len(modules) != 1 || modules[0].Name != "StreamSignal" {
		t.Fatalf("unexpected modules: %+v", modules)
	}
}

func TestServiceRefreshReplacesModuleStatus(t *testing.T) {
	service := NewService([]Provider{
		providerStub{
			id: "streamsignal",
			module: Module{
				ID:           "streamsignal",
				Name:         "StreamSignal",
				HealthStatus: "ready",
				Healthy:      true,
			},
		},
	})
	_, _ = service.Refresh(context.Background())

	service = NewService([]Provider{
		providerStub{
			id: "streamsignal",
			module: Module{
				ID:           "streamsignal",
				Name:         "StreamSignal",
				HealthStatus: "error",
				Healthy:      false,
			},
		},
	})

	modules, err := service.Refresh(context.Background())
	if err != nil {
		t.Fatalf("Refresh returned error: %v", err)
	}
	if modules[0].Healthy || modules[0].HealthStatus != "error" {
		t.Fatalf("expected updated unhealthy status, got %+v", modules[0])
	}
}

func TestServiceKeepsUnavailableModules(t *testing.T) {
	service := NewService([]Provider{
		providerStub{
			id:  "streamsignal",
			err: errors.New("unavailable"),
			module: Module{
				ID:           "streamsignal",
				Name:         "StreamSignal",
				HealthStatus: "offline",
			},
		},
	})

	modules, err := service.Refresh(context.Background())
	if err == nil {
		t.Fatal("expected refresh error")
	}
	if len(modules) != 1 || modules[0].HealthStatus != "offline" {
		t.Fatalf("expected offline module to remain visible, got %+v", modules)
	}
}

func TestServiceShutdownStopsManagedProviders(t *testing.T) {
	shutdowns := 0
	service := NewService([]Provider{
		providerStub{id: "static"},
		shutdownProviderStub{
			providerStub: providerStub{id: "streamsignal"},
			shutdowns:    &shutdowns,
		},
	})

	if err := service.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown returned error: %v", err)
	}
	if shutdowns != 1 {
		t.Fatalf("expected one managed provider shutdown, got %d", shutdowns)
	}
}
