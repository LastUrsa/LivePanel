package sip

import (
	"context"
	"fmt"
	"net/http/httptest"
	"slices"
	"testing"
	"time"
)

// These fixtures follow the released v1.0.0 owner models. Legacy contracts stay
// covered separately: app version 1.0.0 still advertises numeric SIP protocol 1.
func TestReleasedCompanionContractsPreserveCapabilitiesAndConfirmation(t *testing.T) {
	tests := []struct{ id, name, capabilities, status string }{
		{"streamsignal", "StreamSignal", `["operations","diagnostics","async-publishing","profiles","announcement-fields"]`, `{"state":"idle","healthy":true,"activeProfileId":"profile","enabledDestinationCount":3}`},
		{"tidereader", "TideReader", `["profiles","browser-support","operations","diagnostics"]`, `{"state":"idle","healthy":true,"activeProfileId":"profile","browserSupportEnabled":true,"source":"none","dependencies":{"overlay":{"state":"ready","observedAt":"2026-11-07T12:00:00Z"}}}`},
		{"tuberswitch", "TuberSwitch", `["operations","diagnostics","profiles","redeems"]`, `{"state":"ready","healthy":true,"activeProfileId":"profile","activeMode":"3d","obsConnected":true,"appDetection":{"targetProfileId":"profile","reason":"already_active","observedAt":"2026-11-07T12:00:00Z"}}`},
	}
	for _, test := range tests {
		t.Run(test.id, func(t *testing.T) {
			contract := map[string]string{
				"/api/v1/app":             fmt.Sprintf(`{"appId":%q,"appName":%q,"name":%q,"version":"1.0.0","mode":"service","protocolVersion":1,"capabilities":%s}`, test.id, test.name, test.name, test.capabilities),
				"/api/v1/health":          `{"status":"ready","message":"Operational"}`,
				"/api/v1/capabilities":    `{"protocolVersion":1,"supportsProfiles":true,"supportsStatusReporting":true,"capabilities":` + test.capabilities + `}`,
				"/api/v1/status":          test.status,
				"/api/v1/profile/current": `{"id":"profile","name":"Profile","sessionId":"owner-session","requestId":"release-check","confirmedOperationId":"0123456789abcdef01234567","revision":4,"confirmedAt":"2026-11-07T12:00:00Z"}`,
			}
			server := httptest.NewServer(contractHandler(t, contract))
			defer server.Close()
			client := NewClient(server.URL, time.Second)
			snapshot, err := client.FetchSnapshot(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if snapshot.App.Version != "1.0.0" || snapshot.App.ProtocolVersion != "1" || snapshot.App.Mode != "service" || snapshot.Status["activeProfileId"] != "profile" {
				t.Fatalf("snapshot=%+v", snapshot)
			}
			for _, capability := range []string{"profiles", "operations", "diagnostics"} {
				if !slices.Contains(snapshot.Capabilities.Names(), capability) {
					t.Fatalf("missing capability %s", capability)
				}
			}
			profile, err := client.GetCurrentProfile(context.Background())
			if err != nil || profile.ID != "profile" || profile.Revision != 4 || profile.ConfirmedOperationID != "0123456789abcdef01234567" || profile.SessionID != "owner-session" {
				t.Fatalf("confirmation=%+v error=%v", profile, err)
			}
			if test.id == "tuberswitch" {
				detection := snapshot.Status["appDetection"].(map[string]any)
				if detection["reason"] != "already_active" || detection["targetProfileId"] != "profile" {
					t.Fatal("owner detection data lost")
				}
			}
			if test.id == "tidereader" {
				overlay := snapshot.Status["dependencies"].(map[string]any)["overlay"].(map[string]any)
				if overlay["observedAt"] != "2026-11-07T12:00:00Z" {
					t.Fatal("producer observation lost")
				}
			}
		})
	}
}
