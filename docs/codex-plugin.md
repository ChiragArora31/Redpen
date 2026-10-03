# Codex plugin beta (v0.4)

Ask Codex: **“Use Redpen for this task: fix pagination when the cursor is null.”**

The skill establishes the baseline and task contract before editing, records claims, independently checks evidence, and returns a Markdown receipt. Optional trusted Stop hooks capture the actual final message and recheck it. This is a local coding workflow, not a ChatGPT web app or published directory listing.

## Install the published package

After v0.4.0 is published, run this in a directory where you want to keep the beta installation (not your coding project's tracked source):

```bash
npm install --prefix ./redpen-plugin-beta redpen-cli@0.4.0
codex plugin marketplace add ./redpen-plugin-beta/node_modules/redpen-cli
codex plugin add redpen@redpen-beta
codex plugin list --marketplace redpen-beta
```

This installs the same bundled CLI, skill, hook, and local marketplace manifest as the source workflow below. Do not remove the beta installation directory while that marketplace is configured.

## Install from source

Node.js 18+, Git, npm, and a Codex version with plugin support are required. Tested with Codex CLI 0.159.0-alpha.12.1 on macOS. Older clients may not support the portable manifest or hooks.

```bash
git clone https://github.com/ChiragArora31/Redpen.git
cd Redpen
npm ci
npm run build
codex plugin marketplace add .
codex plugin add redpen@redpen-beta
codex plugin list --marketplace redpen-beta
```

Start a fresh Codex session with the plugin enabled. Use `$redpen` or “use Redpen for this task.” Installation does not automatically trust bundled hooks. Review `hooks/hooks.json` and `hooks/codex-stop.mjs`, then grant trust in your Codex client if you want automatic final-message verification. No instruction in this plugin grants itself trust.

The skill calls its bundled `dist/cli.js`, so it does not depend on a global Redpen version or make an unpinned npm download at runtime. Rebuild/reinstall after source changes; Codex caches installed plugins. `npm pack` also ships the portable plugin alongside the CLI.

## Opt-in scope

Ordinary `redpen start` does not enable hooks. To bind a task explicitly:

```bash
redpen start "Fix pagination" --codex-session <actual-codex-session-id>
```

The skill uses `CODEX_THREAD_ID` when available. It must not guess an ID or replace an existing task. Only a Stop event with that matching ID can import and run checks. An empty message, recursive Stop, another conversation, or an unbound task is ignored. Hooks remain informational: NOT DONE does not force Codex into a retry loop. Configure strict claims in `.redpen/config.json` if every extra claim must block DONE until proven.

The hook allows up to 600 seconds total; individual commands retain Redpen's 120-second default timeout. Large proof plans can exceed the hook budget. Interrupted checks do not grant a new verdict. If `.redpen/codex-hook.lock` remains after interruption, confirm no check is running, remove that directory, then run `redpen check` manually.

Without trusted hooks, the skill still records a truthful summary and runs `redpen check --markdown`. `redpen import codex` remains the fallback for the actual final completion. Do not advertise automatic capture unless the client's hooks are enabled and trusted.

## Architecture and limits

`plugin.json` is the portable manifest. `skills/redpen` defines the workflow. `hooks/codex-stop.mjs` consumes the documented Stop JSON fields (`cwd`, `session_id`, `turn_id`, `last_assistant_message`, `stop_hook_active`), not a guessed transcript schema. The core adapter/import/registry/engine are reused. Agent words never supply executable commands or verification exit codes.

No MCP server, backend, account, telemetry, or external LLM dependency is added. Project checks can access your files and network; Redpen is not a sandbox. See [SECURITY.md](../SECURITY.md) and [PRIVACY.md](../PRIVACY.md).

The local manifest was installed and listed using a temporary isolated Codex home, including a plugin path with spaces. The Stop wire protocol and independent checks are exercised by automated tests. A real interactive client's trusted-hook activation still needs a beta tester to confirm; it is not claimed as proven by those tests.

Official contracts: [plugin packaging](https://developers.openai.com/plugins/build/plugins), [skills](https://developers.openai.com/plugins/build/skills), [Codex hooks](https://learn.chatgpt.com/docs/hooks). Hooks and platform availability may change; their assumptions are contained in the plugin layer.
