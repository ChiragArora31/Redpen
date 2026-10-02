# Changelog

## 0.3.0

- Add reviewable Markdown evidence receipts with `redpen check --markdown` and non-executing `redpen report`
- Mark receipts CHECK NEEDED when repository evidence has changed since the last check
- Add optional strict-claims policy through `--strict-claims` or shareable `.redpen/config.json`
- Make `redpen explain` show contradicted and unverified agent claims, not just incomplete task criteria
- Tighten coverage freshness so a successful command cannot reuse an earlier report
- Extend the versioned JSON report with the applied claim policy

## 0.2.0

- Add reusable, shareable task proof plans with `redpen init` and `start --template`
- Add task criteria with `redpen add`, including reviewable proposals and advisory checks
- Add file-existence, literal-content, custom-command, lint, typecheck, and JSON coverage verifiers
- Explain unresolved required checks with `redpen explain`
- Detect repository or project-config changes that make a check stale
- Extend the versioned report with required/advisory summaries and evidence freshness

## 0.1.1

- Exclude dependency and generated directories from repository evidence
- Clarify that extra unverified claims do not expand the Definition of Done
- Reduce noisy claim splitting for structured completion messages

## 0.1.0

First public release.

- Task-aware sessions and editable Definitions of Done
- Baseline-aware Git evidence
- Deterministic `PROVEN`, `FAILED`, and `UNVERIFIED` verdicts
- Test, build, changed-test, and changed-file verification
- Manual agent claims with deterministic normalization
- Local Codex session discovery and import
- Versioned, privacy-conscious JSON reports
