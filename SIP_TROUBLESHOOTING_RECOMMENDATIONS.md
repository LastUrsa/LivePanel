# Companion App Troubleshooting API Recommendations

These recommendations are implemented by the companion-app observability branches and the additive [SIP Observability v1 contract](./SIP_OBSERVABILITY_V1.md). Existing APIs remain supported. StreamSignal retains durable publishing history; TideReader keeps a bounded in-memory history, and TuberSwitch exposes its existing OBS-owned avatar source changes as integration results.

## Shared SIP Contract

- Accept a client correlation ID (for example `X-Request-ID`) and return it in action responses and owner-app logs. Keep the app's launch/session ID and operation ID distinct. LivePanel correlates its action and HTTP records with owner operation/session IDs when advertised.
- Return stable, documented `errorCode`, `retryable`, and sanitized `message` fields. Messages must be explicitly safe for logging, without credentials, announcement content, personal paths, or raw remote responses. Include `retryAfterSeconds` when appropriate.
- Expose operation start/completion times, current phase, and terminal outcome (`success`, `partial`, `failed`, `canceled`, or `unknown`). Include `updatedAt`/`observedAt` on status snapshots so consumers can identify stale state.
- Add capability-advertised operation lookup, such as `GET /api/v1/operations/{id}`, with bounded history across restarts where practical. A client timeout must not force a blind retry; accept an idempotency key for publishing actions so repeated requests cannot duplicate posts.
- Expose safe diagnostic metadata: app/build version, protocol version, app session ID, uptime, and dependency connection states with last-change timestamps. Do not expose credential values or arbitrary file reads through diagnostic endpoints.

## StreamSignal — Highest Priority

The updated announcement/end-stream responses retain the legacy aggregate fields and add bounded per-destination results, publication confirmation, safe failure stages, and operation lookup.

- Expose a bounded `results` list for announcement/end-stream operations: destination ID, platform, state, phase, error code, start/completion times, and whether a post was confirmed published. Keep platform authentication failures distinguishable from disabled/skipped destinations, validation errors, and timeouts.
- Separate primary post publication from follow-up work such as Bluesky Live Now and history persistence. If the post succeeded but Live Now failed, report both outcomes so consumers do not encourage a duplicate post.
- Return a stable operation ID in both immediate and last-run status responses. Persist enough recent operation history to inspect the previous stream after an app restart.
- Replace long synchronous publishing requests with `202 Accepted` plus operation polling, or explicitly align/document server response deadlines with the complete multi-destination workflow. The previous 10-second write timeout has been replaced by a five-minute server deadline; asynchronous work has a separate 4.5-minute execution budget.
- Expose credential readiness as safe per-destination state (`configured`, `missing`, `rejected`, `unknown`), never tokens/passwords. A credential readiness status should not perform a real post.

## TuberSwitch

TuberSwitch already exposes `obsConnected` and `obsConnectionState`. Keep these authoritative; scene/source summary strings should remain display-only.

- Add `obsObservedAt`, `obsLastConnectedAt`, `obsLastDisconnectedAt`, last sanitized disconnect code, and next reconnect attempt time.
- Return per-integration profile activation results for OBS-owned avatar sources, redeem updates, and profile storage, with requested profile ID, confirmed active profile ID, and operation ID. Distinguish activation accepted, completed, and partially applied.
- Expose a machine-readable observation timestamp for active-profile confirmation, allowing LivePanel to replace its bounded refresh-count heuristic.

## TideReader

TideReader already exposes source, browser-support, overlay settings, and a now-playing summary. Troubleshooting metadata should avoid copying track titles or browsing content.

- Add per-provider/browser connection states and last-success/last-update times, with stable reasons for idle, disabled, unsupported, unavailable, or stale data.
- Report overlay server readiness separately from metadata source health. Include a sanitized error code and observation time for each dependency.
- Return an operation ID and confirmed settings/profile revision for profile/browser-support changes, so consumers can tell an accepted request from an applied change.

## Implementation Order

1. StreamSignal per-destination results and publish-vs-follow-up outcomes.
2. Shared correlation IDs, safe error codes, and operation IDs.
3. StreamSignal asynchronous operations with idempotency and recent history.
4. TuberSwitch connection/profile confirmation timestamps.
5. TideReader source freshness and separate overlay/provider health.
