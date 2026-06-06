package modules

import "time"

type Module struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Executable   string         `json:"executable"`
	Installed    bool           `json:"installed"`
	Running      bool           `json:"running"`
	AutoStart    bool           `json:"autoStart"`
	Version      string         `json:"version"`
	Mode         string         `json:"mode"`
	Protocol     string         `json:"protocol"`
	Healthy      bool           `json:"healthy"`
	HealthStatus string         `json:"healthStatus"`
	HealthText   string         `json:"healthText"`
	Capabilities []string       `json:"capabilities"`
	Status       map[string]any `json:"status"`
	Endpoint     string         `json:"endpoint"`
	LastSeen     time.Time      `json:"lastSeen"`
	Error        string         `json:"error,omitempty"`
}
