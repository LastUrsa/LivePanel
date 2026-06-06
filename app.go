package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"LivePanel/internal/modules"
	"LivePanel/internal/sip"
)

type App struct {
	ctx       context.Context
	service   *modules.Service
	autoStart bool
}

func NewApp() *App {
	return &App{
		service:   modules.NewService(defaultProviders()),
		autoStart: true,
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if a.autoStart {
		_ = a.service.StartAutoStart(ctx)
		waitCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
		defer cancel()
		_, _ = pollModules(waitCtx, a.service, "")
		return
	}
	_, _ = a.service.Refresh(ctx)
}

func (a *App) shutdown(_ context.Context) {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	_ = a.service.Shutdown(shutdownCtx)
}

func (a *App) GetModules() []modules.Module {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.service.List(ctx)
}

func (a *App) RefreshModules() []modules.Module {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	modulesList, _ := a.service.Refresh(ctx)
	return modulesList
}

func (a *App) StartModule(id string) []modules.Module {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	if err := a.service.Start(ctx, id); err != nil {
		return modulesWithActionError(a.service.List(ctx), id, "Failed to Start: "+err.Error())
	}
	waitCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	modulesList, err := pollModules(waitCtx, a.service, id)
	if err != nil {
		return modulesWithActionError(modulesList, id, "Failed to Start: "+err.Error())
	}
	return modulesList
}

func (a *App) OpenModule(id string) []modules.Module {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	if err := a.service.Open(ctx, id); err != nil {
		return modulesWithActionError(a.service.List(ctx), id, err.Error())
	}
	modulesList, _ := a.service.Refresh(ctx)
	return modulesList
}

func (a *App) GetStreamSignalProfiles() sip.ProfilesResponse {
	client, err := a.streamSignalClient()
	if err != nil {
		return sip.ProfilesResponse{Profiles: []string{}}
	}
	ctx := a.requestContext()
	profiles, err := client.GetProfiles(ctx)
	if err != nil {
		return sip.ProfilesResponse{Profiles: []string{}}
	}
	return profiles
}

func (a *App) GetStreamSignalCurrentProfile() sip.CurrentProfileResponse {
	client, err := a.streamSignalClient()
	if err != nil {
		return sip.CurrentProfileResponse{}
	}
	current, err := client.GetCurrentProfile(a.requestContext())
	if err != nil {
		return sip.CurrentProfileResponse{}
	}
	return current
}

func (a *App) ActivateStreamSignalProfile(profile string) sip.ProfileActivationResponse {
	client, err := a.streamSignalClient()
	if err != nil {
		return sip.ProfileActivationResponse{}
	}
	activated, err := client.ActivateProfile(a.requestContext(), profile)
	if err != nil {
		return sip.ProfileActivationResponse{}
	}
	_, _ = a.service.Refresh(a.requestContext())
	return activated
}

func (a *App) AnnounceStreamSignal() sip.AnnounceResponse {
	client, err := a.streamSignalClient()
	if err != nil {
		return sip.AnnounceResponse{Success: false, Error: "StreamSignal unavailable."}
	}
	response, err := client.Announce(a.requestContext())
	if err != nil {
		return sip.AnnounceResponse{Success: false, Error: err.Error()}
	}
	return response
}

func (a *App) ConfirmStreamSignalAnnouncement(confirmationID string) sip.AnnounceResponse {
	client, err := a.streamSignalClient()
	if err != nil {
		return sip.AnnounceResponse{Success: false, Error: "StreamSignal unavailable."}
	}
	response, err := client.ConfirmAnnouncement(a.requestContext(), confirmationID)
	if err != nil {
		return sip.AnnounceResponse{Success: false, Error: err.Error()}
	}
	return response
}

func (a *App) GetStreamSignalAnnounceStatus() sip.AnnounceStatusResponse {
	client, err := a.streamSignalClient()
	if err != nil {
		return sip.AnnounceStatusResponse{}
	}
	status, err := client.GetAnnounceStatus(a.requestContext())
	if err != nil {
		return sip.AnnounceStatusResponse{}
	}
	return status
}

func (a *App) EndStreamSignalStream() sip.EndStreamResponse {
	client, err := a.streamSignalClient()
	if err != nil {
		return sip.EndStreamResponse{Success: false, Error: "StreamSignal unavailable."}
	}
	response, err := client.EndStream(a.requestContext())
	if err != nil {
		return sip.EndStreamResponse{Success: false, Error: err.Error()}
	}
	return response
}

func (a *App) GetStreamSignalEndStreamStatus() sip.EndStreamStatusResponse {
	client, err := a.streamSignalClient()
	if err != nil {
		return sip.EndStreamStatusResponse{}
	}
	status, err := client.GetEndStreamStatus(a.requestContext())
	if err != nil {
		return sip.EndStreamStatusResponse{}
	}
	return status
}

func (a *App) GetAutoStartManagedModules() bool {
	return a.autoStart
}

func (a *App) SetAutoStartManagedModules(enabled bool) bool {
	a.autoStart = enabled
	return a.autoStart
}

func defaultProviders() []modules.Provider {
	entry := modules.RegistryEntry{
		ID:         "streamsignal",
		Name:       "StreamSignal",
		Executable: configuredStreamSignalExecutable(),
		Endpoints:  configuredStreamSignalEndpoints(),
		AutoStart:  true,
	}
	launcher := modules.NewOwnedProcessLauncher()
	return []modules.Provider{
		modules.NewManagedSIPProvider(entry, launcher, 900*time.Millisecond),
	}
}

func configuredStreamSignalExecutable() string {
	if configured := strings.TrimSpace(os.Getenv("LIVEPANEL_STREAMSIGNAL_EXECUTABLE")); configured != "" {
		return configured
	}

	for _, candidate := range streamSignalExecutableCandidates() {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return "StreamSignal.exe"
}

func streamSignalExecutableCandidates() []string {
	candidates := localStreamSignalBuildCandidates()
	for _, base := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LocalAppData")} {
		base = strings.TrimSpace(base)
		if base == "" {
			continue
		}
		candidates = append(candidates,
			filepath.Join(base, "DRDohr", "StreamSignal", "StreamSignal.exe"),
			filepath.Join(base, "StreamSignal", "StreamSignal.exe"),
			filepath.Join(base, "Programs", "StreamSignal", "StreamSignal.exe"),
		)
	}
	return candidates
}

func localStreamSignalBuildCandidates() []string {
	names := []string{"StreamSignal-dev", "StreamSignal", "StreamSignal.exe"}
	if runtime.GOOS == "windows" {
		names = []string{"StreamSignal.exe"}
	}

	candidates := make([]string, 0, len(names)*2)
	for _, name := range names {
		candidates = append(candidates, filepath.Clean(filepath.Join("..", "StreamSignal", "build", "bin", name)))
	}
	if executable, err := os.Executable(); err == nil {
		binDir := filepath.Dir(executable)
		for _, name := range names {
			candidates = append(candidates, filepath.Clean(filepath.Join(binDir, "..", "..", "..", "StreamSignal", "build", "bin", name)))
		}
	}
	return candidates
}

func configuredStreamSignalEndpoints() []string {
	if configured := strings.TrimSpace(os.Getenv("LIVEPANEL_STREAMSIGNAL_ENDPOINT")); configured != "" {
		if sip.IsLocalEndpoint(configured) {
			return []string{configured}
		}
	}

	endpoints := make([]string, 0, 10)
	for port := 47020; port <= 47029; port++ {
		endpoints = append(endpoints, sip.LocalEndpoint(port))
	}
	return endpoints
}

func pollModules(ctx context.Context, service *modules.Service, targetID string) ([]modules.Module, error) {
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()

	var modulesList []modules.Module
	var lastErr error
	for {
		modulesList, lastErr = service.Refresh(ctx)
		if targetID != "" {
			for _, module := range modulesList {
				if module.Running && module.ID == targetID {
					return modulesList, nil
				}
			}
		} else if autoStartModulesAvailable(modulesList) {
			return modulesList, nil
		}

		select {
		case <-ctx.Done():
			if lastErr != nil {
				return modulesList, lastErr
			}
			return modulesList, ctx.Err()
		case <-ticker.C:
		}
	}
}

func autoStartModulesAvailable(modulesList []modules.Module) bool {
	for _, module := range modulesList {
		if !module.AutoStart || !module.Installed {
			continue
		}
		if !module.Running {
			return false
		}
	}
	return true
}

func modulesWithActionError(modulesList []modules.Module, id string, message string) []modules.Module {
	out := append([]modules.Module(nil), modulesList...)
	for i := range out {
		if out[i].ID != id {
			continue
		}
		out[i].Error = message
		out[i].HealthStatus = "failed"
		out[i].HealthText = "Failed to Start"
	}
	return out
}

func (a *App) requestContext() context.Context {
	ctx := a.ctx
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func (a *App) streamSignalClient() (*sip.Client, error) {
	ctx := a.requestContext()
	modulesList, _ := a.service.Refresh(ctx)
	for _, module := range modulesList {
		if module.ID != "streamsignal" || !module.Running || strings.TrimSpace(module.Endpoint) == "" {
			continue
		}
		return sip.NewClient(module.Endpoint, 1200*time.Millisecond), nil
	}
	return nil, fmt.Errorf("StreamSignal unavailable")
}
