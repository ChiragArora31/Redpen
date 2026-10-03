# Redpen demo

## v0.4 evidence cases

```bash
npm ci
npm run demo:cases
# Or record one case:
npm run demo:cases -- regression
npm run demo:cases -- missing-tests
npm run demo:cases -- failed-build
npm run demo:cases -- stale-evidence
npm run demo:cases -- unsupported-claim
```

All checks run against real disposable Git repositories. Agent completion text is simulated and labelled as such. `regression` proves a named assertion fails on the saved baseline and passes after the fix. `missing-tests` contradicts “Added tests” even though existing tests pass. `failed-build` independently contradicts “Build succeeds.” `stale-evidence` refuses a saved receipt after edits. `unsupported-claim` uses strict policy to keep “No breaking changes” from earning DONE.

For the strongest 20-second recording, show the task contract, the baseline-fail/current-pass regression result, and the still-unverified compatibility claim. For a failure story, show the missing-tests or failed-build case. Do not label these as observed customer incidents.

For the actual plugin recording, follow [codex-plugin.md](./codex-plugin.md), start a real coding task with `$redpen`, show the agreed contract, and finish on the automatically captured completion receipt. This recording needs an enabled/trusted plugin in your account; do not substitute a mocked hook event and call it an interactive demo.

## Ten-second explanation

Your coding agent says it is done. Redpen checks the task, the claims, and the repository evidence before agreeing.

## Thirty-second explanation

Redpen is a definition-of-done and verification layer for coding agents. It snapshots the repository before work begins, imports what the agent claims it completed, and independently checks changes, regression tests, test results, and builds. Claims without a deterministic verifier stay `UNVERIFIED` instead of disappearing or being guessed true.

## Record the demo

From a clean Redpen checkout:

```bash
npm install
npm run demo --silent
```

The script creates a disposable Git repository, adds dependency-owned test fixtures, fixes a pagination bug, adds a real regression test, records agent-style claims, and runs the real Redpen CLI. Dependency tests never appear as evidence. It expects exit code 0 because the Definition of Done is proven; the additional backwards-compatibility claim remains visibly unverified. The temporary repository is removed afterward.

Recommended screenshot or GIF sequence:

1. `redpen start "Fix pagination when cursor is null"`
2. The concise generated Definition of Done.
3. Five imported-style claims.
4. Repository, test, and build evidence turning green.
5. `? "No breaking changes."` followed by `DONE` with a clear unverified-claim note.

The important final frame is the refusal to overclaim:

```text
? "No breaking changes."
  No deterministic verifier is available. Redpen doesn't guess.

8 proven · 0 failed · 1 unverified

DONE

Definition of Done is proven.

1 additional claim remains unverified.
They may be correct. Redpen just can't prove them yet.
```
