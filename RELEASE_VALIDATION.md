# LivePanel 1.0.0 Release Validation

Local candidate validation: 2026-11-07 (America/New_York).

## Automated evidence

- Frontend: 64 tests passed; TypeScript/Vite production build passed.
- Full Go race/coverage suite and `go vet ./...` passed. Coverage: SIP client 82.3%, session logger 74.5%, module service 40.4%, app package 47.8% statements. Coverage is evidence of exercised paths, not a guarantee of complete behavior.
- Native Windows Go tests and a production build passed in an isolated source mirror.
- `npm audit`: zero vulnerabilities. Linux and Windows `govulncheck`: no vulnerabilities found in the tested graph.
- Inert Windows resource fixtures reproduce blank version strings without a `FileVersion` string; including it makes Windows expose the expected file/product fields. The packaged startup gate checks those fields on the real build.
- Workflow YAML passed actionlint. The release metadata script accepts matching tag/manual versions and rejects mismatches; Wails, npm package and lockfile metadata are aligned to 1.0.0.
- New regression coverage verifies current TideReader executable priority when a stale legacy executable also exists, legacy fallback, and saved-path precedence.
- Fixture-based SIP compatibility tests cover all three released companion 1.0 schemas: numeric protocol version 1, capability names, current-profile confirmation/revision metadata, and producer/detection observations. Existing publishing tests cover capability-gated async polling, no repeated publishing POST, uncertain outcomes and legacy behavior.
- The common SIP observability contract is byte-identical to the files in StreamSignal, TideReader and TuberSwitch v1.0.0 tags. Those stable releases are published.

## Release gate

Before tagging, run the Release workflow with version 1.0.0 and publishing disabled. It checks the metadata, repeats tests and security scans, builds a Windows NSIS installer, and runs `scripts/test-release-startup.ps1` against the packaged app. That smoke uses isolated config/log paths, explicit missing companion executables, and isolated loopback endpoints; it requires Windows product/version resources and verifies a main window, a stable process, orderly shutdown, and versioned session logs. It cannot launch installed companions or post to providers. The workflow then validates notes, packages the portable ZIP, writes SHA-256 checksums, and verifies/uploads assets. The tag workflow repeats these gates before publication.

## Validation boundaries

This audit does not claim a live end-to-end streaming session against personal provider credentials, actual OBS/redeem changes, or media/browser playback. Compatibility checks use fixtures reviewed against released owner schemas, rather than launching the installed companion suite. Unit tests cover log rotation/export/privacy, but the interactive native export/folder dialogs and manual install/upgrade acceptance are not represented as performed. Product checklist items remain available in RELEASE_READINESS_CHECKLIST.md.

The current workflow does not configure Authenticode signing. Logs/exports remain local and can reveal operational timing even though content and secrets are excluded. These are point-in-time automated results, not a guarantee against unknown security issues.
