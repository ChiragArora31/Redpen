import type { AgentClaim, AgentCompletion, RedpenSession } from "../core/types.js";
import { claimKey, parseClaims } from "../claims/parser.js";
import { writeSession } from "../session/store.js";
import type { ImportedAgentCompletion } from "./types.js";

const COMPLETION_LIMIT = 24_000;

function boundedCompletion(message: string): string {
  const value = message.trim();
  if (value.length <= COMPLETION_LIMIT) return value;
  const half = Math.floor(COMPLETION_LIMIT / 2);
  return `${value.slice(0, half)}\n\n… completion truncated by Redpen …\n\n${value.slice(-half)}`;
}

export interface AgentImportPlan {
  session: RedpenSession;
  completion: AgentCompletion;
  detectedClaims: AgentClaim[];
  newClaims: number;
  alreadyImported: boolean;
}

export async function applyAgentImport(
  session: RedpenSession,
  imported: ImportedAgentCompletion,
  dryRun = false,
): Promise<AgentImportPlan> {
  const rawMessage = boundedCompletion(imported.rawMessage);
  const source = {
    type: "agent" as const,
    agentId: imported.agent.id,
    ...(imported.agent.sessionId ? { sessionId: imported.agent.sessionId } : {}),
  };
  const parsed = parseClaims(rawMessage, source);
  const previous = session.agentCompletion;
  const sameSession = previous?.agent?.id === imported.agent.id && previous.agent.sessionId === imported.agent.sessionId;
  const alreadyImported = sameSession && previous.rawMessage === rawMessage;
  const previousByKey = new Map(
    (sameSession ? previous.claims : []).filter((claim) => claim.source.type === "agent").map((claim) => [claimKey(claim.originalText), claim]),
  );
  const preserved = (previous?.claims ?? []).filter((claim) => claim.source.type === "manual");
  const used = new Set(preserved.map((claim) => claimKey(claim.originalText)));
  const detectedClaims: AgentClaim[] = [];
  for (const claim of parsed) {
    const key = claimKey(claim.originalText);
    if (used.has(key)) continue;
    used.add(key);
    detectedClaims.push(previousByKey.get(key) ?? claim);
  }
  const previousKeys = new Set((previous?.claims ?? []).map((claim) => claimKey(claim.originalText)));
  const newClaims = detectedClaims.filter((claim) => !previousKeys.has(claimKey(claim.originalText))).length;
  const now = new Date().toISOString();
  const completion: AgentCompletion = {
    schemaVersion: 1,
    agent: imported.agent,
    message: rawMessage,
    recordedAt: now,
    importedAt: now,
    source: imported.source,
    rawMessage,
    metadata: imported.metadata,
    claims: [...preserved, ...detectedClaims],
  };
  const updated = { ...session, agentCompletion: completion };
  if (!dryRun && !alreadyImported) await writeSession(updated, false);
  return { session: updated, completion, detectedClaims, newClaims, alreadyImported };
}
