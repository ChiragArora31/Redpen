# Privacy

Last updated: October 3, 2026. Publisher: Chirag Arora.

## Data and purpose

Redpen's CLI and local coding-workflow plugin send no telemetry, repository data, agent transcripts, or reports to Redpen servers. Redpen has no hosted backend, account system, analytics, advertising, or behavioral profiling.

Redpen processes the task description, repository files and Git state, selected completion claims, compact import metadata, verification timestamps, and test/build output to compare the task with independently gathered evidence. These inputs may include personal information if you put it in task text, source files, or command output. Do not provide passwords, API keys, payment information, health records, government identifiers, or other sensitive information as claims or task inputs.

Task state and evidence reports are stored in the repository's `.redpen/` directory. Baseline snapshots are stored as Git objects in that repository. The public plugin records a concise task summary through the CLI; it does not capture the entire chat. The separate optional local hook beta captures only the final assistant message for a task explicitly bound to that conversation. Explicit file/session imports read local Codex logs to extract the completion and compact metadata; full transcripts are not stored in Redpen reports.

## Recipients and execution environment

Redpen does not transmit these inputs to its maintainer. When you use the plugin through ChatGPT or Codex, information returned to that client is handled under that provider's policies and your account settings. A cloud execution environment stores files in that environment, not necessarily on your laptop. npm, GitHub, and project commands have their own data practices.

Project test/build commands are executable code and may access files, credentials, or the network under your existing permissions. Redpen is not a sandbox and cannot control those commands' recipients. Review unfamiliar repositories and commands before execution.

## Retention and controls

Redpen has no server-side retention. Repository state remains until you remove it or the execution environment expires. `redpen reset --yes` deletes the active session and report without changing project source files. It does not securely erase Git objects; Git retains baseline objects until its normal garbage collection removes unreferenced objects. Backups, client chat history, and artifacts you share may persist separately.

Disable or uninstall the plugin in your client to stop its use. The optional local beta's hooks can be disabled separately. Review `.redpen/session.json` and `.redpen/report.json` before sharing them and keep ephemeral state out of Git. Reports redact common local paths but may contain project-provided sensitive text; redaction is not a secret scanner. Reset does not remove user-owned `.redpen/config.json`.

## Support

Public support issues and emails are voluntarily submitted to GitHub or the maintainer for troubleshooting. Share only a minimal, non-sensitive reproduction. We do not promise a fixed deletion period for public GitHub issues; manage those through GitHub. For privacy questions or deletion requests concerning support correspondence, contact chiragarora1831@gmail.com. Do not send secrets.

This policy covers Redpen's code and maintainer support, not OpenAI, npm, GitHub, or code executed from your project. For vulnerabilities, follow [SECURITY.md](./SECURITY.md).
