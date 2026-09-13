import { randomUUID } from "node:crypto";
import type { AgentClaim, AgentClaimType, ClaimSource } from "../core/types.js";

const NEGATION = /\b(?:not|never|didn't|did not|don't|do not|doesn't|does not)\b/i;

function normalizeSegment(originalText: string, source: ClaimSource): AgentClaim {
  const text = originalText.trim();
  const lower = text.toLowerCase();
  let type: AgentClaimType = "unknown";
  let normalized: Record<string, unknown> | undefined;

  const file = text.match(/\b(added|updated|changed|modified)\s+[`"']?([\w@+./-]+\.[\w-]+)[`"']?/i);
  if (file?.[1] && file[2]) {
    type = "file-changed";
    normalized = { path: file[2], action: file[1].toLowerCase() === "added" ? "added" : "changed" };
  } else if (!NEGATION.test(text) && /\b(?:all\s+)?tests?\s+(?:are\s+)?pass(?:ed|es|ing)?(?:\s+successfully)?\b|\btest suite\s+passes\b/i.test(text)) {
    type = "tests-pass";
  } else if (!NEGATION.test(text) && /\b(?:added|updated|changed)\s+(?:an?\s+)?(?:regression\s+)?tests?\b|\badded\s+regression\s+coverage\b/i.test(text)) {
    type = "tests-changed";
  } else if (!NEGATION.test(text) && /\bbuild\s+(?:succeeds?|passes|passed|is passing)\b|\bproject builds successfully\b/i.test(text)) {
    type = "build-pass";
  } else if (/\b(?:updated|changed)\s+the\s+implementation\b/i.test(text)) {
    type = "implementation-changed";
  } else if (/\bfixed\b.{0,100}\bbug\b/i.test(lower) || /\bimplemented\b.+/i.test(lower)) {
    type = "implementation-result";
  }

  return {
    id: randomUUID(),
    originalText: text,
    type,
    source,
    ...(normalized ? { normalized } : {}),
  };
}

function splitClaims(input: string): string[] {
  let inFence = false;
  const prose = input.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) { inFence = !inFence; return []; }
    if (inFence || !trimmed || /^#{1,6}\s+/.test(trimmed)) return [];
    if (/^\*{0,2}(?:summary|tests?|verification|changes|next steps?|remaining risks?)\*{0,2}:?$/i.test(trimmed)) return [];
    return [trimmed.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")];
  }).join("\n");
  const sentences = prose.split(/(?:\r?\n)+|(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean);
  return sentences.flatMap((sentence) => {
    const terminal = sentence.match(/[.!?]$/)?.[0] ?? "";
    const body = terminal ? sentence.slice(0, -1) : sentence;
    const pieces = body
      .split(/\s*;\s*|\s+and\s+(?=(?:all\s+)?tests?\b|test suite\b|build\b|project builds\b|added\b|updated\b|changed\b|fixed\b|implemented\b)/i)
      .map((value) => value.trim())
      .filter(Boolean);
    return pieces.map((piece, index) => `${piece}${index === pieces.length - 1 ? terminal : ""}`);
  });
}

export function claimKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "");
}

export function parseClaims(input: string, source: ClaimSource = { type: "manual" }): AgentClaim[] {
  if (!input.trim()) throw new Error("Claim text must not be empty.");
  return splitClaims(input).map((text) => normalizeSegment(text, source));
}
