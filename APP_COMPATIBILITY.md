# LivePanel App Compatibility

This document tracks the minimum dependent Starsong app versions required by each LivePanel release. Keep the README focused on the current release requirements, and update this matrix whenever a LivePanel release changes its StreamSignal, TideReader, or TuberSwitch requirements.

Each matching release note entry should also include the app requirements for that LivePanel version.

| LivePanel Version | StreamSignal | TideReader | TuberSwitch | Notes |
| --- | --- | --- | --- | --- |
| v0.2.0 | v0.5.1 or newer | v0.6.0 or newer | v0.7.1 or newer | Adds StreamSignal one-time announcement field overrides, TideReader browser-support and Smart Text preview data, and TuberSwitch manageable redeems with the manual/session endpoint. |
| v0.1.0 | v0.4.0 or newer | v0.5.0 or newer | v0.6.0 or newer | Initial SIP and service-mode support. |

## Update Checklist

- Update the current requirements table in [README.md](./README.md).
- Add or update the row for the LivePanel version in this file.
- Add the same app requirements to that version's section in [RELEASE_NOTES.md](./RELEASE_NOTES.md).
- Confirm the dependent app releases are published or clearly mark requirements as capability-based until exact app versions are finalized.
