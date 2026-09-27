import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { collectRepository } from "../src/repository/collect.js";
import { createWorktreeSnapshot } from "../src/repository/git.js";
import { verifyRepository } from "../src/core/engine.js";
import { initializeProjectConfig, readProjectConfig } from "../src/session/config.js";
import { addCriterion, decideProposal } from "../src/session/criteria.js";
import { startSession } from "../src/session/lifecycle.js";
import { readSession } from "../src/session/store.js";
import { verifierRegistry } from "../src/verifiers/registry.js";
import { createRepository, put, removeRepository } from "./helpers.js";

const cli = join(process.cwd(), "dist", "cli.js");

function runCli(root: string, args: string[]): Promise<{ output: string; error: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: "pipe" });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ output, error, exitCode }));
  });
}

test("init creates a commit-worthy config and start selects its template", async () => {
  const root = await createRepository({
    "package.json": JSON.stringify({ scripts: { test: "node --test", build: "node -e \"process.exit(0)\"" } }),
    "src/index.js": "export const value = 1;\n",
    "tests/index.test.js": "import test from 'node:test'; test('value', () => {});\n",
  });
  try {
    const init = await runCli(root, ["init"]);
    assert.equal(init.exitCode, 0);
    const config = await readProjectConfig(root);
    assert.equal(config?.commands, undefined);
    assert.ok(config?.templates?.refactor?.some((item) => item.required === false));
    const start = await runCli(root, ["start", "--template", "refactor", "Refactor the module"]);
    assert.equal(start.exitCode, 0);
    const session = (await readSession(root))!;
    assert.ok(session.definitionOfDone.some((item) => item.required === false));
    assert.equal(await createWorktreeSnapshot(root), session.repository.baselineTree);
    await assert.rejects(() => initializeProjectConfig(root), /already exists/);
  } finally { await removeRepository(root); }
});

test("project config overrides discovered commands and rejects malformed values", async () => {
  const root = await createRepository({
    "package.json": JSON.stringify({ scripts: { test: "node -e \"process.exit(1)\"" } }),
    "src/index.js": "export const value = 1;\n",
  });
  try {
    await put(root, ".redpen/config.json", JSON.stringify({ schemaVersion: 1, commands: { test: { command: "node", args: ["-e", "process.exit(0)"] } } }));
    const session = await startSession(root, "Use custom command");
    await put(root, "src/index.js", "export const value = 2;\n");
    const repository = await collectRepository(root, session.repository.baselineTree);
    assert.equal(repository.testCommand?.command, "node");
    const report = await verifyRepository(repository, session.definitionOfDone, verifierRegistry, session);
    assert.equal(report.definitionOfDoneResults.find((item) => item.id === "tests")?.status, "proven");
    await put(root, ".redpen/config.json", JSON.stringify({ schemaVersion: 1, commands: { test: { command: "node", args: "-e" } } }));
    await assert.rejects(() => readProjectConfig(root), /commands.test.args must be an array/);
  } finally { await removeRepository(root); }
});

test("required and advisory criteria share verifiers but have different verdict effects", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Add a useful file");
    await put(root, "src/index.ts", "export const value = 2;\n");
    await addCriterion(session, { title: "Release notes exist", type: "file-exists", config: { path: "release-notes.md" }, required: false });
    const current = (await readSession(root))!;
    const repository = await collectRepository(root, current.repository.baselineTree);
    const advisoryReport = await verifyRepository(repository, current.definitionOfDone, verifierRegistry, current);
    assert.equal(advisoryReport.verdict, "done");
    assert.equal(advisoryReport.advisorySummary?.failed, 1);
    await addCriterion(current, { title: "Feature flag exists", type: "content-matches", config: { path: "src/index.ts", text: "featureFlag" } });
    const required = (await readSession(root))!;
    const requiredReport = await verifyRepository(repository, required.definitionOfDone, verifierRegistry, required);
    assert.equal(requiredReport.verdict, "not_done");
    assert.equal(requiredReport.requiredSummary?.failed, 1);
  } finally { await removeRepository(root); }
});

test("proposed criteria are inert until accepted, and can be rejected", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Review proposed checks");
    const proposed = await addCriterion(session, { title: "API contract exists", type: "file-exists", config: { path: "api.json" }, propose: true });
    assert.equal((await readSession(root))?.definitionOfDone.some((item) => item.id === proposed.id), false);
    await decideProposal(session, proposed.id, true);
    assert.equal((await readSession(root))?.definitionOfDone.some((item) => item.id === proposed.id), true);
    const rejected = await addCriterion(session, { title: "Docs updated", type: "file-exists", config: { path: "docs.md" }, propose: true });
    await decideProposal(session, rejected.id, false);
    assert.equal((await readSession(root))?.definitionOfDone.some((item) => item.id === rejected.id), false);
  } finally { await removeRepository(root); }
});

test("config edits make the last report stale without crediting config as implementation", async () => {
  const root = await createRepository();
  try {
    await put(root, ".redpen/config.json", JSON.stringify({ schemaVersion: 1 }));
    const session = await startSession(root, "Track proof plan freshness");
    assert.deepEqual((await collectRepository(root, session.repository.baselineTree)).changes, []);
    await put(root, ".redpen/config.json", JSON.stringify({ schemaVersion: 1, commands: {} }));
    assert.deepEqual((await collectRepository(root, session.repository.baselineTree)).changes, []);
    assert.notEqual(await createWorktreeSnapshot(root), session.repository.baselineTree);
  } finally { await removeRepository(root); }
});

test("CLI exposes missing evidence and refuses an unsafe file path", async () => {
  const root = await createRepository();
  try {
    assert.equal((await runCli(root, ["start", "Add verification"])).exitCode, 0);
    const unsafe = await runCli(root, ["add", "Escape", "--type", "file-exists", "--path", "../secret"]);
    assert.equal(unsafe.exitCode, 2);
    assert.match(unsafe.error, /must stay inside the repository/);
    const add = await runCli(root, ["add", "Implementation has marker", "--type", "content-matches", "--path", "src/index.ts", "--text", "releaseReady"]);
    assert.equal(add.exitCode, 0);
    const explain = await runCli(root, ["check", "--no-color"]);
    assert.equal(explain.exitCode, 1);
    const report = JSON.parse(await readFile(join(root, ".redpen", "report.json"), "utf8")) as { schemaVersion: number; definitionOfDoneResults: Array<{ title: string; status: string }> };
    assert.equal(report.schemaVersion, 7);
    assert.equal(report.definitionOfDoneResults.find((item) => item.title === "Implementation has marker")?.status, "failed");
    const guidance = await runCli(root, ["explain"]);
    assert.match(guidance.output, /Implementation has marker/);
  } finally { await removeRepository(root); }
});

test("coverage threshold uses a fresh report from its own command", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Measure coverage");
    await put(root, "src/index.ts", "export const value = 2;\n");
    const script = "require('fs').mkdirSync('coverage',{recursive:true});require('fs').writeFileSync('coverage/coverage-summary.json',JSON.stringify({total:{lines:{pct:82}}}))";
    await addCriterion(session, { title: "Coverage at least 80%", type: "coverage-threshold", config: { command: "node", args: ["-e", script], reportPath: "coverage/coverage-summary.json", minimumPercent: 80 } });
    const current = (await readSession(root))!;
    const repository = await collectRepository(root, current.repository.baselineTree);
    const report = await verifyRepository(repository, current.definitionOfDone, verifierRegistry, current);
    assert.equal(report.definitionOfDoneResults.find((item) => item.title === "Coverage at least 80%")?.status, "proven");
    assert.equal(report.evidenceFreshness?.stale, false);
    const tooHigh = { ...current, definitionOfDone: current.definitionOfDone.map((item) => item.title === "Coverage at least 80%" ? { ...item, verifier: { ...item.verifier, config: { ...item.verifier.config, minimumPercent: 90 } } } : item) };
    const failed = await verifyRepository(repository, tooHigh.definitionOfDone, verifierRegistry, tooHigh);
    assert.equal(failed.definitionOfDoneResults.find((item) => item.title === "Coverage at least 80%")?.status, "failed");
  } finally { await removeRepository(root); }
});

test("a command that modifies repository files cannot produce fresh proof", async () => {
  const root = await createRepository();
  try {
    const session = await startSession(root, "Guard evidence freshness");
    await put(root, "src/index.ts", "export const value = 2;\n");
    await addCriterion(session, { title: "Mutating command", type: "command-succeeds", config: { command: "node", args: ["-e", "require('fs').writeFileSync('src/index.ts','export const value = 3;\\n')"] } });
    const current = (await readSession(root))!;
    const repository = await collectRepository(root, current.repository.baselineTree);
    const report = await verifyRepository(repository, current.definitionOfDone, verifierRegistry, current);
    assert.equal(report.verdict, "not_done");
    assert.equal(report.evidenceFreshness?.stale, true);
    assert.equal(report.definitionOfDoneResults.find((item) => item.title === "Mutating command")?.status, "unverified");
  } finally { await removeRepository(root); }
});
