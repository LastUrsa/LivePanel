package sip

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

var streamSignalSIPV1Contract = map[string]string{
	"/api/v1/app":          `{"appId":"streamsignal","name":"StreamSignal","version":"0.3.1","mode":"standalone","protocolVersion":"1.0"}`,
	"/api/v1/health":       `{"status":"ready","message":"StreamSignal is ready for local SIP participation."}`,
	"/api/v1/capabilities": `{"supportsProfiles":true,"supportsStatusReporting":true,"supportsAnnouncements":true}`,
	"/api/v1/status":       `{"state":"idle","message":"Ready for announcement setup."}`,
}

func TestClientConsumesStreamSignalSIPV1Contract(t *testing.T) {
	server := httptest.NewServer(contractHandler(t, streamSignalSIPV1Contract))
	defer server.Close()

	snapshot, err := NewClient(server.URL, time.Second).FetchSnapshot(context.Background())
	if err != nil {
		t.Fatalf("FetchSnapshot returned error: %v", err)
	}

	if snapshot.App.AppID != "streamsignal" || snapshot.App.Name != "StreamSignal" || snapshot.App.Version != "0.3.1" || snapshot.App.Mode != "standalone" || snapshot.App.ProtocolVersion != "1.0" {
		t.Fatalf("unexpected app contract mapping: %+v", snapshot.App)
	}
	if snapshot.Health.Status != "ready" || snapshot.Health.Message == "" {
		t.Fatalf("unexpected health contract mapping: %+v", snapshot.Health)
	}
	assertCapabilities(t, snapshot.Capabilities.Names(), []string{"profiles", "status", "announcements"})
	if snapshot.Status["state"] != "idle" || snapshot.Status["message"] != "Ready for announcement setup." {
		t.Fatalf("unexpected status contract mapping: %+v", snapshot.Status)
	}
}

func TestClientIgnoresAdditiveSIPV1Fields(t *testing.T) {
	contract := map[string]string{
		"/api/v1/app":          `{"appId":"streamsignal","name":"StreamSignal","version":"0.3.1","mode":"standalone","protocolVersion":"1.0","futureField":"ok"}`,
		"/api/v1/health":       `{"status":"ready","message":"ok","details":{"future":true}}`,
		"/api/v1/capabilities": `{"supportsProfiles":true,"supportsStatusReporting":true,"supportsAnnouncements":true,"supportsFutureThing":true}`,
		"/api/v1/status":       `{"state":"idle","message":"Ready","futureStatus":"ignored by modules but preserved in raw status"}`,
	}
	server := httptest.NewServer(contractHandler(t, contract))
	defer server.Close()

	snapshot, err := NewClient(server.URL, time.Second).FetchSnapshot(context.Background())
	if err != nil {
		t.Fatalf("FetchSnapshot should tolerate additive fields: %v", err)
	}
	if snapshot.Status["futureStatus"] != "ignored by modules but preserved in raw status" {
		t.Fatalf("expected raw status to preserve additive fields, got %+v", snapshot.Status)
	}
}

func TestClientRejectsMissingRequiredContractFields(t *testing.T) {
	tests := []struct {
		name string
		path string
		body string
		call func(*Client) error
	}{
		{
			name: "app name",
			path: "/api/v1/app",
			body: `{"appId":"streamsignal","version":"0.3.1","mode":"standalone","protocolVersion":"1.0"}`,
			call: func(client *Client) error {
				_, err := client.GetApp(context.Background())
				return err
			},
		},
		{
			name: "health status",
			path: "/api/v1/health",
			body: `{"message":"missing status"}`,
			call: func(client *Client) error {
				_, err := client.GetHealth(context.Background())
				return err
			},
		},
		{
			name: "status payload",
			path: "/api/v1/status",
			body: `{}`,
			call: func(client *Client) error {
				_, err := client.GetStatus(context.Background())
				return err
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(contractHandler(t, map[string]string{test.path: test.body}))
			defer server.Close()

			if err := test.call(NewClient(server.URL, time.Second)); err == nil {
				t.Fatal("expected invalid response error")
			}
		})
	}
}

func contractHandler(t *testing.T, contract map[string]string) http.Handler {
	t.Helper()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("expected GET, got %s", r.Method)
		}
		body, ok := contract[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	})
}

func assertCapabilities(t *testing.T, got []string, want []string) {
	t.Helper()
	gotJSON, _ := json.Marshal(got)
	wantJSON, _ := json.Marshal(want)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("capabilities = %s, want %s", gotJSON, wantJSON)
	}
}
