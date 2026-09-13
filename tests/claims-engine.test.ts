import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AgentClaim, RedpenSession, RepositoryEvidence } from "../src/core/types.js";
import { verifyRepository } from "../src/core/engine.js";
import { verifierRegistry } from "../src/verifiers/registry.js";
import { createRepository, put, removeRepository } from "./helpers.js";

function session(root: string, claims: AgentClaim[]): RedpenSession {
  return {
    schemaVersion: 1,
    id: "session",
    task: { description: "Verify claims" },
    startedAt: new Date(0).toISOString(),
    repository: { root, baselineTree: "baseline" },
    definitionOfDone: [{ id: "tests", title: "Tests pass", verifier: { type: "tests-pass" } }],
    agentCompletion: { schemaVersion: 1, message: claims.map((claim) => claim.originalText).join(" "), recordedAt: new Date(0).toISOString(), claims },
  };
}

test("Definition of Done and multiple claims share one command execution", async () => {
  const root = await createRepository();
  try {
    const marker = "command-runs.txt";
    const spec = {
      command: process.execPath,
      args: ["-e", `require('fs').appendFileSync('${marker}','x')`],
      display: "test command",
      source: "test",
    };
    const repository: RepositoryEvidence = { root, changes: [], testFiles: [], testCommand: spec };
    const claims: AgentClaim[] = [
      { id: "one", originalText: "All tests pass.", type: "tests-pass", source: { type: "manual" } },
      { id: "two", originalText: "Tests are passing.", type: "tests-pass", source: { type: "manual" } },
    ];
    const report = await verifyRepository(repository, session(root, claims).definitionOfDone, verifierRegistry, session(root, claims));
    assert.deepEqual(report.agentClaimResults.map((result) => result.status), ["proven", "proven"]);
    assert.equal(await readFile(`${root}/${marker}`, "utf8"), "x");
  } finally { await removeRepository(root); }
});

test("claim results distinguish proven, failed, and unverified evidence", async () => {
  const root = await createRepository();
  try {
    const changes = [{ path: "src/auth.ts", status: "M", additions: 2, deletions: 1, untracked: false }];
    const repository: RepositoryEvidence = {
      root,
      changes,
      testFiles: [],
      testCommand: { command: process.execPath, args: ["-e", "process.exit(1)"], display: "tests", source: "test" },
    };
    const claims: AgentClaim[] = [
      { id: "file", originalText: "Updated src/auth.ts.", type: "file-changed", normalized: { path: "src/auth.ts", action: "changed" }, source: { type: "manual" } },
      { id: "tests", originalText: "All tests pass.", type: "tests-pass", source: { type: "manual" } },
      { id: "coverage", originalText: "Added tests.", type: "tests-changed", source: { type: "manual" } },
      { id: "semantic", originalText: "Fixed the bug.", type: "implementation-result", source: { type: "manual" } },
      { id: "unknown", originalText: "No breaking changes.", type: "unknown", source: { type: "manual" } },
    ];
    const task = session(root, claims);
    const report = await verifyRepository(repository, [], verifierRegistry, task);
    assert.deepEqual(report.agentClaimResults.map((result) => result.status), ["proven", "failed", "failed", "unverified", "unverified"]);
    assert.equal(report.summary.done, false);
  } finally { await removeRepository(root); }
});

test("an added-file claim fails when the file existed at baseline", async () => {
  const root = await createRepository();
  try {
    const repository: RepositoryEvidence = {
      root,
      changes: [{ path: "src/index.ts", status: "M", additions: 1, deletions: 1, untracked: false }],
      testFiles: [],
    };
    const claims: AgentClaim[] = [{ id: "added", originalText: "Added src/index.ts.", type: "file-changed", normalized: { path: "src/index.ts", action: "added" }, source: { type: "manual" } }];
    const report = await verifyRepository(repository, [], verifierRegistry, session(root, claims));
    assert.equal(report.agentClaimResults[0]?.status, "failed");
    assert.match(report.agentClaimResults[0]?.reason ?? "", /not added/);
  } finally { await removeRepository(root); }
});
