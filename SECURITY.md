# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories for this repository. Do not include secrets or private agent transcripts in a public issue.

## Trust boundaries

Redpen runs test and build commands discovered from the repository. Those commands execute with the current user's permissions; review unfamiliar repositories before running `redpen check`.

Imported Codex transcripts are untrusted input. Redpen reads the final completion message and compact metadata, but never executes transcript commands or accepts reported command results as proof. Verification commands are run independently.

`.redpen/session.json` may contain an agent completion message and local metadata. `.redpen/report.json` omits transcript paths and absolute repository paths, but command output can still contain project-provided sensitive data. Inspect reports before sharing them.

The Codex Stop hook is inert unless the active task explicitly binds its `codexBinding.sessionId` to the current conversation. Installing a plugin does not authorize its hooks: review and trust them in Codex separately. The hook returns an informational receipt; it never blocks, loops, or executes commands extracted from an assistant message. Enabled checks execute the project commands already in the task contract.

Regression checks copy regular Git blobs into disposable directories and overlay the current focused test on the baseline. They reject symlinks and submodules and never reuse the user's dependency directory. This protects the checkout from ordinary test writes, but is not an OS security sandbox: tests remain executable code with your permissions. Do not run them against an untrusted repository.

Supported security fixes target the latest published version.
