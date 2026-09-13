# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories for this repository. Do not include secrets or private agent transcripts in a public issue.

## Trust boundaries

Redpen runs test and build commands discovered from the repository. Those commands execute with the current user's permissions; review unfamiliar repositories before running `redpen check`.

Imported Codex transcripts are untrusted input. Redpen reads the final completion message and compact metadata, but never executes transcript commands or accepts reported command results as proof. Verification commands are run independently.

`.redpen/session.json` may contain an agent completion message and local metadata. `.redpen/report.json` omits transcript paths and absolute repository paths, but command output can still contain project-provided sensitive data. Inspect reports before sharing them.

Supported security fixes target the latest published version.
