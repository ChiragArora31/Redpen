# Privacy

Redpen's local CLI and Codex plugin send no telemetry, repository data, agent transcripts, or reports to Redpen servers. Redpen has no hosted backend or account system.

Task descriptions, baseline references, claims, and compact completion metadata are stored locally under `.redpen/`. Reports redact common local paths but can contain project command output and agent text. Review them before sharing; redaction is not a secret scanner. Ignore session/report files in Git. The plugin captures the final assistant message only for a task explicitly bound to that Codex conversation.

Project test/build commands are executable code and may access files, credentials, or the network under your existing permissions. Redpen is not a sandbox. Codex and npm have their own privacy policies; this policy covers Redpen's code only.

Questions: open a [repository issue](https://github.com/ChiragArora31/Redpen/issues). Do not post private transcripts or secrets there. For sensitive vulnerabilities, follow [SECURITY.md](./SECURITY.md).
