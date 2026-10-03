import { findRepositoryRoot, createWorktreeSnapshot } from "../../repository/git.js";
import { readLastReport, readSession } from "../../session/store.js";
import { readProjectConfig } from "../../session/config.js";
import { applyAgentImport } from "../import.js";
import { collectRepository } from "../../repository/collect.js";
import { verifyRepository } from "../../core/engine.js";
import { verifierRegistry } from "../../verifiers/registry.js";
import { writeJsonReport } from "../../reporters/json.js";
import { renderMarkdown } from "../../reporters/markdown.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { reportInputsChanged } from "../../session/fingerprint.js";

/** Official Stop hook payload, not the unstable JSONL transcript format.
 * No commands, paths or reported exit codes from the transcript are executed.
 * This intentionally never blocks/continues Codex: the task verdict is a receipt.
 */
export async function handleCodexStop(input: unknown): Promise<{ systemMessage?: string }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a Codex Stop JSON object.");
  const event = input as Record<string, unknown>;
  if (event.hook_event_name !== "Stop" || event.stop_hook_active !== false) return {};
  if (typeof event.cwd !== "string" || typeof event.session_id !== "string" || typeof event.turn_id !== "string") throw new Error("Codex Stop is missing cwd, session_id or turn_id.");
  if (typeof event.last_assistant_message !== "string" || !event.last_assistant_message.trim()) return {};
  if (event.last_assistant_message.length > 64_000) throw new Error("Codex completion exceeds the 64 KB import limit. Use redpen import codex instead.");
  let root: string;
  try { root = await findRepositoryRoot(event.cwd); }
  catch { return {}; } // Installed plugins must be quiet outside an opted-in Git task.
  const session = await readSession(root);
  // An installed hook is not authority to run tests in every repository or task.
  if (!session || session.codexBinding?.sessionId !== event.session_id) return {};
  const lock = join(root, ".redpen", "codex-hook.lock");
  try { await mkdir(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { systemMessage: "Redpen: a completion check is already active. If it was interrupted, remove .redpen/codex-hook.lock and run redpen check." };
    throw error;
  }
  try {
    const plan = await applyAgentImport(session, {
      agent: { id: "codex", name: "Codex", sessionId: event.session_id },
      source: { type: "hook" }, rawMessage: event.last_assistant_message,
      metadata: { workingDirectory: root, turnId: event.turn_id, completedAt: new Date().toISOString() },
    });
    const previous = await readLastReport(root);
    if (plan.alreadyImported && previous?.session?.id === session.id && previous.evidenceFreshness &&
      !reportInputsChanged(session, previous) &&
      previous.evidenceFreshness.verifiedTree === await createWorktreeSnapshot(root)) return {};
    const config = await readProjectConfig(root);
    const repository = await collectRepository(root, session.repository.baselineTree);
    const effectiveSession = plan.alreadyImported ? session : plan.session;
    const report = await verifyRepository(repository, session.definitionOfDone, verifierRegistry, effectiveSession, { strictClaims: config?.policy?.requireAllClaims === true });
    const active = await readSession(root);
    if (!isDeepStrictEqual(active, effectiveSession)) return { systemMessage: "Redpen task changed during the completion check. Run redpen check again for the active task." };
    await writeJsonReport(report, root);
    return { systemMessage: renderMarkdown(report) };
  } finally { await rm(lock, { recursive: true, force: true }); }
}
