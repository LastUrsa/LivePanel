package modules

import (
	"context"
	"errors"
	"sync"
)

var ErrUnknownModule = errors.New("unknown module")

type Provider interface {
	ID() string
	Refresh(context.Context) (Module, error)
}

type LifecycleProvider interface {
	Provider
	Start(context.Context) error
	Open(context.Context) error
	AutoStart() bool
}

type ShutdownProvider interface {
	Provider
	Shutdown(context.Context) error
}

type Service struct {
	mu        sync.RWMutex
	providers []Provider
	modules   map[string]Module
}

func NewService(providers []Provider) *Service {
	copied := append([]Provider(nil), providers...)
	return &Service{
		providers: copied,
		modules:   map[string]Module{},
	}
}

func (s *Service) Register(provider Provider) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.providers = append(s.providers, provider)
}

func (s *Service) List(_ context.Context) []Module {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return sortedModules(s.modules)
}

func (s *Service) Refresh(ctx context.Context) ([]Module, error) {
	s.mu.RLock()
	providers := append([]Provider(nil), s.providers...)
	s.mu.RUnlock()

	next := map[string]Module{}
	var firstErr error
	for _, provider := range providers {
		module, err := provider.Refresh(ctx)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
		}
		if module.ID == "" {
			continue
		}
		next[module.ID] = module
	}

	s.mu.Lock()
	s.modules = next
	out := sortedModules(s.modules)
	s.mu.Unlock()
	return out, firstErr
}

func (s *Service) Start(ctx context.Context, id string) error {
	provider, ok := s.lifecycleProvider(id)
	if !ok {
		return ErrUnknownModule
	}
	return provider.Start(ctx)
}

func (s *Service) Open(ctx context.Context, id string) error {
	provider, ok := s.lifecycleProvider(id)
	if !ok {
		return ErrUnknownModule
	}
	return provider.Open(ctx)
}

func (s *Service) StartAutoStart(ctx context.Context) error {
	s.mu.RLock()
	providers := append([]Provider(nil), s.providers...)
	s.mu.RUnlock()

	var firstErr error
	for _, provider := range providers {
		lifecycle, ok := provider.(LifecycleProvider)
		if !ok || !lifecycle.AutoStart() {
			continue
		}
		module, err := provider.Refresh(ctx)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		if !module.Installed || module.Running {
			continue
		}
		if err := lifecycle.Start(ctx); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (s *Service) Shutdown(ctx context.Context) error {
	s.mu.RLock()
	providers := append([]Provider(nil), s.providers...)
	s.mu.RUnlock()

	var firstErr error
	for _, provider := range providers {
		shutdowner, ok := provider.(ShutdownProvider)
		if !ok {
			continue
		}
		if err := shutdowner.Shutdown(ctx); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (s *Service) lifecycleProvider(id string) (LifecycleProvider, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, provider := range s.providers {
		if provider.ID() != id {
			continue
		}
		lifecycle, ok := provider.(LifecycleProvider)
		return lifecycle, ok
	}
	return nil, false
}
