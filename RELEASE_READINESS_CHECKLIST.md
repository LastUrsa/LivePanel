# Release Readiness Checklist

This maintainer checklist is for LivePanel release candidates, packaging, and final publication. Keep user setup guidance in the README and use this file for release execution.

## Release Prep

- [ ] Confirm `wails.json` and `frontend/package.json` version metadata match the release version.
- [ ] Add or update the matching `## vX.Y.Z` section in [RELEASE_NOTES.md](./RELEASE_NOTES.md).
- [ ] Confirm [README.md](./README.md) lists the current minimum dependent app versions.
- [ ] Confirm [APP_COMPATIBILITY.md](./APP_COMPATIBILITY.md) includes the release's dependent app requirements.
- [ ] Confirm the release notes section documents the release's dependent app requirements.
- [ ] Confirm StreamSignal, TideReader, and TuberSwitch compatible releases are published.
- [ ] Confirm no high-severity security or release-blocking issues remain open.

## Local Validation

- [ ] Run `npm test` from `frontend`.
- [ ] Run `npm run build` from `frontend`.
- [ ] Run `go test ./...`.
- [ ] Run `npm audit --audit-level=moderate` from `frontend`.
- [ ] Run `govulncheck ./...`.

## Product Validation

- [ ] Verify LivePanel starts StreamSignal, TideReader, and TuberSwitch in service mode.
- [ ] Verify each app can be opened with the full UI from LivePanel.
- [ ] Verify Dashboard profile selection works for all three apps.
- [ ] Verify StreamSignal `Go Live` and `End Stream` actions work against a safe test profile.
- [ ] Verify StreamSignal announcement fields populate from the selected profile/status data, can be edited for one announcement, and reset when a different profile is selected.
- [ ] Verify TideReader browser support can be toggled from LivePanel and browser-sourced now-playing data is hidden from the overlay preview while browser support is disabled.
- [ ] Verify TideReader overlay preview renders local overlay data, honors Smart Text overflow modes, and treats a `0` character limit as unlimited.
- [ ] Verify TuberSwitch shows only manageable redeems and redeem toggles use the manual/session path without saving profile changes.
- [ ] Verify the top readiness bar shows OBS as offline/red unless StreamSignal reports a positive OBS connection state.
- [ ] Verify Diagnostics shows SIP status, endpoints, capabilities, versions, and executable paths for compatible app versions.
- [ ] Verify older non-SIP/service-mode app versions do not appear and are covered by README requirements.

## Packaging And Release

- [ ] Run the release workflow manually with `publish_release` disabled for the target version.
- [ ] Download and inspect the Windows installer, portable zip, and `SHA256SUMS.txt`.
- [ ] Install the Windows installer on a clean or disposable profile and verify first launch.
- [ ] Verify upgrade behavior from the previous LivePanel release.
- [ ] Verify the GitHub Release notes match [RELEASE_NOTES.md](./RELEASE_NOTES.md).
- [ ] Publish by pushing a `vX.Y.Z` tag or running the release workflow with `publish_release` enabled.
