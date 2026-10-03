import { createHash } from "node:crypto";
import type { RedpenReport, RedpenSession } from "../core/types.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Opaque digest: detect edited task contracts and replaced claims, not only file changes. */
export function sessionFingerprint(session: RedpenSession): string {
  return createHash("sha256").update(JSON.stringify(canonical({
    task: session.task, definitionOfDone: session.definitionOfDone,
    claims: session.agentCompletion?.claims ?? [],
    completionTurn: session.agentCompletion?.metadata?.turnId,
  }))).digest("hex");
}

export function reportInputsChanged(session: RedpenSession, report: RedpenReport): boolean {
  if (report.session?.id !== session.id) return true;
  if (report.session.inputHash) return report.session.inputHash !== sessionFingerprint(session);
  // Old reports still load; conservatively refresh once to establish input freshness.
  return true;
}
