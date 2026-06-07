# LivePanel

LivePanel is a local desktop control panel for Starsong Tools.

The long-term intent is for LivePanel to provide a single place to see status, launch tools, and run common actions across the Starsong Tools suite. The current implementation supports StreamSignal and TideReader.

Today, LivePanel can start StreamSignal and TideReader in service mode, show module status, switch active profiles, send StreamSignal announcements, run the StreamSignal end-stream workflow, and preview the active TideReader overlay without opening the full tool interfaces.

## Current StreamSignal Support

- Starts StreamSignal with `--service`.
- Opens StreamSignal with `--show` when the full UI is needed.
- Stops StreamSignal processes that LivePanel started when LivePanel closes.
- Shows StreamSignal mode, active profile, destination count, and recent workflow activity.
- Lists available StreamSignal profiles.
- Changes the active StreamSignal profile.
- Runs StreamSignal's `Go Live` announcement workflow.
- Runs StreamSignal's `End Stream` workflow.
- Provides a diagnostics view for troubleshooting the local StreamSignal connection.

LivePanel does not store StreamSignal credentials, profiles, or stream destination settings. Those stay in StreamSignal.

## Current TideReader Support

- Starts TideReader with `--service`.
- Opens TideReader with `--show` when the full UI is needed.
- Lists available TideReader overlay profiles.
- Changes the active TideReader overlay profile.
- Shows a native preview of TideReader's current overlay using TideReader's local now-playing and overlay settings JSON.
- Provides a compact overlay URL tooltip. Clicking the tooltip button copies the overlay URL to the clipboard.

LivePanel only reads TideReader's local overlay JSON and cover art from loopback HTTP URLs. Remote overlay and artwork URLs are rejected.

## Local Connections

LivePanel talks to StreamSignal and TideReader over a local HTTP interface called SIP, short for **Starsong Integration Protocol**.

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

TideReader overlay preview data defaults to:

```text
http://127.0.0.1:17655/overlay
http://127.0.0.1:17655/nowplaying.json
http://127.0.0.1:17655/overlay-settings.json
```

## Configuration

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `LIVEPANEL_STREAMSIGNAL_EXECUTABLE` | Explicit path to `StreamSignal.exe`. |
| `LIVEPANEL_STREAMSIGNAL_ENDPOINT` | Explicit local StreamSignal SIP endpoint. |
| `LIVEPANEL_TIDEREADER_EXECUTABLE` | Explicit path to `TideReader.Desktop.exe`. |
| `LIVEPANEL_TIDEREADER_ENDPOINT` | Explicit local TideReader SIP endpoint. |
| `LIVEPANEL_TIDEREADER_OVERLAY_URL` | Explicit local TideReader overlay URL. |
| `STREAMSIGNAL_ENV` | Passed through to StreamSignal when LivePanel starts it. Use `dev` for the StreamSignal dev data store. |

Endpoint and overlay URL overrides must be local HTTP, such as:

```text
http://127.0.0.1:47020
http://localhost:47020
```

Remote hosts are rejected.

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

## Useful Dev Launch

Example Windows launch using StreamSignal's dev data store and explicit dev tool builds:

```powershell
$env:STREAMSIGNAL_ENV = "dev"
$env:LIVEPANEL_STREAMSIGNAL_EXECUTABLE = "C:\path\to\StreamSignal.exe"
$env:LIVEPANEL_TIDEREADER_EXECUTABLE = "C:\path\to\TideReader.Desktop.exe"
.\build\bin\LivePanel.exe
```
