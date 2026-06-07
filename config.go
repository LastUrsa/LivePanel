package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type AppConfig struct {
	Modules map[string]ModuleConfig `json:"modules"`
}

type ModuleConfig struct {
	ExecutablePath string `json:"executablePath,omitempty"`
}

type ConfigStore struct {
	path string
}

func NewConfigStore() *ConfigStore {
	return &ConfigStore{path: configPath()}
}

func NewConfigStoreAt(path string) *ConfigStore {
	return &ConfigStore{path: path}
}

func (s *ConfigStore) Load() (AppConfig, error) {
	config := AppConfig{Modules: map[string]ModuleConfig{}}
	if s == nil || strings.TrimSpace(s.path) == "" {
		return config, nil
	}
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return config, nil
	}
	if err != nil {
		return config, err
	}
	if err := json.Unmarshal(data, &config); err != nil {
		return AppConfig{Modules: map[string]ModuleConfig{}}, err
	}
	if config.Modules == nil {
		config.Modules = map[string]ModuleConfig{}
	}
	return config, nil
}

func (s *ConfigStore) Save(config AppConfig) error {
	if config.Modules == nil {
		config.Modules = map[string]ModuleConfig{}
	}
	if s == nil || strings.TrimSpace(s.path) == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(s.path, data, 0o600)
}

func configPath() string {
	if configured := strings.TrimSpace(os.Getenv("LIVEPANEL_CONFIG_PATH")); configured != "" {
		return configured
	}
	base, err := os.UserConfigDir()
	if err != nil || strings.TrimSpace(base) == "" {
		base = "."
	}
	return filepath.Join(base, "LivePanel", "config.json")
}
