#!/usr/bin/env node
import { handleCodexStop } from "../dist/agents/codex/hook.js";

// Stop hooks require JSON even on failure. Do not block the user's agent turn.
try {
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 100_000) throw new Error("Hook input exceeds 100 KB.");
  }
  process.stdout.write(JSON.stringify(await handleCodexStop(JSON.parse(text))));
} catch {
  process.stdout.write(JSON.stringify({ systemMessage: "Redpen could not finish the completion check. Run redpen import codex, then redpen check --verbose for details. No verdict was granted." }));
}
