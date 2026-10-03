import assert from "node:assert/strict";
import test from "node:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { startSession } from "../src/session/lifecycle.js";
import { collectRepository } from "../src/repository/collect.js";
import { verifyRepository } from "../src/core/engine.js";
import { verifierRegistry } from "../src/verifiers/registry.js";
import { validateDefinitionItem } from "../src/session/validation.js";
import { createRepository, git, put, removeRepository } from "./helpers.js";

const focused = `import test from 'node:test'; import assert from 'node:assert/strict'; import { value } from '../src/value.mjs'; test('correct value', () => assert.equal(value, 2));`;
const definition = [{ id: "regression", title: "Reproduces the bug", verifier: { type: "regression-test" as const, config: { path: "tests/value.test.mjs" } } }];

async function fixture() {
  return createRepository({ "package.json": '{"type":"module"}', "src/value.mjs": "export const value = 1;" });
}

test("regression proof executes the current test on baseline and fixed snapshots without touching the real index", async () => {
  const root = await fixture();
  try {
    const session = await startSession(root, "Fix value");
    await put(root, "src/value.mjs", "export const value = 2;");
    await git(root, ["add", "src/value.mjs"]);
    await put(root, "tests/value.test.mjs", focused);
    const index = await git(root, ["diff", "--cached"]);
    const repository = await collectRepository(root, session.repository.baselineTree);
    const report = await verifyRepository(repository, definition, verifierRegistry, session);
    assert.equal(report.verdict, "done");
    assert.equal(report.definitionOfDoneResults[0]?.status, "proven");
    assert.equal(report.definitionOfDoneResults[0]?.evidence.length, 2);
    assert.equal(report.evidenceFreshness?.stale, false);
    assert.equal(await git(root, ["diff", "--cached"]), index);
    assert.doesNotMatch(JSON.stringify(report), /\/redpen-regression-[^/]+\//);
  } finally { await removeRepository(root); }
});

test("dirty starting state is the regression baseline, not HEAD", async () => {
  const root = await fixture();
  try {
    await put(root, "src/value.mjs", "export const value = 2;");
    const session = await startSession(root, "Already fixed before task");
    await put(root, "tests/value.test.mjs", focused);
    const report = await verifyRepository(await collectRepository(root, session.repository.baselineTree), definition, verifierRegistry, session);
    assert.equal(report.definitionOfDoneResults[0]?.status, "failed");
    assert.match(report.definitionOfDoneResults[0]!.reason, /also passes on the baseline/);
  } finally { await removeRepository(root); }
});

test("missing baseline modules are unverified, not proof that a regression failed", async () => {
  const root = await fixture();
  try {
    const session = await startSession(root, "Add module");
    await put(root, "src/new.mjs", "export const value = 2;");
    await put(root, "tests/value.test.mjs", focused.replace("../src/value.mjs", "../src/new.mjs"));
    const report = await verifyRepository(await collectRepository(root, session.repository.baselineTree), definition, verifierRegistry, session);
    assert.equal(report.definitionOfDoneResults[0]?.status, "unverified");
    assert.match(report.definitionOfDoneResults[0]!.reason, /Setup errors/);
  } finally { await removeRepository(root); }
});

test("an unfixed assertion is failed; skipped tests and multi-test suites cannot earn regression proof", async () => {
  const root = await fixture();
  try {
    const session = await startSession(root, "Fix value");
    for (const [contents, expected] of [[focused, "failed"], [focused.replace("test('correct", "test.skip('correct"), "unverified"], [focused + " test('another', () => {});", "unverified"]]) {
      await put(root, "tests/value.test.mjs", contents!);
      const report = await verifyRepository(await collectRepository(root, session.repository.baselineTree), definition, verifierRegistry, session);
      assert.equal(report.definitionOfDoneResults[0]?.status, expected);
    }
  } finally { await removeRepository(root); }
});

test("regression snapshot refuses symlinks and unavailable baselines", async () => {
  const root = await fixture();
  try {
    await symlink("src/value.mjs", join(root, "link.mjs"));
    const session = await startSession(root, "Unsafe snapshot");
    await put(root, "tests/value.test.mjs", focused);
    const repository = await collectRepository(root, session.repository.baselineTree);
    const report = await verifyRepository(repository, definition, verifierRegistry, session);
    assert.equal(report.definitionOfDoneResults[0]?.status, "unverified");
    assert.match(report.definitionOfDoneResults[0]!.reason, /symlinks/);
    const generic = await verifyRepository(repository, definition, verifierRegistry);
    assert.equal(generic.definitionOfDoneResults[0]?.status, "unverified");
  } finally { await removeRepository(root); }
});

test("regression configuration rejects traversal, arbitrary commands and unsupported languages", () => {
  for (const config of [{ path: "../test.mjs" }, { path: "test.py" }, { path: "test.mjs", command: "curl" }]) {
    assert.throws(() => validateDefinitionItem({ ...definition[0], verifier: { type: "regression-test", config } }, "criterion"));
  }
});
