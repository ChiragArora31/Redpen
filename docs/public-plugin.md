# Redpen coding-workflow plugin

Define done before editing. Verify the work before handing it back.

Ask your coding client:

> Use Redpen for this task: fix pagination when the cursor is null. Define the acceptance criteria before editing and return the evidence receipt.

The skill starts a task baseline, preserves an existing contract, records a concise completion summary, runs the bundled verifier independently, and returns PROVEN / FAILED / UNVERIFIED results. You do not need to copy claims or type CLI commands during a supported coding workflow.

## Where it works

The plugin needs a shell-capable coding environment with the intended Git repository, Node.js 18+, and Git available. It does not install runtimes or grant computer access. Ordinary ChatGPT web/mobile chat without those execution capabilities cannot verify a local repository. A directory listing is not a promise of identical capabilities on every surface.

The submission package has no lifecycle hooks, MCP server, backend, authentication, telemetry, or external model API dependency. It verifies the summary recorded before the receipt, not the assistant message after it is sent. The hook-enabled local beta is a separate distribution.

## Before public directory approval

Build and validate the candidate from the source repository:

```bash
npm ci
npm run plugin:pack
npm run plugin:validate
codex plugin marketplace add ./artifacts/public
codex plugin add redpen@redpen-public
codex plugin list --marketplace redpen-public
```

This is a local candidate install, not public directory publication. Start a fresh coding session and invoke `$redpen`. The installed package bundles its runtime, so no global CLI or unpinned `npx` download is needed. Keep the marketplace directory available, and refresh/reinstall after rebuilding it. Do not enable the hook beta and public candidate together for the same task.

After OpenAI approves and publishes the listing, install Redpen from the plugin directory and use it in a supported coding environment. No public directory URL is claimed until it exists.

## What the receipt means

- PROVEN: the configured check found concrete supporting evidence.
- FAILED: the check found contradictory evidence.
- UNVERIFIED: the evidence is missing or the check is unsupported.
- DONE: the configured required contract is satisfied, not proof of general software correctness.
- CHECK NEEDED: repository or task inputs changed after verification.

Existing tasks are not reset automatically. A new baseline cannot retroactively prove what an earlier task changed. Extra unsupported claims stay visible; `--strict-claims` can make them blocking.

Checks execute your project code with the environment's existing permissions. Review commands and follow the client's approval flow. Nothing in this plugin bypasses it.

[Support](https://github.com/ChiragArora31/Redpen/blob/main/SUPPORT.md) · [Privacy](https://github.com/ChiragArora31/Redpen/blob/main/PRIVACY.md) · [MIT license](https://github.com/ChiragArora31/Redpen/blob/main/LICENSE)
