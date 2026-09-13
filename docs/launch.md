# Redpen launch copy

## One-line description

Redpen makes coding agents prove they are done.

## GitHub description

A definition-of-done and verification layer for coding agents.

## Twitter launch hooks

1. Coding agents are very good at saying “done.” Redpen asks for evidence.
2. Agent: “Fixed it. Added tests. Everything passes.” Redpen: “Prove it.”
3. I built a skeptical reviewer for coding agents. It has three answers: proven, failed, and unverified.

## 10-second explanation

Your coding agent says it finished the task. Redpen checks the repository, runs the relevant tests and build, and marks each requirement and claim as proven, failed, or unverified.

## 30-second explanation

Redpen records the task and the repository state before work begins. After Codex finishes, Redpen imports its completion message as claims, then independently checks Git changes, regression coverage, tests, and builds. It does not treat the agent's confidence as evidence—and it is willing to say “unverified” when proof does not exist.

## Suggested demo sequence

For a deterministic recording:

```bash
npm install
npm run demo --silent
```

For the real golden path:

```bash
redpen start "Fix pagination when cursor is null"
# work normally with Codex
redpen import codex
redpen check
```

Keep the recording focused on the generated checklist, imported claims, independent command evidence, and final verdict.

## Suggested screenshot

Use the final demo frame containing the four proven agent claims, the unverified backwards-compatibility claim, and:

```text
8 proven · 0 failed · 1 unverified

DONE

Definition of Done is proven.

1 additional claim remains unverified.
They may be correct. Redpen just can't prove them yet.
```

That frame explains both the product and its restraint.

## GitHub metadata

- Repository name: `redpen`
- Description: `A definition-of-done and verification layer for coding agents.`
- Homepage: leave empty until Redpen has a dedicated site
- Topics: `coding-agents`, `ai-agents`, `codex`, `developer-tools`, `verification`, `testing`, `cli`, `agentic-ai`, `ai-coding`, `open-source`
