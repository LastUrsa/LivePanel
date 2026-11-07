# Security

## Supported Model

LivePanel is a local desktop application. Its SIP integrations are intended for loopback-only communication with locally installed Starsong tools.

The application currently:

- Restricts configured SIP endpoints to local HTTP loopback hosts.
- Uses bounded HTTP client timeouts for SIP requests, with a five-minute limit for publishing workflows and shorter limits for discovery/status reads. Caller cancellation still applies.
- Limits decoded SIP response bodies to 1 MiB.
- Starts StreamSignal, TideReader, and TuberSwitch in `--service` mode for managed launches.
- Shuts down processes it launched when LivePanel exits.
- Sends manual-control changes only to local SIP endpoints owned by the dependent app.

LivePanel does not expose a public network service.

## Sensitive Data

LivePanel does not own StreamSignal credentials, TideReader overlay/profile data, TuberSwitch account or avatar settings, profile storage, or destination secrets. Those remain in the owning Starsong tools and their Windows data stores. Avoid copying production credential stores into test fixtures or repository files.

## Manual Control Data

LivePanel can pass user-edited StreamSignal announcement fields, TideReader browser support changes, and TuberSwitch redeem toggles to local SIP endpoints. These payloads are limited to the action being requested and stay inside loopback-only communication with the owning app.

StreamSignal one-time announcement field edits are sent with the `Go Live` request and are not persisted by LivePanel. TuberSwitch redeem changes use the manual/session endpoint so LivePanel does not save those changes back to the selected TuberSwitch profile. TideReader browser support is treated as an app-level setting owned by TideReader.

## Persistent Session Logs

LivePanel keeps automatic JSONL logs locally, with fixed 5 MiB rotation, 14-day retention, and a 100 MiB total budget. The active segment is protected. The log directory and files use restrictive creation permissions on platforms supporting Unix modes; Windows permissions inherit from the user's configuration directory. `LIVEPANEL_LOG_DIR` is intended for development/test isolation and should point to a private directory.

Logging accepts typed operational metadata. Credentials, announcement text, profile/scene/source names, raw HTTP payloads, URLs/query strings, arbitrary module status maps, and raw error messages are excluded. Error categories deliberately sacrifice some detail to avoid persisting secrets echoed by upstream services. Active profile IDs are stored only as hashed references for change detection; these are pseudonymous operational identifiers, not a guarantee of anonymity. No dependent app credential store or log file is collected.

Export Session Logs writes a user-selected ZIP of recognized retained LivePanel session files only. It skips symlink source entries, rejects symlink/non-file targets and destinations within the log directory, and writes to a temporary file before replacing the destination. Exports are local and never uploaded automatically. Logs and exports can still contain operational timing, tool versions, and connection history; review them before sharing.

Logging failures surface a brief UI warning and do not stop streaming actions. Session files are flushed to the operating system per record and synced at orderly process exit; logging is not guaranteed across power loss or forced termination.

## Linked Dev Builds

The linked dev scripts mirror local source checkouts into `C:\Temp\StarsongLinkedDev` so Windows build tools can avoid WSL UNC path issues. The mirror is for source and build artifacts only. The sync excludes `.git`, local agent metadata, dependency folders, generated output, logs, common environment files, database files, and common key/certificate file formats.

Do not place production credential stores or account tokens in the repository tree. If a linked dev mirror is no longer needed, it can be deleted from `C:\Temp\StarsongLinkedDev`.

## Configuration Safety

`LIVEPANEL_STREAMSIGNAL_EXECUTABLE`, `LIVEPANEL_TIDEREADER_EXECUTABLE`, and `LIVEPANEL_TUBERSWITCH_EXECUTABLE` should point only to trusted local Starsong tool executables.

`LIVEPANEL_STREAMSIGNAL_ENDPOINT`, `LIVEPANEL_TIDEREADER_ENDPOINT`, and `LIVEPANEL_TUBERSWITCH_ENDPOINT` must use local HTTP loopback, such as:

```text
http://127.0.0.1:47020
http://localhost:47020
```

Remote hosts and non-HTTP schemes are rejected.

`LIVEPANEL_TIDEREADER_OVERLAY_URL` is also restricted to local HTTP loopback. LivePanel rejects remote overlay URLs and remote artwork URLs when rendering the TideReader preview.

## Reporting

For private security issues, do not open a public issue with exploit details. Share:

- A concise description of the behavior.
- Reproduction steps.
- Expected impact.
- Affected platform and build.

Do not include real streaming credentials, account tokens, profile secrets, or production data stores in reports.
