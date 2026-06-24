# LivePanel Release Notes

Release notes are part of the LivePanel release process. Before publishing a release, add a matching `## vX.Y.Z` section here. The release workflow publishes that section as the GitHub Release body and fails if it is missing or empty.

## v0.2.0

### Highlights

- Adds manual-control drawers for the current stream session across StreamSignal, TideReader, and TuberSwitch.
- Supports one-time StreamSignal announcement field edits for `Go Live` without saving those edits back to the selected StreamSignal profile.
- Adds TideReader browser support controls and improves the LivePanel overlay preview for browser-disabled states, Smart Text overflow modes, and unlimited `0` character limits.
- Adds TuberSwitch manageable redeem controls that use the manual/session endpoint instead of mutating profile redeems.
- Adds main-screen indicators for temporary `Manual edit` overrides and TideReader `Browser Support On` state.
- Makes the app details drawer resizable and updates drawer headings to describe app-owned data instead of implying every value is profile-owned.
- Makes OBS readiness conservative: missing, offline, disconnected, or not-connected OBS status is shown as offline with the design-system danger color.
- Recognizes StreamSignal OBS readiness from `obsConnected`, summary/state fields, and nested OBS status payloads so LivePanel updates when OBS connects.
- Keeps a newly selected TuberSwitch profile active in LivePanel while SIP status catches up, avoiding fallback to the previous/default profile after activation.

### App Requirements

- StreamSignal v0.5.1 or newer.
- TideReader v0.6.0 or newer.
- TuberSwitch v0.7.1 or newer.

### Security And Validation

- Keeps new manual-control traffic on local SIP endpoints only.
- Does not store StreamSignal announcement drafts, TideReader profile data, or TuberSwitch redeem/session changes in LivePanel.
- Updates frontend audit dependencies so `npm audit --audit-level=moderate` reports no vulnerabilities.
- Release validation includes frontend tests/build, Go tests, Go race tests, frontend dependency audit, and `govulncheck`.

## v0.1.0

### Highlights

- Adds the initial LivePanel desktop control panel for StreamSignal, TideReader, and TuberSwitch.
- Starts dependent apps in service mode and opens their full UI when needed.
- Shows module status, active profiles, SIP diagnostics, and resolved executable paths.
- Provides stream-session controls for StreamSignal announcements, end-stream workflow, TideReader overlay preview, and TuberSwitch profile selection.

### Requirements

- Requires SIP and service-mode compliant dependent app versions:
  - StreamSignal v0.4.0 or newer.
  - TideReader v0.5.0 or newer.
  - TuberSwitch v0.6.0 or newer.

### Security And Validation

- Keeps SIP and TideReader overlay reads restricted to local HTTP loopback endpoints.
- Uses bounded HTTP timeouts and response-size limits for local integration reads.
- Stores only LivePanel module executable path overrides; app credentials and profile data remain in the owning tools.
- Release validation includes frontend tests/build, Go tests, frontend dependency audit, and `govulncheck`.

### Release Artifacts

- `LivePanel-v0.1.0-windows-amd64-installer.exe`
- `LivePanel-v0.1.0-windows-amd64-portable.zip`
- `SHA256SUMS.txt`
