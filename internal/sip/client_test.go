package sip

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestClientFetchSnapshot(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/app":
			_, _ = w.Write([]byte(`{"appId":"streamsignal","name":"StreamSignal","version":"0.4.0","mode":"standalone","protocolVersion":"1.0"}`))
		case "/api/v1/health":
			_, _ = w.Write([]byte(`{"status":"ready","message":"ok"}`))
		case "/api/v1/capabilities":
			_, _ = w.Write([]byte(`{"supportsProfiles":true,"supportsStatusReporting":true,"supportsAnnouncements":false}`))
		case "/api/v1/status":
			_, _ = w.Write([]byte(`{"state":"idle","message":"Ready"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	snapshot, err := NewClient(server.URL, time.Second).FetchSnapshot(context.Background())
	if err != nil {
		t.Fatalf("FetchSnapshot returned error: %v", err)
	}

	if snapshot.App.Name != "StreamSignal" || snapshot.App.Version != "0.4.0" {
		t.Fatalf("unexpected app info: %+v", snapshot.App)
	}
	if snapshot.Health.Status != "ready" {
		t.Fatalf("unexpected health: %+v", snapshot.Health)
	}
	if got := snapshot.Capabilities.Names(); len(got) != 2 || got[0] != "Profiles" || got[1] != "Status Reporting" {
		t.Fatalf("unexpected capability names: %+v", got)
	}
}

func TestClientRejectsInvalidResponses(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"","version":"0.4.0"}`))
	}))
	defer server.Close()

	_, err := NewClient(server.URL, time.Second).GetApp(context.Background())
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("expected ErrInvalidResponse, got %v", err)
	}
}

func TestClientUsesStreamSignalWorkflowEndpoints(t *testing.T) {
	var activatedProfile string
	var confirmationID string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/profiles":
			if r.Method != http.MethodGet {
				t.Fatalf("profiles method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"profiles":["Gaming Stream"]}`))
		case "/api/v1/profile/current":
			if r.Method != http.MethodGet {
				t.Fatalf("current profile method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"id":"gaming","name":"Gaming Stream"}`))
		case "/api/v1/profile":
			if r.Method != http.MethodPost {
				t.Fatalf("activate method = %s", r.Method)
			}
			var request ActivateProfileRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatalf("decode activate request: %v", err)
			}
			activatedProfile = request.Profile
			_, _ = w.Write([]byte(`{"success":true,"profile":"Gaming Stream","profileId":"gaming"}`))
		case "/api/v1/announce":
			if r.Method != http.MethodPost {
				t.Fatalf("announce method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"success":false,"requiresConfirmation":true,"confirmationId":"confirm-1","error":"Continue?"}`))
		case "/api/v1/announce/confirm":
			if r.Method != http.MethodPost {
				t.Fatalf("confirm method = %s", r.Method)
			}
			var request AnnounceConfirmRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatalf("decode confirm request: %v", err)
			}
			confirmationID = request.ConfirmationID
			_, _ = w.Write([]byte(`{"success":true}`))
		case "/api/v1/announce/status":
			if r.Method != http.MethodGet {
				t.Fatalf("announce status method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"lastRun":"2026-06-05T12:00:00Z","success":true}`))
		case "/api/v1/end-stream":
			if r.Method != http.MethodPost {
				t.Fatalf("end stream method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"success":true}`))
		case "/api/v1/end-stream/status":
			if r.Method != http.MethodGet {
				t.Fatalf("end stream status method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"lastRun":"2026-06-05T12:05:00Z","success":true}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL, time.Second)
	profiles, err := client.GetProfiles(context.Background())
	if err != nil || len(profiles.Profiles) != 1 || profiles.Profiles[0] != "Gaming Stream" {
		t.Fatalf("unexpected profiles %+v err %v", profiles, err)
	}
	current, err := client.GetCurrentProfile(context.Background())
	if err != nil || current.Name != "Gaming Stream" {
		t.Fatalf("unexpected current profile %+v err %v", current, err)
	}
	activated, err := client.ActivateProfile(context.Background(), "Gaming Stream")
	if err != nil || !activated.Success || activatedProfile != "Gaming Stream" {
		t.Fatalf("unexpected activation %+v profile %q err %v", activated, activatedProfile, err)
	}
	announced, err := client.Announce(context.Background())
	if err != nil || !announced.RequiresConfirmation || announced.ConfirmationID != "confirm-1" {
		t.Fatalf("unexpected announce %+v err %v", announced, err)
	}
	confirmed, err := client.ConfirmAnnouncement(context.Background(), "confirm-1")
	if err != nil || !confirmed.Success || confirmationID != "confirm-1" {
		t.Fatalf("unexpected confirm %+v confirmation %q err %v", confirmed, confirmationID, err)
	}
	announceStatus, err := client.GetAnnounceStatus(context.Background())
	if err != nil || !announceStatus.Success || announceStatus.LastRun == "" {
		t.Fatalf("unexpected announce status %+v err %v", announceStatus, err)
	}
	ended, err := client.EndStream(context.Background())
	if err != nil || !ended.Success {
		t.Fatalf("unexpected end stream %+v err %v", ended, err)
	}
	endStatus, err := client.GetEndStreamStatus(context.Background())
	if err != nil || !endStatus.Success || endStatus.LastRun == "" {
		t.Fatalf("unexpected end stream status %+v err %v", endStatus, err)
	}
}

func TestClientReportsUnavailableModules(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	_, err := NewClient(server.URL, time.Second).GetHealth(context.Background())
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("expected ErrInvalidResponse, got %v", err)
	}
}

func TestClientHonorsTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(50 * time.Millisecond)
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	}))
	defer server.Close()

	_, err := NewClient(server.URL, time.Millisecond).GetHealth(context.Background())
	if err == nil {
		t.Fatal("expected timeout error")
	}
}

func TestIsLocalEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		want     bool
	}{
		{name: "loopback ipv4", endpoint: "http://127.0.0.1:47020", want: true},
		{name: "localhost", endpoint: "http://localhost:47020", want: true},
		{name: "loopback ipv6", endpoint: "http://[::1]:47020", want: true},
		{name: "https rejected", endpoint: "https://127.0.0.1:47020", want: false},
		{name: "remote host rejected", endpoint: "http://example.com:47020", want: false},
		{name: "remote ip rejected", endpoint: "http://192.168.1.10:47020", want: false},
		{name: "invalid rejected", endpoint: "not a url", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := IsLocalEndpoint(test.endpoint); got != test.want {
				t.Fatalf("IsLocalEndpoint(%q) = %v, want %v", test.endpoint, got, test.want)
			}
		})
	}
}

func TestClientLimitsResponseBodies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.Copy(w, strings.NewReader(`{"status":"`+strings.Repeat("x", maxResponseBytes)+`"}`))
	}))
	defer server.Close()

	_, err := NewClient(server.URL, time.Second).GetHealth(context.Background())
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("expected ErrInvalidResponse for oversized body, got %v", err)
	}
}
