import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectRepository } from "../src/repository/collect.js";
import { verifyRepository } from "../src/core/engine.js";
import { writeJsonReport } from "../src/reporters/json.js";
import { startSession } from "../src/session/lifecycle.js";
import { verifierRegistry } from "../src/verifiers/registry.js";
import { createRepository, put, removeRepository } from "./helpers.js";
import { readSession } from "../src/session/store.js";
import { applyAgentImport } from "../src/agents/import.js";

test("serializes the task, definition, result, and evidence chain", async () => {
  const root = await createRepository();
  try {
    await startSession(root, `Change the exported value in ${root}`);
    await applyAgentImport((await readSession(root))!, {
      agent: { id: "codex", name: "Codex", sessionId: "codex-report" },
      source: { type: "file", path: "/tmp/codex.jsonl" },
      rawMessage: "Updated src/index.ts.",
      metadata: { startedAt: new Date(0).toISOString(), completedAt: new Date().toISOString(), workingDirectory: root },
    });
    const session = (await readSession(root))!;
    await put(root, "src/index.ts", "export const value = 2;\n");
    const repository = await collectRepository(root, session.repository.baselineTree);
    const report = await verifyRepository(repository, session.definitionOfDone, verifierRegistry, session);
    const path = await writeJsonReport(report, root);
    const stored = JSON.parse(await readFile(path, "utf8")) as typeof report;
    assert.equal(stored.schemaVersion, 6);
    assert.equal(stored.task?.description, "Change the exported value in .");
    assert.equal(stored.definitionOfDone[0]?.id, stored.definitionOfDoneResults[0]?.id);
    assert.equal(stored.definitionOfDoneResults[0]?.status, "proven");
    assert.ok((stored.definitionOfDoneResults[0]?.evidence.length ?? 0) > 0);
    assert.equal(stored.agentClaims[0]?.type, "file-changed");
    assert.deepEqual(stored.agentClaims[0]?.source, { type: "agent", agentId: "codex", sessionId: "codex-report" });
    assert.equal(stored.agentClaimResults[0]?.status, "proven");
    assert.equal(stored.agent?.id, "codex");
    assert.equal(stored.agentSession?.id, "codex-report");
    assert.equal(stored.completion?.source?.type, "file");
    assert.equal(stored.completion?.source?.path, undefined);
    assert.equal(stored.repository.root, ".");
    assert.equal(stored.agentSession?.workingDirectory, ".");
    assert.doesNotMatch(JSON.stringify(stored), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(stored.verdict, "done");
    assert.equal(stored.definitionOfDoneSummary.satisfied, true);
    assert.deepEqual(stored.agentClaimSummary, { proven: 1, failed: 0, unverified: 0 });
  } finally { await removeRepository(root); }
});
