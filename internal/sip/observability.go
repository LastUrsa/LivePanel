package sip

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"
)

// Additive SIP metadata. Legacy servers can omit every field.
type ResponseMetadata struct {
	RequestID            string              `json:"requestId,omitempty"`
	SessionID            string              `json:"sessionId,omitempty"`
	OperationID          string              `json:"operationId,omitempty"`
	ObservedAt           string              `json:"observedAt,omitempty"`
	UpdatedAt            string              `json:"updatedAt,omitempty"`
	ConfirmedAt          string              `json:"confirmedAt,omitempty"`
	ConfirmedOperationID string              `json:"confirmedOperationId,omitempty"`
	Revision             int64               `json:"revision,omitempty"`
	ErrorCode            string              `json:"errorCode,omitempty"`
	Message              string              `json:"message,omitempty"`
	Retryable            bool                `json:"retryable"`
	Operation            *Operation          `json:"operation,omitempty"`
	Results              []DestinationResult `json:"results,omitempty"`
}

type Operation struct {
	ID                   string              `json:"id"`
	RequestID            string              `json:"requestId"`
	SessionID            string              `json:"sessionId"`
	Kind                 string              `json:"kind"`
	Phase                string              `json:"phase"`
	Outcome              string              `json:"outcome"`
	StartedAt            string              `json:"startedAt"`
	UpdatedAt            string              `json:"updatedAt"`
	CompletedAt          string              `json:"completedAt,omitempty"`
	ErrorCode            string              `json:"errorCode,omitempty"`
	Message              string              `json:"message,omitempty"`
	Retryable            bool                `json:"retryable"`
	RequiresConfirmation bool                `json:"requiresConfirmation,omitempty"`
	ConfirmationID       string              `json:"confirmationId,omitempty"`
	Results              []DestinationResult `json:"results,omitempty"`
}

type DestinationResult struct {
	Integration   string        `json:"integration,omitempty"`
	DestinationID string        `json:"destinationId"`
	Platform      string        `json:"platform"`
	State         string        `json:"state"`
	Phase         string        `json:"phase"`
	ErrorCode     string        `json:"errorCode,omitempty"`
	Message       string        `json:"message,omitempty"`
	Retryable     bool          `json:"retryable"`
	Published     *bool         `json:"published"`
	StartedAt     string        `json:"startedAt,omitempty"`
	CompletedAt   string        `json:"completedAt,omitempty"`
	Stages        []ResultStage `json:"stages,omitempty"`
}

type ResultStage struct {
	Phase     string `json:"phase"`
	State     string `json:"state"`
	ErrorCode string `json:"errorCode,omitempty"`
}

var metadataID = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,64}$`)
var operationID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func newRequestID() string { var b [12]byte; _, _ = rand.Read(b[:]); return hex.EncodeToString(b[:]) }
func (c *Client) SetCorrelationIDProvider(provider func(context.Context) string) {
	c.correlationID = provider
}
func (c *Client) SetAsyncPublishing(enabled bool) { c.asyncPublishing = enabled }
func (c *Client) requestID(ctx context.Context) string {
	if c.correlationID != nil {
		if id := c.correlationID(ctx); metadataID.MatchString(id) {
			return id
		}
	}
	return newRequestID()
}

func (c *Client) awaitOperation(ctx context.Context, metadata *ResponseMetadata, out any) error {
	id := metadata.OperationID
	if !operationID.MatchString(id) {
		return fmt.Errorf("%w: missing operation ID", ErrInvalidResponse)
	}
	for {
		if metadata.Operation != nil && metadata.Operation.Outcome != "running" {
			op := metadata.Operation
			if op.ID != id {
				return fmt.Errorf("%w: operation ID mismatch", ErrInvalidResponse)
			}
			payload := struct {
				ResponseMetadata
				Success              bool   `json:"success"`
				RequiresConfirmation bool   `json:"requiresConfirmation,omitempty"`
				ConfirmationID       string `json:"confirmationId,omitempty"`
				Error                string `json:"error,omitempty"`
			}{ResponseMetadata: *metadata, Success: op.Outcome == "success", RequiresConfirmation: op.RequiresConfirmation, ConfirmationID: op.ConfirmationID}
			payload.ErrorCode, payload.Message, payload.Results = op.ErrorCode, op.Message, op.Results
			if !payload.Success && !op.RequiresConfirmation {
				payload.Error = op.Message
				if payload.Error == "" {
					payload.Error = "Publishing did not complete. Check the operation before retrying."
				}
			}
			data, err := json.Marshal(payload)
			if err != nil {
				return err
			}
			return json.Unmarshal(data, out)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
		var next ResponseMetadata
		if err := c.get(ctx, "/api/v1/operations/"+id, &next); err != nil {
			return err
		}
		*metadata = next
		if metadata.Operation == nil || metadata.Operation.ID != id {
			return fmt.Errorf("%w: missing or mismatched operation", ErrInvalidResponse)
		}
	}
}

func decodeResponse(resp *http.Response, out any) (ResponseMetadata, error) {
	var metadata ResponseMetadata
	var data json.RawMessage
	if err := json.NewDecoder(http.MaxBytesReader(nil, resp.Body, maxResponseBytes)).Decode(&data); err != nil {
		return metadata, fmt.Errorf("%w: %v", ErrInvalidResponse, err)
	}
	_ = json.Unmarshal(data, &metadata)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var failure ErrorResponse
		_ = json.Unmarshal(data, &failure)
		// Keep legacy display errors for old servers. Safe metadata is logged separately.
		if failure.Error != "" {
			return metadata, errors.New(failure.Error)
		}
		return metadata, fmt.Errorf("%w: status %d", ErrInvalidResponse, resp.StatusCode)
	}
	if err := json.Unmarshal(data, out); err != nil {
		return metadata, fmt.Errorf("%w: %v", ErrInvalidResponse, err)
	}
	return metadata, nil
}

func operationOutcome(metadata ResponseMetadata) string {
	if metadata.Operation != nil {
		return metadata.Operation.Outcome
	}
	return ""
}

func metadataResults(m ResponseMetadata) []DestinationResult {
	if len(m.Results) > 0 {
		return m.Results
	}
	if m.Operation != nil {
		return m.Operation.Results
	}
	return nil
}
