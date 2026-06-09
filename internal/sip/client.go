package sip

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrInvalidResponse = errors.New("invalid SIP response")

const maxResponseBytes = 1 << 20

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func LocalEndpoint(port int) string {
	return fmt.Sprintf("http://127.0.0.1:%d", port)
}

func IsLocalEndpoint(rawURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme != "http" {
		return false
	}
	host := parsed.Hostname()
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (c *Client) GetApp(ctx context.Context) (AppInfo, error) {
	var out AppInfo
	err := c.get(ctx, "/api/v1/app", &out)
	if err != nil {
		return AppInfo{}, err
	}
	if strings.TrimSpace(out.Name) == "" || strings.TrimSpace(out.Version) == "" {
		return AppInfo{}, ErrInvalidResponse
	}
	return out, nil
}

func (c *Client) GetHealth(ctx context.Context) (Health, error) {
	var out Health
	err := c.get(ctx, "/api/v1/health", &out)
	if err != nil {
		return Health{}, err
	}
	if strings.TrimSpace(out.Status) == "" {
		return Health{}, ErrInvalidResponse
	}
	return out, nil
}

func (c *Client) GetCapabilities(ctx context.Context) (Capabilities, error) {
	var out Capabilities
	err := c.get(ctx, "/api/v1/capabilities", &out)
	if err != nil {
		return Capabilities{}, err
	}
	return out, nil
}

func (c *Client) GetStatus(ctx context.Context) (Status, error) {
	var out Status
	err := c.get(ctx, "/api/v1/status", &out)
	if err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, ErrInvalidResponse
	}
	return out, nil
}

func (c *Client) GetProfiles(ctx context.Context) (ProfilesResponse, error) {
	var out ProfilesResponse
	err := c.get(ctx, "/api/v1/profiles", &out)
	if err != nil {
		return ProfilesResponse{}, err
	}
	if out.Profiles == nil {
		out.Profiles = []string{}
	}
	return out, nil
}

func (c *Client) GetCurrentProfile(ctx context.Context) (CurrentProfileResponse, error) {
	var out CurrentProfileResponse
	err := c.get(ctx, "/api/v1/profile/current", &out)
	if err != nil {
		return CurrentProfileResponse{}, err
	}
	return out, nil
}

func (c *Client) ActivateProfile(ctx context.Context, profile string) (ProfileActivationResponse, error) {
	var out ProfileActivationResponse
	err := c.post(ctx, "/api/v1/profile", ActivateProfileRequest{Profile: profile}, &out)
	if err != nil {
		return ProfileActivationResponse{}, err
	}
	return out, nil
}

func (c *Client) Announce(ctx context.Context) (AnnounceResponse, error) {
	var out AnnounceResponse
	err := c.post(ctx, "/api/v1/announce", map[string]any{}, &out)
	if err != nil {
		return AnnounceResponse{}, err
	}
	return out, nil
}

func (c *Client) ConfirmAnnouncement(ctx context.Context, confirmationID string) (AnnounceResponse, error) {
	var out AnnounceResponse
	err := c.post(ctx, "/api/v1/announce/confirm", AnnounceConfirmRequest{ConfirmationID: confirmationID}, &out)
	if err != nil {
		return AnnounceResponse{}, err
	}
	return out, nil
}

func (c *Client) GetAnnounceStatus(ctx context.Context) (AnnounceStatusResponse, error) {
	var out AnnounceStatusResponse
	err := c.get(ctx, "/api/v1/announce/status", &out)
	if err != nil {
		return AnnounceStatusResponse{}, err
	}
	return out, nil
}

func (c *Client) EndStream(ctx context.Context) (EndStreamResponse, error) {
	var out EndStreamResponse
	err := c.post(ctx, "/api/v1/end-stream", map[string]any{}, &out)
	if err != nil {
		return EndStreamResponse{}, err
	}
	return out, nil
}

func (c *Client) GetEndStreamStatus(ctx context.Context) (EndStreamStatusResponse, error) {
	var out EndStreamStatusResponse
	err := c.get(ctx, "/api/v1/end-stream/status", &out)
	if err != nil {
		return EndStreamStatusResponse{}, err
	}
	return out, nil
}

func (c *Client) FetchSnapshot(ctx context.Context) (Snapshot, error) {
	app, err := c.GetApp(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	health, err := c.GetHealth(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	capabilities, err := c.GetCapabilities(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	status, err := c.GetStatus(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{
		Endpoint:     c.baseURL,
		App:          app,
		Health:       health,
		Capabilities: capabilities,
		Status:       status,
	}, nil
}

func (c *Client) post(ctx context.Context, path string, in any, out any) error {
	requestURL, err := url.JoinPath(c.baseURL, path)
	if err != nil {
		return err
	}
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(in); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, &body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errorResponse ErrorResponse
		if err := json.NewDecoder(io.LimitReader(resp.Body, maxResponseBytes)).Decode(&errorResponse); err == nil && strings.TrimSpace(errorResponse.Error) != "" {
			return errors.New(errorResponse.Error)
		}
		return fmt.Errorf("%w: status %d", ErrInvalidResponse, resp.StatusCode)
	}

	decoder := json.NewDecoder(io.LimitReader(resp.Body, maxResponseBytes))
	if err := decoder.Decode(out); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidResponse, err)
	}
	return nil
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	requestURL, err := url.JoinPath(c.baseURL, path)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errorResponse ErrorResponse
		if err := json.NewDecoder(io.LimitReader(resp.Body, maxResponseBytes)).Decode(&errorResponse); err == nil && strings.TrimSpace(errorResponse.Error) != "" {
			return errors.New(errorResponse.Error)
		}
		return fmt.Errorf("%w: status %d", ErrInvalidResponse, resp.StatusCode)
	}

	decoder := json.NewDecoder(io.LimitReader(resp.Body, maxResponseBytes))
	if err := decoder.Decode(out); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidResponse, err)
	}
	return nil
}
