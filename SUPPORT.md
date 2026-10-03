# Support

Redpen is maintained by Chirag Arora. For installation questions, unexpected results, or feature requests, [open an issue](https://github.com/ChiragArora31/Redpen/issues). Include the Redpen version, operating system, client version, and a minimal reproducible example.

Do not attach private source code, credentials, full transcripts, or unreviewed reports. Receipts can contain task and file names. Redaction is not a guarantee that an artifact is safe to publish.

For sensitive security reports, use [GitHub's private vulnerability reporting](https://github.com/ChiragArora31/Redpen/security/advisories/new) or email chiragarora1831@gmail.com with the subject `Redpen security`. Do not put secrets in the email.

## Common fixes

- **No Git repository:** select the repository directory before invoking Redpen.
- **Existing task:** run `redpen status`. Resume it, or explicitly reset it before starting another task. Do not automatically replace its baseline.
- **Missing runtime:** the plugin requires Node.js 18+ and Git in the execution environment. It does not install these tools or create remote access to your computer.
- **NOT DONE:** inspect the required criteria and failed claims. This is a verification result, not a crash. `redpen explain` shows the missing evidence.
- **CHECK NEEDED:** files or task inputs changed. Run a fresh check before relying on the receipt.
- **No test/build command:** use an explicit task criterion with `redpen add "Relevant tests pass" --command npm run test:pagination`, using your actual project command.
- **Automatic final-message capture:** available only in the separate, optional local hook beta. The public submission package does not contain hooks.

Support is best effort. No response-time or availability guarantee is offered.
