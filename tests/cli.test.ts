import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createRepository, put, removeRepository } from "./helpers.js";
import { readSession } from "../src/session/store.js";

const exec = promisify(execFile);
const cli = join(process.cwd(), "dist", "cli.js");

async function runCli(root: string, args: string[], input?: string, environment: NodeJS.ProcessEnv = {}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: "pipe", env: { ...process.env, ...environment } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
    child.stdin.end(input);
  });
}

test("reports the package version", async () => {
  const result = await runCli(process.cwd(), ["--version"]);
  const packageVersion = (JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as { version: string }).version;
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), packageVersion);
});

test("help presents the golden path and launch-safe timeout option", async () => {
  const result = await runCli(process.cwd(), ["--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /"Done" is a claim\. Evidence makes it true\./);
  assert.match(result.stdout, /redpen start "Fix pagination when cursor is null"[\s\S]+redpen import codex[\s\S]+redpen check/);
  assert.match(result.stdout, /--timeout/);
});

test("rejects invalid timeout and unknown options", async () => {
  const root = await createRepository();
  try {
    const timeout = await runCli(root, ["check", "--timeout", "never"]);
    assert.equal(timeout.exitCode, 2);
    assert.match(timeout.stderr, /must be a number of seconds/);
    const unknown = await runCli(root, ["status", "--mystery"]);
    assert.equal(unknown.exitCode, 2);
    assert.match(unknown.stderr, /Unknown option/);
  } finally { await removeRepository(root); }
});

test("status reads the last report without rerunning checks and reset clears only Redpen state", async () => {
  const root = await createRepository({
    "package.json": JSON.stringify({ scripts: { test: "node -e \"require('fs').appendFileSync('runs.txt','x')\"" } }),
    "src/index.js": "export const value = 1;\n",
  });
  try {
    await exec(process.execPath, [cli, "start", "Track a task"], { cwd: root });
    const before = await exec(process.execPath, [cli, "status"], { cwd: root });
    assert.match(before.stdout, /Not checked yet/);
    await put(root, "src/index.js", "export const value = 2;\n");
    await exec(process.execPath, [cli, "check", "--no-color"], { cwd: root });
    assert.equal(await readFile(join(root, "runs.txt"), "utf8"), "x");
    const after = await exec(process.execPath, [cli, "status"], { cwd: root });
    assert.match(after.stdout, /2 proven · 0 failed · 0 unverified/);
    assert.equal(await readFile(join(root, "runs.txt"), "utf8"), "x");

    await exec(process.execPath, [cli, "claims", "No breaking changes were introduced."], { cwd: root });
    const stale = await exec(process.execPath, [cli, "status"], { cwd: root });
    assert.match(stale.stdout, /1 new claim awaiting verification/);
    assert.match(stale.stdout, /NOT DONE/);
    assert.equal(await readFile(join(root, "runs.txt"), "utf8"), "x");

    await exec(process.execPath, [cli, "reset", "--yes"], { cwd: root });
    await assert.rejects(() => access(join(root, ".redpen", "session.json")), /ENOENT/);
    await assert.rejects(() => access(join(root, ".redpen", "report.json")), /ENOENT/);
    assert.equal(await readFile(join(root, "src/index.js"), "utf8"), "export const value = 2;\n");
  } finally { await removeRepository(root); }
});

test("claims accepts direct, file, and stdin input and status reports the persisted count", async () => {
  const root = await createRepository();
  try {
    await exec(process.execPath, [cli, "start", "Ingest completion claims"], { cwd: root });
    const direct = await runCli(root, ["claims", "All tests pass."]);
    assert.equal(direct.exitCode, 0);
    await put(root, "completion.txt", "Build succeeds.\n");
    const file = await runCli(root, ["claims", "--file", "completion.txt"]);
    assert.equal(file.exitCode, 0);
    const stdin = await runCli(root, ["claims"], "No breaking changes were introduced.\n");
    assert.equal(stdin.exitCode, 0);

    const claims = (await readSession(root))?.agentCompletion?.claims ?? [];
    assert.deepEqual(claims.map((claim) => claim.type), ["tests-pass", "build-pass", "unknown"]);
    const status = await runCli(root, ["status"]);
    assert.match(status.stdout, /Agent claims:\n3 claims/);
  } finally { await removeRepository(root); }
});

test("Codex file import supports dry-run, provenance, status, and idempotency", async () => {
  const root = await createRepository();
  const fixture = join(process.cwd(), "tests", "fixtures", "codex", "valid-session.jsonl");
  try {
    await runCli(root, ["start", "Import Codex"]);
    const preview = await runCli(root, ["import", "codex", "--file", fixture, "--dry-run"]);
    assert.equal(preview.exitCode, 0);
    assert.match(preview.stdout, /No files changed/);
    assert.equal((await readSession(root))?.agentCompletion, undefined);

    const imported = await runCli(root, ["import", "codex", "--file", fixture]);
    assert.equal(imported.exitCode, 0);
    assert.match(imported.stdout, /5 claims detected/);
    const session = await readSession(root);
    assert.equal(session?.agentCompletion?.agent?.id, "codex");
    assert.equal(session?.agentCompletion?.claims[0]?.source.type, "agent");

    const duplicate = await runCli(root, ["import", "codex", "--file", fixture]);
    assert.match(duplicate.stdout, /already imported/);
    assert.equal((await readSession(root))?.agentCompletion?.claims.length, 5);
    const status = await runCli(root, ["status"]);
    assert.match(status.stdout, /Agent:\nCodex/);
    assert.match(status.stdout, /Completion:\nimported/);
  } finally { await removeRepository(root); }
});

test("reports malformed saved reports without a stack trace", async () => {
  const root = await createRepository();
  try {
    await runCli(root, ["start", "Read status safely"]);
    await put(root, ".redpen/report.json", "{}\n");
    const result = await runCli(root, ["status"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /required report fields are missing/);
    assert.doesNotMatch(result.stderr, /at .*\.js:/);
  } finally { await removeRepository(root); }
});
