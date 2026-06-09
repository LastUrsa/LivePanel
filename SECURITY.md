# Security

## Supported Model

LivePanel is a local desktop application. Its SIP integrations are intended for loopback-only communication with locally installed Starsong tools.

The application currently:

- Restricts configured SIP endpoints to local HTTP loopback hosts.
- Uses bounded HTTP client timeouts for SIP requests.
- Limits decoded SIP response bodies to 1 MiB.
- Starts StreamSignal, TideReader, and TuberSwitch in `--service` mode for managed launches.
- Shuts down processes it launched when LivePanel exits.

LivePanel does not expose a public network service.

## Sensitive Data

LivePanel does not own StreamSignal credentials, TideReader overlay/profile data, TuberSwitch account or avatar settings, profile storage, or destination secrets. Those remain in the owning Starsong tools and their Windows data stores. Avoid copying production credential stores into test fixtures or repository files.

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
