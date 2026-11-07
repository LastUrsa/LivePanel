# Release Readiness Checklist

This maintainer checklist is for LivePanel release candidates, packaging, and final publication. Keep user setup guidance in the README and use this file for release execution.

## Current Candidate

Release target: `v1.0.0`; supported companion baseline: StreamSignal, TideReader, and TuberSwitch `v1.0.0` (published stable releases). See [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md) for evidence. Unchecked interactive product/install items are not represented as tested by automated validation.

## Release Prep

- [x] Confirm `wails.json` and `frontend/package.json` version metadata match the release version.
- [x] Add or update the matching `## vX.Y.Z` section in [RELEASE_NOTES.md](./RELEASE_NOTES.md).
- [x] Confirm [README.md](./README.md) lists the current minimum dependent app versions.
- [x] Confirm [APP_COMPATIBILITY.md](./APP_COMPATIBILITY.md) includes the release's dependent app requirements.
- [x] Confirm the release notes section documents the release's dependent app requirements.
- [x] Confirm StreamSignal, TideReader, and TuberSwitch compatible releases are published.
- [ ] Confirm no high-severity security or release-blocking issues remain open.

## Local Validation

- [x] Run `npm test` from `frontend`.
- [x] Run `npm run build` from `frontend`.
- [x] Run `go test ./...`.
- [x] Run `go test -race ./...`.
- [x] Run `go vet ./...`.
- [x] Run `npm audit --audit-level=moderate` from `frontend`.
- [x] Run `govulncheck ./...`.

## Product Validation

- [ ] Verify LivePanel starts StreamSignal, TideReader, and TuberSwitch in service mode.
- [ ] Verify each app can be opened with the full UI from LivePanel.
- [ ] Verify Dashboard profile selection works for all three apps; TuberSwitch remains optimistic while activation settles, confirms the selected profile, and rolls back with an error if confirmation never arrives.
- [ ] Verify StreamSignal `Go Live` and `End Stream` actions work against a safe test profile, tolerate multi-request publishing delays, and surface returned/rejected errors on Stream Control without leaving controls busy.
- [ ] Verify immediate action errors remain visible across stale or failed status refreshes.
- [ ] Verify StreamSignal announcement fields populate from the selected profile/status data, can be edited for one announcement, and reset when a different profile is selected.
- [ ] Verify TideReader browser support can be toggled from LivePanel and browser-sourced now-playing data is hidden from the overlay preview while browser support is disabled.
- [ ] Verify TideReader overlay preview renders local overlay data, honors Smart Text overflow modes, and treats a `0` character limit as unlimited.
- [ ] Verify TuberSwitch shows only manageable redeems, labels manual changes as temporary, and uses the manual/session path without saving profile changes.
- [ ] Verify partial TuberSwitch profile activation errors remain visible while LivePanel refreshes the resulting profile, OBS, and redeem state.
- [ ] Verify the top readiness bar shows OBS as offline/red unless TuberSwitch or another compatible module reports a positive OBS connection state, including boolean and nested OBS status payloads.
- [ ] Verify a connected OBS instance stays connected in the readiness bar with an `Offline` scene/source after End Stream; genuine disconnections and reconnection attempts remain visible.
- [ ] Verify Diagnostics shows SIP status, endpoints, capabilities, versions, and executable paths for compatible app versions.
- [ ] Verify older non-SIP/service-mode app versions do not appear and are covered by README requirements.

- [ ] Verify session logs survive restarts and capture returned/rejected actions, timeouts, and module/OBS changes without recording content or credentials.
- [ ] Verify Diagnostics Open Logs Folder and Export Session Logs work on Windows, including export cancellation, overwrite, and locations containing spaces/non-ASCII characters.
- [ ] Verify retained exports contain previous/current sessions and no unrelated files; log write failures show a warning while controls remain usable.

## Packaging And Release

- [ ] Verify the isolated packaged-app startup/shutdown smoke passes.
- [ ] Run the release workflow manually with `publish_release` disabled for the target version.
- [ ] Download and inspect the Windows installer, portable zip, and `SHA256SUMS.txt`.
- [ ] Install the Windows installer on a clean or disposable profile and verify first launch.
- [ ] Verify upgrade behavior from the previous LivePanel release.
- [ ] Verify the GitHub Release notes match [RELEASE_NOTES.md](./RELEASE_NOTES.md).
- [ ] Publish by pushing a `vX.Y.Z` tag or running the release workflow with `publish_release` enabled.
