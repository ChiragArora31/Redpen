import assert from "node:assert/strict";
import test from "node:test";
import { createCommandVerifier } from "../src/verifiers/command.js";
import type { RepositoryEvidence } from "../src/core/types.js";

const spec = { command: "npm", args: ["test"], display: "npm test", source: "package.json#scripts.test" };
const repository: RepositoryEvidence = { root: "/tmp/example", changes: [], testFiles: [], testCommand: spec };
const verifier = createCommandVerifier({ type: "tests-pass", title: "Tests", select: (repo) => repo.testCommand, missingReason: "missing" });

test("proves a command check only on exit zero", async () => {
  const result = await verifier.verify({ repository, runCommand: async () => ({ spec, exitCode: 0, stdout: "ok", stderr: "", durationMs: 12 }) });
  assert.equal(result.status, "proven");
  assert.equal(result.reason, "npm test · exit 0");
});

test("fails a command check on a non-zero exit", async () => {
  const result = await verifier.verify({ repository, runCommand: async () => ({ spec, exitCode: 1, stdout: "", stderr: "bad", durationMs: 12 }) });
  assert.equal(result.status, "failed");
});

test("leaves a command check unverified when no command is discoverable", async () => {
  const result = await verifier.verify({
    repository: { root: "/tmp/example", changes: [], testFiles: [] },
    runCommand: async () => { throw new Error("should not run"); },
  });
  assert.equal(result.status, "unverified");
  assert.equal(result.evidence.length, 0);
});

test("reports a timed-out command as concrete failure", async () => {
  const result = await verifier.verify({
    repository,
    runCommand: async () => ({ spec, exitCode: null, stdout: "", stderr: "", durationMs: 100, timedOut: true, timeoutMs: 100, error: "Timed out" }),
  });
  assert.equal(result.status, "failed");
  assert.match(result.reason, /timed out/);
});
