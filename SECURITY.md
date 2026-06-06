# Security

## Supported Model

LivePanel is a local desktop application. Its SIP integrations are intended for loopback-only communication with locally installed Starsong tools.

The application currently:

- Restricts configured SIP endpoints to local HTTP loopback hosts.
- Uses bounded HTTP client timeouts for SIP requests.
- Limits decoded SIP response bodies to 1 MiB.
- Starts StreamSignal in `--service` mode for managed launches.
- Shuts down processes it launched when LivePanel exits.

LivePanel does not expose a public network service.

## Sensitive Data

LivePanel does not own StreamSignal credentials, profile storage, or destination secrets. Those remain in StreamSignal's Windows data stores. Avoid copying production credential stores into test fixtures or repository files.

## Configuration Safety

`LIVEPANEL_STREAMSIGNAL_EXECUTABLE` should point only to a trusted local StreamSignal executable.

`LIVEPANEL_STREAMSIGNAL_ENDPOINT` must use local HTTP loopback, such as:

```text
http://127.0.0.1:47020
http://localhost:47020
```

Remote hosts and non-HTTP schemes are rejected.

## Reporting

For private security issues, do not open a public issue with exploit details. Share:

- A concise description of the behavior.
- Reproduction steps.
- Expected impact.
- Affected platform and build.

Do not include real streaming credentials, account tokens, profile secrets, or production data stores in reports.
