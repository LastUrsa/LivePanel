# LivePanel Release Notes

Release notes are part of the LivePanel release process. Before publishing a release, add a matching `## vX.Y.Z` section here. The release workflow publishes that section as the GitHub Release body and fails if it is missing or empty.

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
