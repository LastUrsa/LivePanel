package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"LivePanel/internal/sip"
)

type Launcher interface {
	Resolve(executable string) (string, bool)
	Start(ctx context.Context, executable string, args ...string) error
}

type processGroupOwner interface {
	Attach(*os.Process) error
	Close() error
}

type Shutdowner interface {
	Shutdown(context.Context) error
}

type ExecLauncher struct{}

func (ExecLauncher) Resolve(executable string) (string, bool) {
	if executable == "" {
		return "", false
	}
	if filepath.IsAbs(executable) || filepath.Dir(executable) != "." {
		info, err := os.Stat(executable)
		if err == nil && !info.IsDir() {
			return executable, true
		}
		return "", false
	}
	path, err := exec.LookPath(executable)
	if err == nil {
		return path, true
	}
	return "", false
}

func (ExecLauncher) Start(ctx context.Context, executable string, args ...string) error {
	cmd := exec.CommandContext(ctx, executable, args...)
	return cmd.Start()
}

type OwnedProcessLauncher struct {
	mu        sync.Mutex
	processes map[*ownedProcess]struct{}
	group     processGroupOwner
}

type ownedProcess struct {
	process *os.Process
	done    chan struct{}
}

func NewOwnedProcessLauncher() *OwnedProcessLauncher {
	group, _ := newProcessGroupOwner()
	return &OwnedProcessLauncher{
		processes: map[*ownedProcess]struct{}{},
		group:     group,
	}
}

func (l *OwnedProcessLauncher) Resolve(executable string) (string, bool) {
	return ExecLauncher{}.Resolve(executable)
}

func (l *OwnedProcessLauncher) Start(ctx context.Context, executable string, args ...string) error {
	cmd := exec.CommandContext(ctx, executable, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	if l.group != nil {
		if err := l.group.Attach(cmd.Process); err != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			return err
		}
	}

	owned := &ownedProcess{
		process: cmd.Process,
		done:    make(chan struct{}),
	}
	l.mu.Lock()
	l.processes[owned] = struct{}{}
	l.mu.Unlock()

	go func() {
		_ = cmd.Wait()
		l.mu.Lock()
		delete(l.processes, owned)
		l.mu.Unlock()
		close(owned.done)
	}()
	return nil
}

func (l *OwnedProcessLauncher) Shutdown(ctx context.Context) error {
	processes := l.snapshot()
	for _, owned := range processes {
		if err := owned.process.Signal(os.Interrupt); err != nil {
			_ = owned.process.Kill()
		}
	}

	var firstErr error
	for _, owned := range processes {
		select {
		case <-owned.done:
			continue
		case <-ctx.Done():
			if err := owned.process.Kill(); err != nil && firstErr == nil {
				firstErr = err
			}
		}
	}
	for _, owned := range processes {
		select {
		case <-owned.done:
		case <-time.After(500 * time.Millisecond):
			if firstErr == nil {
				firstErr = fmt.Errorf("timed out waiting for owned process %d to exit", owned.process.Pid)
			}
		}
	}
	if firstErr != nil {
		return firstErr
	}
	if l.group != nil {
		return l.group.Close()
	}
	return ctx.Err()
}

func (l *OwnedProcessLauncher) snapshot() []*ownedProcess {
	l.mu.Lock()
	defer l.mu.Unlock()
	processes := make([]*ownedProcess, 0, len(l.processes))
	for owned := range l.processes {
		processes = append(processes, owned)
	}
	return processes
}

type SIPProvider struct {
	entry    RegistryEntry
	launcher Launcher
	timeout  time.Duration
}

func NewSIPProvider(id string, endpoints []string, timeout time.Duration) *SIPProvider {
	return &SIPProvider{
		entry: RegistryEntry{
			ID:        id,
			Name:      id,
			Endpoints: append([]string(nil), endpoints...),
		},
		launcher: ExecLauncher{},
		timeout:  timeout,
	}
}

func NewManagedSIPProvider(entry RegistryEntry, launcher Launcher, timeout time.Duration) *SIPProvider {
	if launcher == nil {
		launcher = ExecLauncher{}
	}
	return &SIPProvider{
		entry: RegistryEntry{
			ID:         entry.ID,
			Name:       entry.Name,
			Executable: entry.Executable,
			Endpoints:  append([]string(nil), entry.Endpoints...),
			AutoStart:  entry.AutoStart,
		},
		launcher: launcher,
		timeout:  timeout,
	}
}

func (p *SIPProvider) ID() string {
	return p.entry.ID
}

func (p *SIPProvider) Refresh(ctx context.Context) (Module, error) {
	module := p.entry.BaseModule()
	resolved, installed := p.launcher.Resolve(p.entry.Executable)
	module.Installed = installed
	if installed {
		module.Executable = resolved
	}

	var lastErr error
	for _, endpoint := range p.entry.Endpoints {
		if !sip.IsLocalEndpoint(endpoint) {
			lastErr = fmt.Errorf("SIP endpoint must be local HTTP: %s", endpoint)
			continue
		}
		snapshot, err := sip.NewClient(endpoint, p.timeout).FetchSnapshot(ctx)
		if err != nil {
			lastErr = err
			continue
		}
		return moduleFromSnapshot(module, snapshot), nil
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no endpoints configured")
	}
	if installed {
		module.HealthText = "Module is installed but SIP is not responding."
	}
	module.Error = lastErr.Error()
	return module, lastErr
}

func (p *SIPProvider) Start(ctx context.Context) error {
	executable, ok := p.launcher.Resolve(p.entry.Executable)
	if !ok {
		return fmt.Errorf("%s is not installed", p.entry.Name)
	}
	return p.launcher.Start(ctx, executable, "--service")
}

func (p *SIPProvider) Open(ctx context.Context) error {
	executable, ok := p.launcher.Resolve(p.entry.Executable)
	if !ok {
		return fmt.Errorf("%s is not installed", p.entry.Name)
	}
	return p.launcher.Start(ctx, executable, "--show")
}

func (p *SIPProvider) AutoStart() bool {
	return p.entry.AutoStart
}

func (p *SIPProvider) Shutdown(ctx context.Context) error {
	shutdowner, ok := p.launcher.(Shutdowner)
	if !ok {
		return nil
	}
	return shutdowner.Shutdown(ctx)
}

func moduleFromSnapshot(base Module, snapshot sip.Snapshot) Module {
	health := snapshot.Health.Status
	return Module{
		ID:           base.ID,
		Name:         snapshot.App.Name,
		Executable:   base.Executable,
		Installed:    base.Installed,
		Running:      true,
		AutoStart:    base.AutoStart,
		Version:      snapshot.App.Version,
		Mode:         snapshot.App.Mode,
		Protocol:     snapshot.App.ProtocolVersion,
		Healthy:      health == "ready" || health == "degraded",
		HealthStatus: health,
		HealthText:   snapshot.Health.Message,
		Capabilities: snapshot.Capabilities.Names(),
		Status:       map[string]any(snapshot.Status),
		Endpoint:     snapshot.Endpoint,
		LastSeen:     time.Now().UTC(),
	}
}
