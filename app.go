package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"LivePanel/internal/modules"
	"LivePanel/internal/sip"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx       context.Context
	service   *modules.Service
	autoStart bool
	config    AppConfig
	configs   *ConfigStore
}

type TideReaderOverlaySnapshot struct {
	Available  bool                   `json:"available"`
	NowPlaying map[string]interface{} `json:"nowPlaying"`
	Settings   map[string]interface{} `json:"settings"`
	OverlayURL string                 `json:"overlayUrl"`
	CoverURL   string                 `json:"coverUrl"`
	Error      string                 `json:"error,omitempty"`
}

type ModuleExecutableConfig struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	ExecutablePath string `json:"executablePath"`
	ResolvedPath   string `json:"resolvedPath"`
	PathSource     string `json:"pathSource"`
	EnvironmentKey string `json:"environmentKey"`
	EnvLocked      bool   `json:"envLocked"`
	Valid          bool   `json:"valid"`
	Error          string `json:"error,omitempty"`
}

type moduleDefinition struct {
	ID             string
	Name           string
	ExecutableEnv  string
	EndpointEnv    string
	ExecutableName string
	Endpoints      []string
	Candidates     func() []string
}

func NewApp() *App {
	store := NewConfigStore()
	config, _ := store.Load()
	return &App{
		service:   modules.NewService(defaultProviders(config.Modules)),
		autoStart: true,
		config:    config,
		configs:   store,
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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
	client, err := a.sipClientForModule("streamsignal", "StreamSignal")
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
	client, err := a.sipClientForModule("streamsignal", "StreamSignal")
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
	client, err := a.sipClientForModule("streamsignal", "StreamSignal")
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

func (a *App) GetTideReaderProfiles() sip.ProfilesResponse {
	client, err := a.sipClientForModule("tidereader", "TideReader")
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

func (a *App) GetTideReaderCurrentProfile() sip.CurrentProfileResponse {
	client, err := a.sipClientForModule("tidereader", "TideReader")
	if err != nil {
		return sip.CurrentProfileResponse{}
	}
	current, err := client.GetCurrentProfile(a.requestContext())
	if err != nil {
		return sip.CurrentProfileResponse{}
	}
	return current
}

func (a *App) ActivateTideReaderProfile(profile string) sip.ProfileActivationResponse {
	client, err := a.sipClientForModule("tidereader", "TideReader")
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

func (a *App) GetTideReaderOverlaySnapshot() TideReaderOverlaySnapshot {
	overlayURL := a.tideReaderOverlayURL()
	if overlayURL == "" {
		return TideReaderOverlaySnapshot{Available: false, NowPlaying: map[string]interface{}{}, Settings: map[string]interface{}{}, Error: "TideReader overlay unavailable."}
	}

	ctx := a.requestContext()
	var nowPlaying map[string]interface{}
	if err := fetchLocalJSON(ctx, overlaySiblingURL(overlayURL, "nowplaying.json"), &nowPlaying); err != nil {
		return TideReaderOverlaySnapshot{Available: false, NowPlaying: map[string]interface{}{}, Settings: map[string]interface{}{}, Error: err.Error()}
	}

	var settings map[string]interface{}
	if err := fetchLocalJSON(ctx, overlaySiblingURL(overlayURL, "overlay-settings.json"), &settings); err != nil {
		settings = map[string]interface{}{}
	}

	return TideReaderOverlaySnapshot{
		Available:  true,
		NowPlaying: nowPlaying,
		Settings:   settings,
		OverlayURL: overlayURL,
		CoverURL:   overlaySiblingURL(overlayURL, stringValue(nowPlaying["artworkPath"])),
	}
}

func (a *App) AnnounceStreamSignal() sip.AnnounceResponse {
	client, err := a.sipClientForModule("streamsignal", "StreamSignal")
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
	client, err := a.sipClientForModule("streamsignal", "StreamSignal")
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
	client, err := a.sipClientForModule("streamsignal", "StreamSignal")
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
	client, err := a.sipClientForModule("streamsignal", "StreamSignal")
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
	client, err := a.sipClientForModule("streamsignal", "StreamSignal")
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

func (a *App) GetModuleExecutableConfigs() []ModuleExecutableConfig {
	return moduleExecutableConfigs(a.config.Modules)
}

func (a *App) SetModuleExecutablePath(id string, executablePath string) []ModuleExecutableConfig {
	if !knownModuleID(id) {
		return a.GetModuleExecutableConfigs()
	}
	executablePath = strings.TrimSpace(executablePath)
	if a.config.Modules == nil {
		a.config.Modules = map[string]ModuleConfig{}
	}
	if executablePath == "" {
		delete(a.config.Modules, id)
	} else {
		a.config.Modules[id] = ModuleConfig{ExecutablePath: executablePath}
	}
	_ = a.configs.Save(a.config)
	a.rebuildProviders()
	return a.GetModuleExecutableConfigs()
}

func (a *App) ClearModuleExecutablePath(id string) []ModuleExecutableConfig {
	return a.SetModuleExecutablePath(id, "")
}

func (a *App) PickModuleExecutablePath(id string) string {
	definition, ok := moduleDefinitionByID(id)
	if !ok || a.ctx == nil {
		return ""
	}
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select " + definition.Name + " executable",
	})
	if err != nil {
		return ""
	}
	return path
}

func (a *App) rebuildProviders() {
	a.service.SetProviders(defaultProviders(a.config.Modules))
}

func defaultProviders(configs ...map[string]ModuleConfig) []modules.Provider {
	moduleConfigs := map[string]ModuleConfig{}
	if len(configs) > 0 && configs[0] != nil {
		moduleConfigs = configs[0]
	}
	providers := make([]modules.Provider, 0, len(moduleDefinitions()))
	for _, definition := range moduleDefinitions() {
		entry := modules.RegistryEntry{
			ID:         definition.ID,
			Name:       definition.Name,
			Executable: executableForDefinition(definition, moduleConfigs[definition.ID]),
			Endpoints:  endpointsForDefinition(definition),
			AutoStart:  true,
		}
		providers = append(providers, modules.NewManagedSIPProvider(entry, modules.NewOwnedProcessLauncher(), 900*time.Millisecond))
	}
	return providers
}

func moduleDefinitions() []moduleDefinition {
	return []moduleDefinition{
		{
			ID:             "streamsignal",
			Name:           "StreamSignal",
			ExecutableEnv:  "LIVEPANEL_STREAMSIGNAL_EXECUTABLE",
			EndpointEnv:    "LIVEPANEL_STREAMSIGNAL_ENDPOINT",
			ExecutableName: "StreamSignal.exe",
			Endpoints:      localEndpoints(47020, 47029),
			Candidates:     streamSignalExecutableCandidates,
		},
		{
			ID:             "tidereader",
			Name:           "TideReader",
			ExecutableEnv:  "LIVEPANEL_TIDEREADER_EXECUTABLE",
			EndpointEnv:    "LIVEPANEL_TIDEREADER_ENDPOINT",
			ExecutableName: "TideReader.Desktop.exe",
			Endpoints:      localEndpoints(47030, 47039),
			Candidates:     tideReaderExecutableCandidates,
		},
	}
}

func moduleDefinitionByID(id string) (moduleDefinition, bool) {
	for _, definition := range moduleDefinitions() {
		if definition.ID == id {
			return definition, true
		}
	}
	return moduleDefinition{}, false
}

func knownModuleID(id string) bool {
	_, ok := moduleDefinitionByID(id)
	return ok
}

func configuredStreamSignalExecutable() string {
	definition, _ := moduleDefinitionByID("streamsignal")
	return executableForDefinition(definition, ModuleConfig{})
}

func executableForDefinition(definition moduleDefinition, config ModuleConfig) string {
	if configured := strings.TrimSpace(os.Getenv(definition.ExecutableEnv)); configured != "" {
		return configured
	}
	if configured := strings.TrimSpace(config.ExecutablePath); configured != "" {
		return configured
	}

	for _, candidate := range definition.Candidates() {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return definition.ExecutableName
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
	definition, _ := moduleDefinitionByID("streamsignal")
	return endpointsForDefinition(definition)
}

func configuredTideReaderExecutable() string {
	definition, _ := moduleDefinitionByID("tidereader")
	return executableForDefinition(definition, ModuleConfig{})
}

func tideReaderExecutableCandidates() []string {
	names := []string{"TideReader.Desktop.exe", "TideReader.exe", "TideReader.Desktop", "TideReader"}
	if runtime.GOOS != "windows" {
		names = []string{"TideReader.Desktop", "TideReader", "TideReader.Desktop.exe", "TideReader.exe"}
	}

	candidates := make([]string, 0, len(names)*4)
	for _, name := range names {
		candidates = append(candidates,
			filepath.Clean(filepath.Join("..", "TideReader", "build", "bin", name)),
			filepath.Clean(filepath.Join("..", "TideReader", "artifacts", "publish", "win-x64-0.4.0-local", name)),
			filepath.Clean(filepath.Join("..", "TideReader", "artifacts", "publish", "win-x64-0.4.0", name)),
		)
	}
	if executable, err := os.Executable(); err == nil {
		binDir := filepath.Dir(executable)
		for _, name := range names {
			candidates = append(candidates,
				filepath.Clean(filepath.Join(binDir, "..", "..", "..", "TideReader", "build", "bin", name)),
				filepath.Clean(filepath.Join(binDir, "..", "..", "..", "TideReader", "artifacts", "publish", "win-x64-0.4.0-local", name)),
				filepath.Clean(filepath.Join(binDir, "..", "..", "..", "TideReader", "artifacts", "publish", "win-x64-0.4.0", name)),
			)
		}
	}
	return candidates
}

func configuredTideReaderEndpoints() []string {
	definition, _ := moduleDefinitionByID("tidereader")
	return endpointsForDefinition(definition)
}

func endpointsForDefinition(definition moduleDefinition) []string {
	if configured := strings.TrimSpace(os.Getenv(definition.EndpointEnv)); configured != "" {
		if sip.IsLocalEndpoint(configured) {
			return []string{configured}
		}
	}
	return append([]string(nil), definition.Endpoints...)
}

func localEndpoints(first int, last int) []string {
	endpoints := make([]string, 0, 10)
	for port := first; port <= last; port++ {
		endpoints = append(endpoints, sip.LocalEndpoint(port))
	}
	return endpoints
}

func moduleExecutableConfigs(configs map[string]ModuleConfig) []ModuleExecutableConfig {
	out := make([]ModuleExecutableConfig, 0, len(moduleDefinitions()))
	for _, definition := range moduleDefinitions() {
		out = append(out, moduleExecutableConfig(definition, configs[definition.ID]))
	}
	return out
}

func moduleExecutableConfig(definition moduleDefinition, config ModuleConfig) ModuleExecutableConfig {
	envValue := strings.TrimSpace(os.Getenv(definition.ExecutableEnv))
	configValue := strings.TrimSpace(config.ExecutablePath)
	executable := executableForDefinition(definition, config)
	resolved, valid := resolveExecutable(executable)
	source := "fallback"
	envLocked := false
	if envValue != "" {
		source = "environment"
		envLocked = true
	} else if configValue != "" {
		source = "configured"
	} else if resolved != "" && resolved != definition.ExecutableName {
		source = "detected"
	}
	errText := ""
	if !valid && executable != "" && source == "configured" {
		errText = "Configured executable path does not point to a file."
	}
	return ModuleExecutableConfig{
		ID:             definition.ID,
		Name:           definition.Name,
		ExecutablePath: configValue,
		ResolvedPath:   resolved,
		PathSource:     source,
		EnvironmentKey: definition.ExecutableEnv,
		EnvLocked:      envLocked,
		Valid:          valid,
		Error:          errText,
	}
}

func resolveExecutable(executable string) (string, bool) {
	return modules.ExecLauncher{}.Resolve(executable)
}

func (a *App) tideReaderOverlayURL() string {
	if configured := strings.TrimSpace(os.Getenv("LIVEPANEL_TIDEREADER_OVERLAY_URL")); configured != "" && sip.IsLocalEndpoint(configured) {
		return strings.TrimRight(configured, "/")
	}

	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	for _, module := range a.service.List(ctx) {
		if module.ID != "tidereader" || !module.Running {
			continue
		}
		if overlayURL := stringValue(module.Status["overlayUrl"]); overlayURL != "" && sip.IsLocalEndpoint(overlayURL) {
			return strings.TrimRight(overlayURL, "/")
		}
	}
	return "http://127.0.0.1:17655/overlay"
}

func overlaySiblingURL(overlayURL string, path string) string {
	parsed, err := url.Parse(strings.TrimSpace(overlayURL))
	if err != nil {
		return ""
	}
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") {
		if sip.IsLocalEndpoint(path) {
			return path
		}
		return ""
	}
	if strings.HasPrefix(path, "/") {
		parsed.Path = path
	} else {
		parsed.Path = "/" + path
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func fetchLocalJSON(ctx context.Context, rawURL string, target interface{}) error {
	if !sip.IsLocalEndpoint(rawURL) {
		return fmt.Errorf("refusing non-local TideReader overlay URL")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("TideReader overlay returned %s", response.Status)
	}
	return json.NewDecoder(response.Body).Decode(target)
}

func stringValue(value interface{}) string {
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
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

func (a *App) sipClientForModule(id string, name string) (*sip.Client, error) {
	ctx := a.requestContext()
	modulesList, _ := a.service.Refresh(ctx)
	for _, module := range modulesList {
		if module.ID != id || !module.Running || strings.TrimSpace(module.Endpoint) == "" {
			continue
		}
		return sip.NewClient(module.Endpoint, 1200*time.Millisecond), nil
	}
	return nil, fmt.Errorf("%s unavailable", name)
}
