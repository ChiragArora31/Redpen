# Redpen demo

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
