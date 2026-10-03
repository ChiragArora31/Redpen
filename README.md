<h1 align="center">
  <img src="https://raw.githubusercontent.com/ChiragArora31/Redpen/main/docs/redpen.svg" width="330" alt="Redpen" />
</h1>

<p align="center"><strong>“Done” is a claim. Evidence makes it true.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/redpen-cli"><img src="https://img.shields.io/npm/v/redpen-cli?style=flat-square&color=cf222e" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f2328?style=flat-square" alt="MIT license" /></a>
</p>

Your coding agent says:

```text
Done.
Fixed the bug.
Added regression coverage.
Everything passes.
No breaking changes.
```

Redpen checks the work.

**Plugin:** the [public submission candidate](./docs/public-plugin.md) bundles the skill and verification runtime. Ask “use Redpen for this task”; it establishes the contract and returns an evidence receipt in a shell-capable coding environment. It needs Node.js 18+, Git, and repository access. Directory approval is pending, not claimed. Optional completion hooks remain a separate [local beta](./docs/codex-plugin.md).

```text
REDPEN

TASK
Fix pagination when cursor is null

DEFINITION OF DONE
────────────────────────────────

✓ Implementation changed
  2 files changed · +6 -2

✓ Regression coverage
  tests/pagination.test.mjs

✓ Tests pass
  npm run test · exit 0

✓ Build passes
  npm run build · exit 0

AGENT CLAIMS
────────────────────────────────

✓ "Updated src/pagination.mjs."
  src/pagination.mjs · +2 -2

✓ "Added regression coverage."
  tests/pagination.test.mjs

✓ "All tests pass."
  npm run test · exit 0

✓ "Build succeeds."
  npm run build · exit 0

? "No breaking changes."
  No deterministic verifier is available. Redpen doesn't guess.

────────────────────────────────
8 proven · 0 failed · 1 unverified

DONE

Definition of Done is proven.

1 additional claim remains unverified.
They may be correct. Redpen just can't prove them yet.
```

## Try it

Requires Node.js 18 or newer and Git.

```bash
npm install -g redpen-cli

redpen start "Fix pagination when cursor is null"

# work normally with Codex

redpen import codex
redpen check
```

Want to hand the result to a reviewer? `redpen report` prints a concise Markdown evidence receipt from the last check without rerunning tests. It says `CHECK NEEDED` and exits nonzero if repository files changed afterward.

To make the task contract more specific, add proof before checking:

```bash
redpen add "API response includes a cursor" --type content-matches --path src/pagination.ts --text "nextCursor"
redpen add "integration test passes" --command npm run test:integration
redpen explain  # what still lacks evidence after a check
```

These checks are deterministic: literal content and a successful command do not, on their own, prove a bug is semantically fixed.

No global install:

```bash
npx redpen-cli --help
```

## Why Redpen?

Coding agents rarely end with “I have no idea whether this works.”

They end with “Done.”

That one word can hide several claims: code changed, regression coverage was added, tests pass, the project builds, callers were not broken. Some of those claims are easy to prove. Some need a human. Redpen separates the two.

The agent's completion message is input—not truth.

## Three answers

Redpen does not turn uncertainty into a green checkmark.

- `PROVEN` — concrete evidence supports the claim.
- `FAILED` — an applicable check produced contrary evidence.
- `UNVERIFIED` — Redpen cannot prove or disprove it.

The third answer matters. `UNVERIFIED` does not mean a claim is false. It means Redpen does not have deterministic evidence capable of proving it.

The Definition of Done is the task contract. An extra unverified agent claim stays visible but does not expand that contract or block `DONE`; a claim contradicted by evidence does block it.

For a stricter handoff, use `redpen check --strict-claims`. Every agent claim must then be proven for `DONE`. Teams can commit `"policy": { "requireAllClaims": true }` in `.redpen/config.json` to apply that rule by default. Unsupported semantic claims will remain unverified and block a strict verdict; Redpen will not pretend that a generic test proves them.

## What Redpen verifies today

- implementation changes since the task began
- added or changed test files
- Node.js test and build scripts
- Python tests through project metadata
- direct file-change claims
- project-specific file, literal-content, command, lint, typecheck, and coverage criteria
- claims imported from Codex or entered manually

Tests and builds run independently. A transcript saying “tests pass” is never accepted as proof that tests pass.

Redpen does not prove semantic correctness, API compatibility, or the absence of breaking changes. Those claims stay visible and unverified unless a deterministic verifier exists.

## This is not CI

CI asks:

> Did the checks we configured pass?

Redpen asks:

> What did this task require? What did the agent claim? What evidence supports each claim?

```text
Task
  ↓
Definition of Done
  ↓
Agent work and completion claims
  ↓
Independent repository evidence
  ↓
PROVEN · FAILED · UNVERIFIED
```

Redpen complements CI. It connects checks to a specific task and the claims made about it.

## How it works

`redpen start` records the task, current commit, and relevant Git working-tree state. This prevents work that existed before the task from being credited to the agent.

`redpen import codex` finds a completed local Codex session using session ID, repository path, and time. It stores the final message as untrusted claims. Ambiguous matches are refused rather than guessed.

`redpen check` collects fresh Git evidence and runs applicable tests and builds. Results are shown in the terminal and written to the versioned `.redpen/report.json` artifact.

### Prove a regression, not just a changed test (v0.4)

```bash
redpen add "Null cursor regression" --type regression-test --path tests/null-cursor.test.mjs
redpen check
```

The same focused test must fail with an assertion on the saved baseline and pass on the current snapshot. Both runs use temporary copies; your checkout and index stay untouched. This proves the tested case, not general correctness.

The beta supports one named, unskipped JavaScript `node:test` case without external dependencies, builds, symlinks or submodules (up to 500 files / 25 MB). Setup errors remain `UNVERIFIED`; a test that already passed on the baseline is `FAILED` as regression evidence. Python and richer test-runner environments still use the existing test-pass checks.

`npm run demo:cases` runs five real, disposable examples: regression proof, missing tests, a failed build, stale evidence, and an unsupported compatibility claim. Agent messages are explicitly simulated; the verification is real.

### Share the evidence (v0.3)

```bash
redpen check --markdown > .redpen/receipt.md  # verify and render
redpen report                            # reprint the last receipt; no checks rerun
redpen explain                           # why anything remains unresolved
```

The receipt separates required criteria, advisory criteria, and agent claims. It includes verdicts, reasons, and short evidence summaries, but omits raw command output and the agent's full completion message. It is still based on repository content and agent text: review it before pasting it into a PR. `redpen report` exits `1` for a `NOT DONE` or stale result, `0` for a current `DONE` result, and `2` when no usable report exists.

### Reusable proof plans (v0.2)

Run `redpen init` once to create `.redpen/config.json`. Commit this file to share project command overrides and task templates. Then choose a plan:

```bash
redpen start --template bugfix "Fix pagination when cursor is null"
redpen add "API contract exists" --type file-exists --path docs/api.json
redpen add "Typecheck passes" --type typecheck-pass
redpen add "Update the migration guide" --type file-exists --path docs/migration.md --advisory
```

The built-in templates are `default`, `bugfix`, `feature`, `refactor`, and `dependency-update`. Edit the generated JSON to fit your repository. Commands are argument arrays, not shell strings:

```json
{
  "schemaVersion": 1,
  "commands": {
    "test": { "command": "npm", "args": ["test"] },
    "typecheck": { "command": "npm", "args": ["run", "typecheck"] }
  },
  "policy": { "requireAllClaims": false },
  "templates": {
    "bugfix": [
      { "id": "implementation", "title": "Implementation changed", "verifier": { "type": "changes-exist" } },
      { "id": "regression", "title": "Regression coverage", "verifier": { "type": "tests-changed" } },
      { "id": "tests", "title": "Tests pass", "verifier": { "type": "tests-pass" } }
    ]
  }
}
```

`redpen add "Coverage ≥ 80%" --type coverage-threshold --report coverage/coverage-summary.json --minimum 80 --command npm run test:coverage` supports Istanbul `total.lines.pct` and Python coverage JSON `totals.percent_covered`. The command must produce a fresh report. `redpen add "Reviewer check" --type file-exists --path docs/review.md --propose` queues a criterion; `redpen accept <id>` makes it required, and `redpen reject <id>` removes it. Advisory criteria remain visible but do not block `DONE`.

Redpen snapshots the repository around verification. If a test or build changes repository files, proof is withheld until a fresh check. `redpen status` shows when files changed after the last report; it never reruns commands.

```bash
redpen import codex --session <id>          # choose an ambiguous match
redpen import codex --file <session.jsonl>  # explicit fallback
redpen import codex --dry-run               # preview without writing
redpen claims "Added tests. Tests pass."    # manual claim input
redpen check --verbose --timeout 120        # detailed evidence
redpen check --strict-claims                  # require proof for every agent claim
redpen report                                 # portable receipt from the last check
redpen status                               # never reruns checks
redpen reset --yes                          # clears state, not repo files
```

Exit code `0` means done, `1` means not done, and `2` means Redpen could not complete the check. `redpen check --json` also prints the machine-readable report.

## Current limits

| Capability | Status |
| --- | --- |
| Codex local session import | Supported |
| Codex skill + opt-in completion hook | Local beta; trusted hooks required |
| Focused Node regression reproduction | Dependency-free node:test beta |
| Manual claims for other agents | Supported |
| Node.js test and build discovery | Supported |
| Python test discovery | Supported |
| Claude Code and Cursor adapters | Not yet supported |
| Semantic correctness judging | Not supported |

Codex's local JSONL format is not a stable public API. Its assumptions are isolated behind an adapter, and `--file` remains the explicit fallback. Logged transcript commands are never executed or trusted as evidence.

`.redpen/session.json` and `.redpen/report.json` are ephemeral and ignored by Git. `.redpen/config.json` is intentionally commit-worthy. Reports redact repository, home, and transcript paths, but project command output can still contain sensitive data. Inspect reports before sharing them.

## Roadmap

- Claude Code and additional agent adapters
- more project-specific verifiers
- API-compatibility evidence
- more language and build ecosystems
- lightweight pull-request checks

The immediate priority is ten real Codex beta users, evidence quality, and friction observed in their sessions. Directory submission follows validated installation and handoff behavior. See [the beta handoff](./docs/v0.4-beta.md).

Report schema v9 adds an opaque task-input fingerprint: changing criteria or replacing claims invalidates saved receipts even without repository edits. Older reports still load but require a fresh check to establish this fingerprint.

No dates. Evidence first.

## Contributing

Want Redpen to understand another coding agent? Adapters live in [`src/agents`](./src/agents).

Want it to verify another kind of claim? Verifiers live in [`src/verifiers`](./src/verifiers).

Start with [CONTRIBUTING.md](./CONTRIBUTING.md). Security and trust-boundary details are in [SECURITY.md](./SECURITY.md).

For a disposable real-repository demonstration, run `npm run demo`. The exact recording sequence is in [docs/demo.md](./docs/demo.md).

MIT licensed.
