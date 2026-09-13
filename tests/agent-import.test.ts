import assert from "node:assert/strict";
import test from "node:test";
import { applyAgentImport } from "../src/agents/import.js";
import type { ImportedAgentCompletion } from "../src/agents/types.js";
import { startSession } from "../src/session/lifecycle.js";
import { readSession } from "../src/session/store.js";
import { createRepository, removeRepository } from "./helpers.js";

function imported(rawMessage: string): ImportedAgentCompletion {
  return {
    agent: { id: "codex", name: "Codex", sessionId: "codex-session" },
    source: { type: "local-session", path: "/tmp/session.jsonl" },
    rawMessage,
    metadata: { startedAt: "2026-09-12T10:00:00.000Z", completedAt: "2026-09-12T10:01:00.000Z", workingDirectory: "/repo", turnId: "turn", historicalToolCalls: 3 },
  };
}

test("dry-run extracts claims without mutating the session", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Import claims");
    const plan = await applyAgentImport(session, imported("All tests pass."), true);
    assert.equal(plan.detectedClaims[0]?.source.type, "agent");
    assert.equal((await readSession(root))?.agentCompletion, undefined);
  } finally { await removeRepository(root); }
});

test("imports provenance idempotently and updates a progressed session", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Import claims");
    const first = await applyAgentImport(session, imported("All tests pass."));
    assert.equal(first.newClaims, 1);
    assert.deepEqual(first.completion.claims[0]?.source, { type: "agent", agentId: "codex", sessionId: "codex-session" });
    const firstId = first.completion.claims[0]?.id;

    const duplicate = await applyAgentImport((await readSession(root))!, imported("All tests pass."));
    assert.equal(duplicate.alreadyImported, true);
    assert.equal(duplicate.newClaims, 0);

    const progressed = await applyAgentImport((await readSession(root))!, imported("All tests pass. Build succeeds."));
    assert.equal(progressed.alreadyImported, false);
    assert.equal(progressed.newClaims, 1);
    assert.equal(progressed.completion.claims[0]?.id, firstId);
    assert.deepEqual(progressed.completion.claims.map((claim) => claim.type), ["tests-pass", "build-pass"]);
  } finally { await removeRepository(root); }
});

test("bounds imported completion text without losing its beginning or end", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Bound imported data");
    const plan = await applyAgentImport(session, imported(`Beginning. ${"x".repeat(30_000)} All tests pass.`), true);
    assert.ok(plan.completion.rawMessage!.length < 25_000);
    assert.match(plan.completion.rawMessage!, /^Beginning\./);
    assert.match(plan.completion.rawMessage!, /All tests pass\.$/);
    assert.match(plan.completion.rawMessage!, /completion truncated by Redpen/);
  } finally { await removeRepository(root); }
});
