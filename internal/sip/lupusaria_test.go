package sip

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLupusAriaSIPClientContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method + " " + r.URL.Path {
		case "POST /api/v1/bot/start":
			_, _ = w.Write([]byte(`{"success":true,"botState":"running"}`))
		case "POST /api/v1/bot/stop":
			_, _ = w.Write([]byte(`{"success":true,"botState":"idle"}`))
		case "GET /api/v1/features":
			_, _ = w.Write([]byte(`{"features":[{"id":"raffle","label":"Raffle","enabled":false,"effective":false}]}`))
		case "POST /api/v1/features":
			var input struct {
				ID      string
				Enabled bool
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.ID != "raffle" || !input.Enabled {
				t.Errorf("unexpected feature update: %+v, %v", input, err)
			}
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"success":false,"error":"Raffle activation failed.","features":[{"id":"raffle","label":"Raffle","enabled":true,"effective":false}]}`))
		case "GET /api/v1/logs":
			_, _ = w.Write([]byte(`{"logs":[{"level":"warn","message":"Raffle verification failed.","requestId":"operation-1"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	ctx := context.Background()
	client := NewClient(server.URL, time.Second)
	if out, err := client.SetBotRunning(ctx, true); err != nil || !out.Success || out.BotState != "running" {
		t.Fatalf("start: %+v, %v", out, err)
	}
	if out, err := client.GetBotFeatures(ctx); err != nil || len(out.Features) != 1 || out.Features[0].Enabled {
		t.Fatalf("features: %+v, %v", out, err)
	}
	if out, err := client.SetBotFeature(ctx, "raffle", true); err == nil || out.Error == "" || len(out.Features) != 1 ||
		!out.Features[0].Enabled || out.Features[0].Effective {
		t.Fatalf("activation failure must retain saved and effective state: %+v, %v", out, err)
	}
	if out, err := client.GetBotLogs(ctx); err != nil || len(out.Logs) != 1 || out.Logs[0].RequestID != "operation-1" {
		t.Fatalf("logs: %+v, %v", out, err)
	}
	if out, err := client.SetBotRunning(ctx, false); err != nil || !out.Success || out.BotState != "idle" {
		t.Fatalf("stop: %+v, %v", out, err)
	}
}
