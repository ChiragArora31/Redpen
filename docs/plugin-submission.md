# Public plugin submission

Status: prepared locally, not uploaded or approved. On October 3, 2026 the Platform portal blocked upload until developer identity verification is completed. Signing in alone is insufficient.

## What is being submitted

Redpen is a skills-only coding-workflow plugin with its own bundled JavaScript CLI. It establishes the task contract before editing, collects completion claims, independently verifies repository evidence, and returns a receipt. It has no remote MCP service, app references, credentials, telemetry, or lifecycle hooks.

The source checkout also contains the optional hook-enabled local beta. **Do not upload the repository ZIP or npm tarball.** The public builder produces a separate hook-free artifact because the current submission rules do not accept lifecycle hooks.

```bash
npm ci
npm run check
npm test
npm run plugin:pack
npm run plugin:validate
npm run smoke:package -- --codex
npm run demo:cases
```

Upload `artifacts/redpen-plugin-0.4.1.zip`. The neighboring SHA-256 file and `plugin-inventory.json` identify its contents. Rebuild after changing bundled files. Local validation is not a substitute for the portal's scans.

## Acceptance evidence

- 96 automated tests cover the extracted ZIP's real Git task workflow, tests/build evidence, unsupported claims, strict-claims policy, stale receipts, and safe output handling.
- The public candidate installed, enabled, and listed successfully using Codex CLI 0.160.0 in an isolated profile without authentication or hook trust changes.
- A system ZIP integrity check passed for all 51 packaged files.
- Packaging checks reject unsupported files, hooks, source maps, missing imports, active SVG content, malformed listing metadata, and obvious credential-shaped content. They are not a comprehensive secret scanner.
- Existing core tests cover failed checks, absent commands, malformed sessions/transcripts, baseline attribution, command safety, timeouts, and legacy sessions.

The installed skill's end-to-end conversation behavior still needs a human client smoke test. Deterministic CLI tests do not establish whether an LLM follows every instruction. Do not claim broad ChatGPT web/mobile support: the environment must expose a shell, the repository, Node.js 18+, and Git.

## Human smoke test

Install the public candidate as described in [the installation guide](./public-plugin.md), then use a fresh conversation and a disposable repository:

1. Ask: “Use Redpen for this task. Fix null cursor pagination and add a regression test.” Confirm the baseline exists before edits.
2. Confirm the agent records its real completion summary, executes the bundled checker, and returns the receipt. No global CLI should be necessary.
3. Make tests fail. Confirm NOT DONE and concrete failed evidence, not a green receipt.
4. Add an unsupported compatibility claim. It must remain UNVERIFIED. Required criteria still determine DONE unless strict claims are enabled.
5. Change code after a check. Ask for the last receipt; it must say CHECK NEEDED without rerunning tests.
6. Try an environment without a repository or shell. It must explain prerequisites rather than invent a result or ask for credentials.

## Portal steps remaining

1. Complete Individual or Business developer identity verification in Platform organization settings. The account owner must handle documents and any agreements.
2. Upload the validated public ZIP at [Platform plugins](https://platform.openai.com/plugins).
3. Review the parsed listing, icon previews, policies, and skill scan results. Correct actual findings and upload a new artifact when necessary.
4. Complete the portal's policy attestations and submit for review. Legal acceptance requires the account owner's confirmation.
5. After approval, publish the listing and verify installation from the public directory. Record the real listing URL here and in the README.

For a skills-only plugin, current guidance does not require an MCP test-case upload or demo recording. The above acceptance matrix is our QA, not a fabricated portal requirement. No approval date or discoverability is guaranteed.

## Authoritative guidance

- [Submission](https://developers.openai.com/plugins/deploy/submission)
- [Plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)

The npm CLI and public directory have separate release processes. Version 0.4.1 is prepared here; this work does not claim it has been published to npm.
