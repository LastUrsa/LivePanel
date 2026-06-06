package sip

type AppInfo struct {
	AppID           string `json:"appId"`
	Name            string `json:"name"`
	Version         string `json:"version"`
	Mode            string `json:"mode"`
	ProtocolVersion string `json:"protocolVersion"`
}

type Health struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

type Capabilities struct {
	SupportsProfiles        bool `json:"supportsProfiles"`
	SupportsStatusReporting bool `json:"supportsStatusReporting"`
	SupportsAnnouncements   bool `json:"supportsAnnouncements"`
}

type Status map[string]any

type ProfilesResponse struct {
	Profiles []string `json:"profiles"`
}

type CurrentProfileResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ActivateProfileRequest struct {
	Profile string `json:"profile"`
}

type ProfileActivationResponse struct {
	Success   bool   `json:"success"`
	Profile   string `json:"profile,omitempty"`
	ProfileID string `json:"profileId,omitempty"`
}

type AnnounceResponse struct {
	Success              bool   `json:"success"`
	RequiresConfirmation bool   `json:"requiresConfirmation,omitempty"`
	ConfirmationID       string `json:"confirmationId,omitempty"`
	Error                string `json:"error,omitempty"`
}

type AnnounceStatusResponse struct {
	LastRun              string `json:"lastRun"`
	Success              bool   `json:"success"`
	RequiresConfirmation bool   `json:"requiresConfirmation,omitempty"`
	ConfirmationID       string `json:"confirmationId,omitempty"`
	Error                string `json:"error,omitempty"`
}

type AnnounceConfirmRequest struct {
	ConfirmationID string `json:"confirmationId"`
}

type EndStreamResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type EndStreamStatusResponse struct {
	LastRun string `json:"lastRun"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type Snapshot struct {
	Endpoint     string       `json:"endpoint"`
	App          AppInfo      `json:"app"`
	Health       Health       `json:"health"`
	Capabilities Capabilities `json:"capabilities"`
	Status       Status       `json:"status"`
}

func (c Capabilities) Names() []string {
	names := make([]string, 0, 3)
	if c.SupportsProfiles {
		names = append(names, "Profiles")
	}
	if c.SupportsStatusReporting {
		names = append(names, "Status Reporting")
	}
	if c.SupportsAnnouncements {
		names = append(names, "Announcements")
	}
	return names
}
