# Contributing to Redpen

Redpen is intentionally small: deterministic evidence should remain separate from agent claims and agent-specific adapters.

## Local setup

Requires Node.js 18 or newer and Git.

```bash
npm install
npm test
npm run check
npm pack --dry-run
```

Please add focused tests for behavior changes. Use real temporary Git repositories for evidence behavior, and fixtures rather than personal agent history for adapter tests.

Before opening a pull request, confirm that no `.redpen/` state, transcripts, credentials, local paths, or generated build output are included.
