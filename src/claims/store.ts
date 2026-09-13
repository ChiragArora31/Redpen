import type { AgentClaim, RedpenSession } from "../core/types.js";
import { claimKey, parseClaims } from "./parser.js";
import { readSession, writeSession } from "../session/store.js";

export interface ClaimsIngestResult {
  session: RedpenSession;
  added: AgentClaim[];
  duplicates: number;
}

export async function ingestClaims(root: string, message: string): Promise<ClaimsIngestResult> {
  const session = await readSession(root);
  if (!session) throw new Error("No active Redpen task. Start one with `redpen start \"<task>\"`.");
  const parsed = parseClaims(message);
  const existing = session.agentCompletion?.claims ?? [];
  const keys = new Set(existing.map((claim) => claimKey(claim.originalText)));
  const added: AgentClaim[] = [];
  for (const claim of parsed) {
    const key = claimKey(claim.originalText);
    if (keys.has(key)) continue;
    keys.add(key);
    added.push(claim);
  }
  const priorMessage = session.agentCompletion?.message;
  const updated: RedpenSession = {
    ...session,
    agentCompletion: {
      ...session.agentCompletion,
      schemaVersion: 1,
      message: priorMessage ? `${priorMessage}\n${message.trim()}` : message.trim(),
      recordedAt: new Date().toISOString(),
      claims: [...existing, ...added],
    },
  };
  await writeSession(updated, false);
  return { session: updated, added, duplicates: parsed.length - added.length };
}
