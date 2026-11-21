package sip

import (
	"context"
	"time"
)

type BotFeature struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Enabled   bool   `json:"enabled"`
	Effective bool   `json:"effective"`
}

type BotLog struct {
	At        string `json:"at"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	RequestID string `json:"requestId,omitempty"`
}

type BotResponse struct {
	ResponseMetadata
	Success  bool         `json:"success"`
	BotState string       `json:"botState,omitempty"`
	Error    string       `json:"error,omitempty"`
	Features []BotFeature `json:"features,omitempty"`
	Logs     []BotLog     `json:"logs,omitempty"`
}

func (c *Client) GetBotFeatures(ctx context.Context) (out BotResponse, err error) {
	err = c.get(ctx, "/api/v1/features", &out)
	return
}

func (c *Client) GetBotLogs(ctx context.Context) (out BotResponse, err error) {
	err = c.get(ctx, "/api/v1/logs", &out)
	return
}

func (c *Client) SetBotFeature(ctx context.Context, id string, enabled bool) (BotResponse, error) {
	return c.postBot(ctx, "/api/v1/features", map[string]any{"id": id, "enabled": enabled})
}

func (c *Client) SetBotRunning(ctx context.Context, start bool) (BotResponse, error) {
	path := "/api/v1/bot/stop"
	if start {
		path = "/api/v1/bot/start"
	}
	return c.postBot(ctx, path, struct{}{})
}

func (c *Client) postBot(ctx context.Context, path string, input any) (out BotResponse, err error) {
	httpClient := *c.httpClient
	httpClient.Timeout = 35 * time.Second
	client := *c
	client.httpClient = &httpClient
	err = client.post(ctx, path, input, &out)
	return
}
