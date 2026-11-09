package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"LivePanel/internal/modules"
	"LivePanel/internal/sessionlog"
	"LivePanel/internal/sip"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed wails.json
var appMetadata []byte

func logDirectory() string {
	if dir := strings.TrimSpace(os.Getenv("LIVEPANEL_LOG_DIR")); dir != "" {
		return dir
	}
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		return ""
	} // Never fall back to the working directory.
	return filepath.Join(base, "LivePanel", "logs")
}

func (a *App) initSessionLogging() {
	a.logs = sessionlog.New(logDirectory())
	var metadata struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	_ = json.Unmarshal(appMetadata, &metadata)
	a.logs.Start(metadata.Info.ProductVersion)
	if a.configLoadErr != nil {
		a.logs.Record(sessionlog.Event{Name: "configuration_load_failed", ErrorKind: sessionlog.ErrorKind(a.configLoadErr)})
	}
	a.service.SetObserver(a.observeModule)
}

func (a *App) observeModule(module modules.Module) {
	state := sessionlog.State{Running: module.Running, Healthy: module.Healthy, Version: module.Version}
	switch module.HealthStatus {
	case "ready", "healthy", "degraded", "warning", "error", "offline":
		state.HealthStatus = module.HealthStatus
	}
	if profile, ok := module.Status["activeProfileId"].(string); ok {
		state.ProfileRef = sessionlog.Reference(profile)
	}
	if module.Error != "" {
		state.ErrorKind = sessionlog.ErrorKind(errors.New(module.Error))
	}
	if connected, ok := module.Status["obsConnected"].(bool); ok {
		state.OBSConnected = &connected
	}
	if nested, ok := module.Status["obs"].(map[string]any); ok && state.OBSConnected == nil {
		if connected, ok := nested["connected"].(bool); ok {
			state.OBSConnected = &connected
		}
	}
	// Only known connection states, never scene/source summaries.
	if value, ok := module.Status["obsConnectionState"].(string); ok {
		switch value {
		case "connected", "disconnected", "reconnecting", "not_configured", "not_running":
			state.OBSState = value
		}
	}
	state.OBSObservedAt = diagnosticTime(module.Status["obsObservedAt"])
	state.OBSLastConnectedAt = diagnosticTime(module.Status["obsLastConnectedAt"])
	state.OBSLastDisconnectedAt = diagnosticTime(module.Status["obsLastDisconnectedAt"])
	state.OBSNextReconnectAt = diagnosticTime(module.Status["obsNextReconnectAt"])
	state.OBSLastDisconnectCode = diagnosticCode(module.Status["obsLastDisconnectCode"])
	if dependencies, ok := module.Status["dependencies"].(map[string]any); ok {
		source, _ := dependencies["source"].(map[string]any)
		overlay, _ := dependencies["overlay"].(map[string]any)
		browser, _ := dependencies["browser"].(map[string]any)
		state.SourceState = diagnosticState(source["state"])
		state.OverlayState = diagnosticState(overlay["state"])
		state.BrowserState = diagnosticState(browser["state"])
		state.SourceObservedAt = diagnosticTime(source["observedAt"])
		state.OverlayObservedAt = diagnosticTime(overlay["observedAt"])
		state.SourceErrorCode = diagnosticCode(source["errorCode"])
		state.OverlayErrorCode = diagnosticCode(overlay["errorCode"])
	}

	a.logs.Transition(module.ID, state)
}

func (a *App) logRunError(err error) {
	a.logs.Record(sessionlog.Event{Name: "application_failed", ErrorKind: sessionlog.ErrorKind(err), Outcome: "failed"})
}

func outcome(success bool) string {
	if success {
		return "success"
	}
	return "failed"
}

func (a *App) beginAction(module, operation string) (context.Context, func(bool, string, bool)) {
	ctx := a.requestContext()
	if a.logs == nil {
		return ctx, func(bool, string, bool) {}
	}
	id, started := sessionlog.ID(), time.Now()
	a.logs.Record(sessionlog.Event{Name: "action_started", Module: module, Operation: operation, ActionID: id})
	return sessionlog.WithActionID(ctx, id), func(success bool, message string, confirmation bool) {
		result := outcome(success)
		if confirmation {
			result = "confirmation_required"
		}
		var kind string
		if !success && !confirmation {
			kind = "remote_failure"
			if message != "" {
				kind = sessionlog.ErrorKind(errors.New(message))
			}
		}
		if (operation == "announce" || operation == "confirm_announcement" || operation == "end_stream") &&
			(kind == "timeout" || kind == "invalid_response" || kind == "canceled") {
			result = "unknown"
		}
		a.logs.Record(sessionlog.Event{Name: "action_finished", Module: module, Operation: operation, ActionID: id, Outcome: result, ErrorKind: kind, DurationMS: time.Since(started).Milliseconds()})
	}
}

// GetSessionLogWarning exposes a brief failure notice only, not log metadata or
// settings. This is polled independently of module availability.
func (a *App) GetSessionLogWarning() string { return a.logs.Warning() }

func (a *App) OpenLogsFolder() error {
	if a.logs == nil || a.ctx == nil {
		return errors.New("Unable to open the logs folder.")
	}
	info, err := os.Stat(a.logs.Directory())
	if err != nil || !info.IsDir() {
		return errors.New("The logs folder is unavailable.")
	}
	absolute, err := filepath.Abs(a.logs.Directory())
	if err != nil {
		return errors.New("The logs folder is unavailable.")
	}
	if err := openLogsDirectory(absolute); err != nil {
		return errors.New("Unable to open the logs folder.")
	}
	return nil
}

func (a *App) ExportSessionLogs() (string, error) {
	if a.logs == nil || a.ctx == nil {
		return "", errors.New("Session logs are unavailable.")
	}
	destination, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title: "Export Session Logs", DefaultFilename: "LivePanel-sessions-" + time.Now().Format("2006-01-02") + ".zip",
		Filters: []wailsruntime.FileFilter{{DisplayName: "ZIP archive", Pattern: "*.zip"}},
	})
	if err != nil {
		return "", errors.New("Unable to choose an export location.")
	}
	if destination == "" {
		return "", nil
	}
	if !strings.EqualFold(filepath.Ext(destination), ".zip") {
		destination += ".zip"
	}
	if err := a.logs.Export(destination); err != nil {
		a.logs.Record(sessionlog.Event{Name: "log_export_failed", ErrorKind: sessionlog.ErrorKind(err)})
		return "", errors.New("Unable to export session logs. Choose a location outside the logs folder and try again.")
	}
	a.logs.Record(sessionlog.Event{Name: "logs_exported", Outcome: "success"})
	return "Session logs exported.", nil
}

func (a *App) observeRequest(module string) func(sip.RequestEvent) {
	return func(e sip.RequestEvent) {
		if e.ErrorCode != "" || e.OperationID != "" && (e.Method == "POST" || e.Outcome != "running") {
			a.logs.OwnerOperation(sessionlog.Event{Name: "owner_operation_observed", Module: module, ActionID: sessionlog.ActionID(e.Context), RequestID: e.RequestID, OwnerSessionID: e.SessionID, OperationID: e.OperationID, ErrorCode: diagnosticCode(e.ErrorCode), Outcome: e.Outcome})
		}
		if e.OperationID != "" {
			for _, result := range e.Results {
				platform := result.Platform
				switch platform {
				case "bluesky", "mastodon", "discord":
				default:
					platform = "unknown"
				}
				name, integration := "destination_result", ""
				switch result.Integration {
				case "obs", "redeems", "profile_storage", "overlay", "source":
					name, integration = "integration_result", result.Integration
				}
				a.logs.OwnerOperation(sessionlog.Event{Name: name, Integration: integration, Module: module, ActionID: sessionlog.ActionID(e.Context), RequestID: e.RequestID, OwnerSessionID: e.SessionID, OperationID: e.OperationID, ErrorCode: diagnosticCode(result.ErrorCode), Outcome: result.State, Operation: diagnosticPhase(result.Phase), DestinationRef: sessionlog.Reference(result.DestinationID), Platform: platform, Published: result.Published})
			}
		}
		a.logs.Request(e.Context, module, e.Method, e.Path, e.Duration, e.Status, e.Err)
	}
}

func diagnosticTime(value any) string {
	text, _ := value.(string)
	parsed, err := time.Parse(time.RFC3339Nano, text)
	if err != nil {
		return ""
	}
	return parsed.UTC().Format(time.RFC3339Nano)
}
func diagnosticState(value any) string {
	text, _ := value.(string)
	switch text {
	case "connected", "disconnected", "reconnecting", "not_configured", "ready", "disabled", "idle", "stale", "unknown", "unavailable", "unsupported":
		return text
	}
	return ""
}
func diagnosticPhase(value string) string {
	switch value {
	case "publish", "live_now", "history", "validation", "apply_sources", "apply_rewards", "save_profile", "completed", "executing":
		return value
	}
	return "unknown"
}
func diagnosticCode(value any) string {
	text, _ := value.(string)
	switch text {
	case "", "INVALID_REQUEST", "FORBIDDEN", "NOT_FOUND", "OPERATION_NOT_FOUND", "BUSY", "INTERNAL_ERROR", "UNAVAILABLE", "TIMEOUT", "CANCELED", "AUTH_REJECTED", "MISSING_CREDENTIALS", "VALIDATION_FAILED", "INTEGRATION_DISABLED", "PUBLISH_FAILED", "FOLLOW_UP_FAILED", "PARTIAL_FAILURE", "DUPLICATE_CONFIRMATION_REQUIRED", "CONFIRMATION_EXPIRED", "IDEMPOTENCY_CONFLICT", "HISTORY_UNAVAILABLE", "HISTORY_WRITE_FAILED", "INTERRUPTED":
		return text
	}
	return "UNKNOWN_ERROR"
}
