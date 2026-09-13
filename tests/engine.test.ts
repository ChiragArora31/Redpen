import assert from "node:assert/strict";
import test from "node:test";
import { verifyRepository } from "../src/core/engine.js";
import type { DefinitionOfDoneItem, RepositoryEvidence, Verifier } from "../src/core/types.js";

const repository: RepositoryEvidence = { root: "/tmp/example", changes: [], testFiles: [] };

test("summarizes statuses and requires every check for a done verdict", async () => {
  const statuses = ["proven", "failed", "unverified"] as const;
  const types = ["changes-exist", "tests-changed", "tests-pass"] as const;
  const definition: DefinitionOfDoneItem[] = types.map((type, index) => ({ id: `check-${index}`, title: `Check ${index}`, verifier: { type } }));
  const verifiers: Record<string, Verifier> = Object.fromEntries(types.map((type, index) => [type, {
    type,
    async verify() { return { id: type, title: type, status: statuses[index]!, reason: "test", evidence: [] }; },
  }]));
  const report = await verifyRepository(repository, definition, verifiers);
  assert.deepEqual(report.summary, { proven: 1, failed: 1, unverified: 1, done: false });
  assert.deepEqual(report.definitionOfDoneSummary, { proven: 1, failed: 1, unverified: 1, satisfied: false });
  assert.deepEqual(report.agentClaimSummary, { proven: 0, failed: 0, unverified: 0 });
  assert.equal(report.verdict, "not_done");
});
