# Changelog

## 0.4.1 (release candidate)

- Build a separate hook-free public plugin ZIP with the bundled ESM runtime, skill, icons, starter prompts, and policy files
- Validate artifact contents, metadata, imports, and deterministic checksums without changing the hook-enabled local beta
- Clarify execution prerequisites, approvals, completion capture, and evidence limits in the skill
- Expand privacy and support documentation and test the extracted ZIP against a real task repository
- Public directory publication remains subject to developer verification, portal scans, and review

## 0.4.0

- Package a local Codex plugin beta with a task-contract skill and bundled CLI runtime
- Add opt-in Stop hook completion capture and independent verification, scoped to an explicitly bound Codex conversation
- Keep hooks nonblocking, idempotent, and safe against transcript-command execution
- Add a focused `regression-test` verifier: current node:test assertion fails on the saved baseline and passes on the current snapshot
- Reject setup failures, skipped tests and unsupported regression environments as proof
- Add schema v9 task-input fingerprints so changed criteria and replaced claims invalidate old receipts
- Add five reproducible real-repository demo cases and a beta testing/submission handoff
- Keep existing sessions and older reports readable; older receipts require a fresh check for input freshness

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
