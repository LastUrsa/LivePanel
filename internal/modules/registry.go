package modules

type RegistryEntry struct {
	ID         string
	Name       string
	Executable string
	Endpoints  []string
	AutoStart  bool
}

func (e RegistryEntry) BaseModule() Module {
	return Module{
		ID:           e.ID,
		Name:         e.Name,
		Executable:   e.Executable,
		AutoStart:    e.AutoStart,
		HealthStatus: "offline",
		HealthText:   "Module is offline.",
		Capabilities: []string{},
		Status:       map[string]any{},
	}
}
