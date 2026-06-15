package sip

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type AppInfo struct {
	AppID           string   `json:"appId"`
	Name            string   `json:"name"`
	Version         string   `json:"version"`
	Mode            string   `json:"mode"`
	ProtocolVersion string   `json:"protocolVersion"`
	Capabilities    []string `json:"capabilities"`
}

func (a *AppInfo) UnmarshalJSON(data []byte) error {
	var raw struct {
		AppID           string          `json:"appId"`
		Name            string          `json:"name"`
		Version         string          `json:"version"`
		Mode            string          `json:"mode"`
		ProtocolVersion json.RawMessage `json:"protocolVersion"`
		Capabilities    []string        `json:"capabilities"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	a.AppID = raw.AppID
	a.Name = raw.Name
	a.Version = raw.Version
	a.Mode = raw.Mode
	a.Capabilities = raw.Capabilities
	if len(raw.ProtocolVersion) == 0 || string(raw.ProtocolVersion) == "null" {
		a.ProtocolVersion = ""
		return nil
	}
	var versionString string
	if err := json.Unmarshal(raw.ProtocolVersion, &versionString); err == nil {
		a.ProtocolVersion = versionString
		return nil
	}
	var versionNumber int
	if err := json.Unmarshal(raw.ProtocolVersion, &versionNumber); err == nil {
		a.ProtocolVersion = strconv.Itoa(versionNumber)
		return nil
	}
	return fmt.Errorf("%w: protocolVersion", ErrInvalidResponse)
}

type Health struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

type Capabilities struct {
	ProtocolVersion         int      `json:"protocolVersion"`
	Capabilities            []string `json:"capabilities"`
	SupportsProfiles        bool     `json:"supportsProfiles"`
	SupportsStatusReporting bool     `json:"supportsStatusReporting"`
	SupportsAnnouncements   bool     `json:"supportsAnnouncements"`
	SupportsRedeems         bool     `json:"supportsRedeems"`
}

type Status map[string]any

type ProfilesResponse struct {
	Profiles []string `json:"profiles"`
}

type CurrentProfileResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type AnnouncementField struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

type AnnouncementFieldsResponse struct {
	Fields []AnnouncementField `json:"fields"`
}

type UpdateAnnouncementFieldRequest struct {
	ID    string `json:"id"`
	Value string `json:"value"`
}

type UpdateAnnouncementFieldsRequest struct {
	Fields []UpdateAnnouncementFieldRequest `json:"fields"`
}

type SuccessResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type BrowserSupportResponse struct {
	Enabled bool   `json:"enabled"`
	Error   string `json:"error,omitempty"`
}

type BrowserSupportRequest struct {
	Enabled bool `json:"enabled"`
}

type Redeem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Enabled   bool   `json:"enabled"`
}

type RedeemsResponse struct {
	Redeems []Redeem `json:"redeems"`
	Error   string   `json:"error,omitempty"`
}

type UpdateRedeemRequest struct {
	ID      string `json:"id"`
	Enabled bool   `json:"enabled"`
}

type UpdateRedeemsRequest struct {
	Redeems []UpdateRedeemRequest `json:"redeems"`
}

type ActivateProfileRequest struct {
	Profile string `json:"profile"`
}

type ProfileActivationResponse struct {
	Success   bool   `json:"success"`
	Profile   string `json:"profile,omitempty"`
	ProfileID string `json:"profileId,omitempty"`
	Error     string `json:"error,omitempty"`
}

type ErrorResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
}

type AnnounceRequest struct {
	Fields []UpdateAnnouncementFieldRequest `json:"fields,omitempty"`
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
	if len(c.Capabilities) > 0 {
		names := make([]string, 0, len(c.Capabilities))
		seen := map[string]struct{}{}
		for _, capability := range c.Capabilities {
			capability = strings.TrimSpace(capability)
			if capability == "" {
				continue
			}
			key := strings.ToLower(capability)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			names = append(names, capability)
		}
		return names
	}
	names := make([]string, 0, 4)
	if c.SupportsProfiles {
		names = append(names, "profiles")
	}
	if c.SupportsStatusReporting {
		names = append(names, "status")
	}
	if c.SupportsAnnouncements {
		names = append(names, "announcements")
	}
	if c.SupportsRedeems {
		names = append(names, "redeems")
	}
	return names
}
