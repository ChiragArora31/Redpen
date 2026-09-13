import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { ingestClaims } from "../src/claims/store.js";
import { writeJsonReport } from "../src/reporters/json.js";
import { startSession } from "../src/session/lifecycle.js";
import { readSession, statePaths } from "../src/session/store.js";
import type { RedpenReport } from "../src/core/types.js";
import { createRepository, removeRepository } from "./helpers.js";

test("persists claims, keeps distinct claims, and suppresses exact duplicates", async () => {
  const root = await createRepository();
  try {
    await startSession(root, "Store claims");
    const first = await ingestClaims(root, "All tests pass. Tests are passing. All tests pass!");
    assert.equal(first.added.length, 2);
    assert.equal(first.duplicates, 1);
    assert.deepEqual((await readSession(root))?.agentCompletion?.claims.map((claim) => claim.type), ["tests-pass", "tests-pass"]);
  } finally { await removeRepository(root); }
});

test("adding claims after a check preserves but does not silently validate the stale report", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Invalidate report");
    const report = {
      schemaVersion: 5,
      redpenVersion: "0.1.0",
      timestamp: new Date().toISOString(),
      repository: { root },
      summary: { proven: 0, failed: 0, unverified: 0, done: true },
      verdict: "done",
      session: { id: session.id, startedAt: session.startedAt },
      task: session.task,
      definitionOfDone: session.definitionOfDone,
      definitionOfDoneResults: [],
      agentClaims: [],
      agentClaimResults: [],
      checks: [],
    } satisfies RedpenReport;
    await writeJsonReport(report, root);
    await ingestClaims(root, "No breaking changes were introduced.");
    await access(statePaths(root).report);
  } finally { await removeRepository(root); }
});
