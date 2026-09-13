import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { startSession } from "../src/session/lifecycle.js";
import { readSession, statePaths } from "../src/session/store.js";
import { createRepository, put, removeRepository } from "./helpers.js";

test("starts and reads a session with a capability-based definition of done", async () => {
  const root = await createRepository({
    "package.json": JSON.stringify({ scripts: { test: "node --test", build: "tsc" } }),
    "src/index.ts": "export const value = 1;\n",
    "tests/index.test.ts": "// test\n",
  });
  try {
    const session = await startSession(root, "Add retry behavior");
    assert.equal(session.task.description, "Add retry behavior");
    assert.match(session.repository.baselineTree, /^[a-f0-9]{40,64}$/);
    assert.match(session.repository.baselineCommit ?? "", /^[a-f0-9]{40,64}$/);
    assert.deepEqual(session.definitionOfDone.map((item) => item.verifier.type), [
      "changes-exist", "tests-changed", "tests-pass", "build-pass",
    ]);
    assert.deepEqual(await readSession(root), session);
  } finally { await removeRepository(root); }
});

test("refuses an active session and explicitly replaces it", async () => {
  const root = await createRepository();
  try {
    const first = await startSession(root, "First task");
    await assert.rejects(() => startSession(root, "Second task"), /active Redpen task/);
    await put(root, ".redpen/report.json", "{}\n");
    const second = await startSession(root, "Second task", true);
    assert.notEqual(second.id, first.id);
    assert.equal(second.task.description, "Second task");
    await assert.rejects(() => readFile(statePaths(root).report, "utf8"), /ENOENT/);
  } finally { await removeRepository(root); }
});

test("reports precise errors for malformed user-edited definitions", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Editable task");
    const malformed = { ...session, definitionOfDone: [{ id: "custom", title: "Custom", verifier: { type: "magic-proof" } }] };
    await writeFile(statePaths(root).session, JSON.stringify(malformed), "utf8");
    await assert.rejects(() => readSession(root), /unsupported value "magic-proof"/);
  } finally { await removeRepository(root); }
});

test("does not silently ignore unsupported verifier configuration", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Configured task");
    const configured = {
      ...session,
      definitionOfDone: [{ id: "implementation", title: "Implementation", verifier: { type: "changes-exist", config: { path: "src" } } }],
    };
    await writeFile(statePaths(root).session, JSON.stringify(configured), "utf8");
    await assert.rejects(() => readSession(root), /does not accept configuration yet/);
  } finally { await removeRepository(root); }
});

test("rejects malformed persisted claims", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Malformed claim");
    const malformed = {
      ...session,
      agentCompletion: {
        schemaVersion: 1,
        message: "Updated a file.",
        recordedAt: new Date().toISOString(),
        claims: [{ id: "claim", originalText: "Updated a file.", type: "file-changed" }],
      },
    };
    await writeFile(statePaths(root).session, JSON.stringify(malformed), "utf8");
    await assert.rejects(() => readSession(root), /normalized must be an object/);
  } finally { await removeRepository(root); }
});

test("loads claims from older Redpen sessions with manual provenance", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Legacy session");
    const legacy = {
      ...session,
      agentCompletion: {
        schemaVersion: 1,
        agent: { name: "Codex" },
        message: "All tests pass.",
        recordedAt: new Date().toISOString(),
        claims: [{ id: "legacy", originalText: "All tests pass.", type: "tests-pass" }],
      },
    };
    await writeFile(statePaths(root).session, JSON.stringify(legacy), "utf8");
    const loaded = await readSession(root);
    assert.equal(loaded?.agentCompletion?.agent?.id, "unknown");
    assert.deepEqual(loaded?.agentCompletion?.claims[0]?.source, { type: "manual" });
  } finally { await removeRepository(root); }
});

test("rejects a session redirected to another repository or an unsafe Git baseline", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Protect local state");
    await writeFile(statePaths(root).session, JSON.stringify({ ...session, repository: { ...session.repository, root: "/tmp/elsewhere" } }), "utf8");
    await assert.rejects(() => readSession(root), /different repository/);

    await writeFile(statePaths(root).session, JSON.stringify({ ...session, repository: { ...session.repository, baselineTree: "--output=/tmp/unsafe" } }), "utf8");
    await assert.rejects(() => readSession(root), /must be a Git object ID/);
  } finally { await removeRepository(root); }
});
