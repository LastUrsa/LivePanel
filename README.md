# LivePanel

LivePanel is a local desktop control panel for Starsong Tools.

The long-term intent is for LivePanel to provide a single place to see status, launch tools, and run common actions across the Starsong Tools suite. The current implementation supports StreamSignal, TideReader, and TuberSwitch.

Today, LivePanel can start StreamSignal, TideReader, and TuberSwitch in service mode, show module status, switch active profiles, send StreamSignal announcements with one-time field edits, run the StreamSignal end-stream workflow, toggle app-level TideReader browser support, temporarily adjust manageable TuberSwitch redeems, and preview the active TideReader overlay without opening the full tool interfaces.

## App Requirements

LivePanel v0.2.0 requires SIP and service-mode compliant versions of the dependent Starsong apps listed below. Earlier versions are not expected to appear in LivePanel Diagnostics or may not expose the controls required by this LivePanel release.

| App | Minimum Version |
| --- | --- |
| StreamSignal | v0.5.1 or newer |
| TideReader | v0.6.0 or newer |
| TuberSwitch | v0.7.1 or newer |

Update this table for each LivePanel release. Historical per-release requirements are tracked in [APP_COMPATIBILITY.md](./APP_COMPATIBILITY.md), and the matching release notes should repeat the requirements for that release.

## What LivePanel Does

- Starts StreamSignal, TideReader, and TuberSwitch with `--service`.
- Opens each app with `--show` when the full UI is needed.
- Shows module health, active profiles, app detail drawers, SIP endpoints, resolved executable paths, capabilities, and raw status payloads.
- Switches StreamSignal, TideReader, and TuberSwitch profiles for the current stream session.
- Runs StreamSignal `Go Live` and `End Stream` workflows.
- Lets a user edit StreamSignal announcement fields for a single `Go Live` action without saving those edits back to the StreamSignal profile. Selecting a StreamSignal profile reloads those fields from the active profile/status data.
- Lets a user toggle TideReader browser support as an app-level setting.
- Shows TideReader overlay preview data from local now-playing and overlay settings JSON, including Smart Text overflow modes. When TideReader browser support is disabled, browser-sourced now-playing data is hidden from the preview.
- Shows only manageable TuberSwitch redeems in LivePanel and applies redeem toggle changes through TuberSwitch's manual/session endpoint instead of saving them back to the profile.
- Marks temporary StreamSignal and TuberSwitch session overrides with a `Manual edit` indicator, and marks TideReader app-level browser support with a `Browser Support On` indicator.
- Uses a resizable app details drawer for per-app status and manual controls.

LivePanel does not store StreamSignal credentials, TideReader overlay/profile data, TuberSwitch account or avatar settings, profile storage, or destination secrets. Those stay in the owning apps.

## Local Connections

LivePanel talks to StreamSignal, TideReader, and TuberSwitch over a local HTTP interface called SIP, short for **Starsong Integration Protocol**.

For this repository, the important part is simple: SIP is the local contract LivePanel uses to ask tools for status and to trigger tool-owned actions. It is not a public web API, and LivePanel only accepts local loopback SIP endpoints.

By default, LivePanel checks StreamSignal SIP endpoints:

```text
http://127.0.0.1:47020
http://127.0.0.1:47021
...
http://127.0.0.1:47029
```

And TideReader SIP endpoints:

```text
http://127.0.0.1:47030
http://127.0.0.1:47031
...
http://127.0.0.1:47039
```

And TuberSwitch SIP endpoints:

```text
http://127.0.0.1:47040
http://127.0.0.1:47041
...
http://127.0.0.1:47049
```

TideReader overlay preview data defaults to:

```text
http://127.0.0.1:17655/overlay
http://127.0.0.1:17655/nowplaying.json
http://127.0.0.1:17655/overlay-settings.json
```

## Configuration

LivePanel's Settings page includes **Module Locations** controls for StreamSignal, TideReader, TuberSwitch, and future catalogued modules. Users can paste an executable path, browse for the executable, or clear a saved override to return to auto-detection.

Executable path resolution order is:

1. Environment variable override.
2. Saved LivePanel module location.
3. Standard Starsong Tools install path beneath `%ProgramFiles%\Starsong Tools`.
4. Local development build path.
5. Legacy install path.
6. Executable-name fallback.

Standard Windows install paths checked by auto-detection are:

```text
%ProgramFiles%\Starsong Tools\StreamSignal\StreamSignal.exe
%ProgramFiles%\Starsong Tools\TideReader\TideReader.Desktop.exe
%ProgramFiles%\Starsong Tools\TideReader\TideReader.exe
%ProgramFiles%\Starsong Tools\TuberSwitch\TuberSwitch.exe
```

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `LIVEPANEL_STREAMSIGNAL_EXECUTABLE` | Explicit path to `StreamSignal.exe`. |
| `LIVEPANEL_STREAMSIGNAL_ENDPOINT` | Explicit local StreamSignal SIP endpoint. |
| `LIVEPANEL_TIDEREADER_EXECUTABLE` | Explicit path to `TideReader.Desktop.exe` or `TideReader.exe`. |
| `LIVEPANEL_TIDEREADER_ENDPOINT` | Explicit local TideReader SIP endpoint. |
| `LIVEPANEL_TIDEREADER_OVERLAY_URL` | Explicit local TideReader overlay URL. |
| `LIVEPANEL_TUBERSWITCH_EXECUTABLE` | Explicit path to `TuberSwitch.exe`. |
| `LIVEPANEL_TUBERSWITCH_ENDPOINT` | Explicit local TuberSwitch SIP endpoint. |
| `LIVEPANEL_CONFIG_PATH` | Explicit path for LivePanel's persisted config JSON. Mostly useful for tests/dev. |
| `STREAMSIGNAL_ENV` | Passed through to StreamSignal when LivePanel starts it. Use `dev` for the StreamSignal dev data store. |

Endpoint and overlay URL overrides must be local HTTP, such as:

```text
http://127.0.0.1:47020
http://localhost:47020
```

Remote hosts are rejected.

Diagnostics are intentionally separate from Settings. Use the Diagnostics tab for module health, SIP endpoints, resolved executable paths, capabilities, and raw status payloads.

## Manual Controls

LivePanel manual controls are intentionally scoped to the owning app:

- StreamSignal announcement fields are temporary per announcement. LivePanel sends the current field drafts with `Go Live`; it does not save those drafts to the selected StreamSignal profile.
- TideReader browser support is an app-level toggle because TideReader does not tie that setting to profiles.
- TuberSwitch redeem toggles use the manual/session redeem endpoint so LivePanel can adjust the current stream session without mutating the selected TuberSwitch profile.

Temporary StreamSignal and TuberSwitch overrides show a `Manual edit` indicator on the main setup cards until the values match the selected profile again. TideReader browser support shows `Browser Support On` when enabled because that toggle is app-level rather than profile/session-specific.

The app detail drawers use SIP capabilities and status payloads to decide which controls to show. If an older dependent app does not expose a required capability or endpoint, the corresponding LivePanel control may be hidden or show an unavailable state.

## Development

Use Go `1.26.4` or newer. Earlier Go 1.26 patch releases include standard-library vulnerabilities reported by `govulncheck`.

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run backend tests:

```bash
go test ./...
```

Run frontend tests:

```bash
cd frontend
npm test
```

Build the frontend:

```bash
cd frontend
npm run build
```

Run frontend dependency audit:

```bash
cd frontend
npm audit --audit-level=moderate
```

Run Go vulnerability checks:

```bash
govulncheck ./...
```

The GitHub Actions CI workflow installs frontend dependencies, runs frontend tests, builds the frontend for Go embedding, runs Go tests, audits frontend dependencies, and runs `govulncheck` on pushes to `main` and on pull requests.

## Windows Build

Build the Windows app from a Windows-local checkout or temporary copy.

Building directly from `\\wsl.localhost\...` can fail because Go may be unable to lock `go.mod` over the UNC path.

From the LivePanel repo on Windows:

```powershell
wails build -platform windows/amd64
```

The executable is written to:

```text
build/bin/LivePanel.exe
```

## Release Process

LivePanel releases are published by the GitHub Actions Release workflow. The workflow runs frontend tests, frontend build, Go tests, frontend dependency audit, `govulncheck`, Wails Windows installer packaging, release-note validation, artifact checks, and then publishes the GitHub Release when requested.

Before publishing a release:

1. Update `wails.json` and `frontend/package.json` version metadata.
2. Add a matching `## vX.Y.Z` section to `RELEASE_NOTES.md`.
3. Work through `RELEASE_READINESS_CHECKLIST.md`.
4. Run the Release workflow manually with `publish_release` disabled and inspect the uploaded artifacts.
5. Publish by pushing a `vX.Y.Z` tag or rerunning the Release workflow with `publish_release` enabled.

Expected release artifacts:

```text
LivePanel-vX.Y.Z-windows-amd64-installer.exe
LivePanel-vX.Y.Z-windows-amd64-portable.zip
SHA256SUMS.txt
```

## Useful Dev Launch

Example Windows launch using StreamSignal's dev data store and explicit dev tool builds:

```powershell
$env:STREAMSIGNAL_ENV = "dev"
$env:LIVEPANEL_STREAMSIGNAL_EXECUTABLE = "C:\path\to\StreamSignal.exe"
$env:LIVEPANEL_TIDEREADER_EXECUTABLE = "C:\path\to\TideReader.Desktop.exe" # or TideReader.exe
$env:LIVEPANEL_TUBERSWITCH_EXECUTABLE = "C:\path\to\TuberSwitch.exe"
.\build\bin\LivePanel.exe
```

### Linked Windows Test Build From WSL

Use the linked-dev scripts when testing LivePanel against local StreamSignal,
TideReader, and TuberSwitch builds. The wrapper syncs WSL checkouts into a
Windows-local mirror, builds selected apps from native `C:\...` paths, stages
runtime binaries, launches LivePanel with the right environment variables, and
checks SIP health.

Build changed apps and launch:

```bash
./scripts/linked-dev.sh -Build livepanel,tuberswitch -Launch
```

Launch from already staged builds:

```bash
./scripts/linked-dev.sh -Build none -Launch
```

Build all apps and launch:

```bash
./scripts/linked-dev.sh -Build all -Launch
```

The default mirror and runtime staging root is:

```text
C:\Temp\StarsongLinkedDev
```

The PowerShell orchestrator is `scripts\linked-dev.ps1`; the WSL wrapper is
`scripts/linked-dev.sh`.

TideReader service mode uses backend port `127.0.0.1:17656` plus SIP discovery
ports `47030-47039`. If LivePanel shows TideReader as not loaded, check for a
stale process or port conflict before relaunching:

```cmd
netstat -ano | findstr :17656
taskkill /IM TideReader.Desktop.exe /F
```

TideReader early startup diagnostics are written to:

```text
%APPDATA%\TideReader\logs\startup.log
```
