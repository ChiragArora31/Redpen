---
name: redpen
description: Use Redpen to establish a coding task's definition of done, collect completion claims, independently verify repository evidence, and return a receipt when the user asks to use Redpen or verify a coding-agent handoff.
---

# Redpen

“Done” is a claim. Evidence makes it true.

Support the user's coding task; do not expand its scope. Explicit user instructions take priority over this workflow. Never present a successful test or changed file as proof of general correctness.

## Runtime

Use the bundled CLI, not an unpinned `npx` download: from this skill directory the entry point is `../../dist/cli.js`. Resolve that to an absolute path and invoke `node <entrypoint>` in the user's repository. Quote paths. Node.js 18+ and Git are required. If the runtime is missing, tell the user the plugin package is incomplete; do not download or install software without their request.

## Before editing

Read `redpen status`. If no task exists, run `redpen start "<user's task>"` before implementation. If `CODEX_THREAD_ID` is available and the user requested the Redpen workflow, add `--codex-session "<that id>"` to opt in to completion checks for this conversation. Do not invent an ID. An installed hook needs the user's trust; do not change trust settings yourself.

For an existing task, preserve its baseline and criteria. If it belongs to another task or conversation, ask before replacing or rebinding it. Never use `--force` as an automatic workaround.

Show the generated contract briefly. Add only deterministic criteria that follow from the user's acceptance requirements. Use `--propose` for speculative requirements; they do not affect the verdict until the user accepts them. Do not remove or weaken criteria merely to obtain DONE.

For a suitable bugfix, add a focused regression criterion:

```bash
redpen add "Null cursor regression reproduces the bug" --type regression-test --path tests/null-cursor.test.mjs
```

This beta supports one named, unskipped `node:test` assertion test in JavaScript, with dependency-free snapshot execution. It overlays that current test on the saved baseline, requiring ERR_ASSERTION before and a pass afterward. Missing fixtures, dependencies, unsupported snapshots, or setup errors are UNVERIFIED. Use normal project test criteria for other ecosystems; do not claim equivalent regression proof.

## Completion

Implement the requested work normally. Record a concise, truthful completion summary via `redpen claims` (argument or stdin); it is input, not proof. Include caveats and unsupported claims rather than hiding them. Then run `redpen check --markdown` and return the receipt plus any remaining user actions. Exit 1 means NOT DONE, not a CLI crash; exit 2 requires diagnosis.

If a trusted Stop hook is enabled for this bound conversation, it will import the actual final assistant message and recheck it automatically. Do not recursively trigger retries or promise that the hook is installed. Manual `redpen import codex` remains available when hooks are unsupported.

Fix relevant failures within the task's authority. If completion needs new credentials, a human decision, or work outside scope, leave it clearly with the user. An extra unsupported claim stays visible; strict policy can make it blocking. Report the actual verdict, not a more flattering interpretation.
