# LivePanel

LivePanel is a local desktop control panel for Starsong Tools.

The long-term intent is for LivePanel to provide a single place to see status, launch tools, and run common actions across the Starsong Tools suite. The current implementation supports StreamSignal first.

Today, LivePanel can start StreamSignal in service mode, show StreamSignal status, switch the active StreamSignal profile, send stream announcements, and run the end-stream workflow without opening the full StreamSignal interface.

## Current StreamSignal Support

- Starts StreamSignal with `--service`.
- Opens StreamSignal with `--show` when the full UI is needed.
- Stops StreamSignal processes that LivePanel started when LivePanel closes.
- Shows StreamSignal health, mode, active profile, destination count, and recent workflow activity.
- Lists available StreamSignal profiles.
- Changes the active StreamSignal profile.
- Runs StreamSignal's `Go Live` announcement workflow.
- Runs StreamSignal's `End Stream` workflow.
- Provides a diagnostics view for troubleshooting the local StreamSignal connection.

LivePanel does not store StreamSignal credentials, profiles, or stream destination settings. Those stay in StreamSignal.

## Planned Direction

LivePanel is expected to grow beyond StreamSignal and incorporate additional Starsong Tools as they expose compatible local integration points. StreamSignal support is the first implementation, not the full intended scope.

## StreamSignal Connection

LivePanel talks to StreamSignal over a local HTTP interface called SIP, short for **Starsong Integration Protocol**.

For this repository, the important part is simple: SIP is the local contract LivePanel uses to ask StreamSignal for status and to trigger StreamSignal-owned actions. It is not a public web API, and LivePanel only accepts local loopback SIP endpoints.

By default, LivePanel checks:

```text
http://127.0.0.1:47020
http://127.0.0.1:47021
...
http://127.0.0.1:47029
```

## Configuration

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `LIVEPANEL_STREAMSIGNAL_EXECUTABLE` | Explicit path to `StreamSignal.exe`. |
| `LIVEPANEL_STREAMSIGNAL_ENDPOINT` | Explicit local StreamSignal SIP endpoint. |
| `STREAMSIGNAL_ENV` | Passed through to StreamSignal when LivePanel starts it. Use `dev` for the StreamSignal dev data store. |

`LIVEPANEL_STREAMSIGNAL_ENDPOINT` must be local HTTP, such as:

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

The GitHub Actions CI workflow runs the Go tests, frontend tests, frontend build, frontend dependency audit, and `govulncheck` on pushes to `main` and on pull requests.

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

Example Windows launch using StreamSignal's dev data store:

```powershell
$env:STREAMSIGNAL_ENV = "dev"
$env:LIVEPANEL_STREAMSIGNAL_EXECUTABLE = "C:\path\to\StreamSignal.exe"
.\build\bin\LivePanel.exe
```
