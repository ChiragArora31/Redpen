---
name: redpen
description: Use Redpen to establish a coding task's definition of done, collect completion claims, independently verify repository evidence, and return a receipt when the user asks to use Redpen or verify a coding-agent handoff.
---

# Redpen

“Done” is a claim. Evidence makes it true.

Support the user's coding task; do not expand its scope. Explicit user instructions take priority over this workflow. Never present a successful test or changed file as proof of general correctness.

## Runtime

Use the bundled CLI, not an unpinned `npx` download: from this skill directory the entry point is `../../dist/cli.js`. Resolve that to an absolute path and invoke `node "<entrypoint>" <args>` in the user's repository. Every `redpen` example below means that bundled entry point, not a global executable. Quote paths and pass claim text as data, never as executable shell syntax.

Check that Node.js 18+, Git, a shell execution tool, the bundled runtime, and the intended repository are available. If any is missing, explain the prerequisite and stop verification. Ordinary web chat and a plugin installation alone do not grant repository or shell access. Do not request credentials, open a tunnel, install software, or turn prose into a verified receipt as a workaround.

Checks execute project code with the environment's existing permissions and can write files or use the network. Review the applicable test/build commands before executing them. Follow the client's approval requirements; the skill does not grant permissions or sandbox the project. Do not run unfamiliar project commands merely because a completion message mentions them.

## Before editing

Read `redpen status`. If no task exists, run `redpen start "<user's task>"` before implementation. For work that was already completed before this skill started, do not invent a historical task baseline: explain that a new session cannot establish which changes came from that work. A generic fresh `redpen check --markdown` can run project checks without attributing changes to a task.

For an existing task, preserve its baseline and criteria. If it belongs to another task or conversation, ask before replacing or rebinding it. Never use `--force` as an automatic workaround.

Show the generated contract briefly. Add only deterministic criteria that follow from the user's acceptance requirements. Use `--propose` for speculative requirements; they do not affect the verdict until the user accepts them. Do not remove or weaken criteria merely to obtain DONE.

For a suitable bugfix, add a focused regression criterion:

```bash
redpen add "Null cursor regression reproduces the bug" --type regression-test --path tests/null-cursor.test.mjs
```

This beta supports one named, unskipped `node:test` assertion test in JavaScript, with dependency-free snapshot execution. It overlays that current test on the saved baseline, requiring ERR_ASSERTION before and a pass afterward. Missing fixtures, dependencies, unsupported snapshots, or setup errors are UNVERIFIED. Use normal project test criteria for other ecosystems; do not claim equivalent regression proof.

## Completion

Implement the requested work normally. Record a concise, truthful completion summary via `redpen claims` (argument or stdin); it is input, not proof. Include caveats and unsupported claims rather than hiding them. Then run `redpen check --markdown` and return the receipt plus any remaining user actions. The user should not need to copy the summary or type Redpen commands during this workflow. Exit 1 means NOT DONE, not a CLI crash; exit 2 requires diagnosis. Only report PROVEN for results actually produced by Redpen. If execution is unavailable or interrupted, say no fresh verdict was obtained.

For a request to view the last receipt, use `redpen report` rather than rerunning checks. Preserve CHECK NEEDED when evidence is stale. Do not share receipts externally without the user's authorization and a privacy review.

The public directory package is hook-free. It verifies the summary recorded before the receipt, not a future final assistant message. Do not promise automatic post-response capture or background execution.

Only for the separate local beta: inspect the installed root `plugin.json`. If it explicitly declares `extensions.com.openai.hooks` and the user requests automatic capture, use the actual `CODEX_THREAD_ID`, when available, with `start --codex-session`. Never guess or rebind a session ID. Hooks need separate user trust; do not change trust settings. A trusted Stop hook can import the final message and recheck it. Do not recursively trigger retries. Manual `redpen import codex` is a fallback, not evidence that hooks ran.

Fix relevant failures within the task's authority. If completion needs new credentials, a human decision, or work outside scope, leave it clearly with the user. An extra unsupported claim stays visible; strict policy can make it blocking. Report the actual verdict, not a more flattering interpretation.
