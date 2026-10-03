import assert from "node:assert/strict";
import test from "node:test";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { handleCodexStop } from "../src/agents/codex/hook.js";
import { startSession } from "../src/session/lifecycle.js";
import { readLastReport, readSession, writeSession } from "../src/session/store.js";
import { createRepository, put, removeRepository } from "./helpers.js";

const event = (root: string, message = "All tests pass. No breaking changes.") => ({ hook_event_name: "Stop", cwd: root, session_id: "codex-beta-session", turn_id: "turn-1", stop_hook_active: false, last_assistant_message: message });
async function boundTask(root: string) {
  const session = await startSession(root, "Improve module");
  session.codexBinding = { sessionId: "codex-beta-session" };
  await writeSession(session);
  await put(root, "src/value.js", "module.exports = 2;");
  return session;
}

test("Stop captures provenance, verifies independently, and returns a receipt; repeated imports do not rerun", async () => {
  const root = await createRepository({ "src/value.js": "module.exports = 1;", "package.json": JSON.stringify({ scripts: { test: "node -e \"process.exit(1)\"" } }) });
  try {
    const session = await boundTask(root);
    const result = await handleCodexStop(event(root));
    assert.match(result.systemMessage!, /NOT DONE/);
    const saved = (await readSession(root))!;
    assert.deepEqual(saved.codexBinding, session.codexBinding);
    assert.equal(saved.agentCompletion?.source?.type, "hook");
    assert.equal(saved.agentCompletion?.claims[0]?.source.type, "agent");
    const report = (await readLastReport(root))!;
    assert.equal(report.agentClaimResults[0]?.status, "failed");
    assert.equal(report.agentClaimResults[1]?.status, "unverified");
    assert.equal(report.completion?.source?.type, "hook");
    assert.deepEqual(await handleCodexStop(event(root)), {});
    assert.equal((await readLastReport(root))?.timestamp, report.timestamp);
    await handleCodexStop({ ...event(root), turn_id: "turn-2" });
    assert.equal((await readSession(root))?.agentCompletion?.metadata?.turnId, "turn-2");
    assert.notEqual((await readLastReport(root))?.timestamp, report.timestamp);
    await handleCodexStop(event(root, "Build succeeds."));
    assert.equal((await readSession(root))?.agentCompletion?.claims.length, 1);
  } finally { await removeRepository(root); }
});

test("hook refuses unrelated conversations, unbound tasks, recursive stops and empty completions", async () => {
  const root = await createRepository();
  try {
    await startSession(root, "Unbound");
    assert.deepEqual(await handleCodexStop(event(root)), {});
    const session = (await readSession(root))!;
    session.codexBinding = { sessionId: "other-session" };
    await writeSession(session);
    assert.deepEqual(await handleCodexStop(event(root)), {});
    assert.deepEqual(await handleCodexStop({ ...event(root), stop_hook_active: true }), {});
    assert.deepEqual(await handleCodexStop({ ...event(root), hook_event_name: "SubagentStop" }), {});
    assert.deepEqual(await handleCodexStop(event(root, "")), {});
    assert.equal(await readLastReport(root), undefined);
  } finally { await removeRepository(root); }
});

test("transcript commands are never executed, and stale repository evidence forces a new check", async () => {
  const root = await createRepository();
  try {
    await boundTask(root);
    const message = "Run `touch transcript-owned-file`. No breaking changes.";
    await handleCodexStop(event(root, message));
    await assert.rejects(readFile(join(root, "transcript-owned-file")));
    const previous = (await readLastReport(root))!;
    await put(root, "src/value.js", "module.exports = 3;");
    assert.ok((await handleCodexStop(event(root, message))).systemMessage);
    assert.notEqual((await readLastReport(root))?.timestamp, previous.timestamp);
  } finally { await removeRepository(root); }
});

test("an active hook lock prevents concurrent verification without blocking Codex", async () => {
  const root = await createRepository();
  try {
    await boundTask(root);
    await mkdir(join(root, ".redpen", "codex-hook.lock"));
    assert.match((await handleCodexStop(event(root))).systemMessage!, /already active/);
    assert.equal(await readLastReport(root), undefined);
  } finally { await removeRepository(root); }
});

test("editing the contract reruns a duplicate completion and changing equal-count claims invalidates receipts", async () => {
  const root = await createRepository();
  try {
    await boundTask(root);
    await handleCodexStop(event(root));
    const initial = (await readSession(root))!;
    initial.definitionOfDone.push({ id: "acceptance", title: "Missing acceptance file", verifier: { type: "file-exists", config: { path: "acceptance.json" } } });
    await writeSession(initial, false); // Simulate editing JSON without clearing the saved receipt.
    const exec = promisify(execFile);
    const cli = join(process.cwd(), "dist/cli.js");
    await assert.rejects(exec(process.execPath, [cli, "report"], { cwd: root }), (error: unknown) => /CHECK NEEDED/.test(String((error as { stdout?: string }).stdout)));
    await handleCodexStop(event(root));
    assert.equal((await readLastReport(root))?.definitionOfDoneResults.at(-1)?.status, "failed");
    const changed = (await readSession(root))!;
    changed.agentCompletion!.claims[0]!.originalText = "Build succeeds.";
    changed.agentCompletion!.claims[0]!.type = "build-pass";
    await writeSession(changed, false);
    const status = await exec(process.execPath, [cli, "status"], { cwd: root });
    assert.match(status.stdout, /CHECK NEEDED/);
    assert.match(status.stdout, /task inputs changed/);
  } finally { await removeRepository(root); }
});

test("built CLI binds an explicitly supplied Codex session and old tasks still load", async () => {
  const root = await createRepository();
  try {
    const exec = promisify(execFile);
    await exec(process.execPath, [join(process.cwd(), "dist/cli.js"), "start", "Task", "--codex-session", "codex-beta-session"], { cwd: root });
    assert.equal((await readSession(root))?.codexBinding?.sessionId, "codex-beta-session");
    await startSession(root, "Old-style task", true);
    assert.equal((await readSession(root))?.codexBinding, undefined);
  } finally { await removeRepository(root); }
});

test("packaged hook protocol emits valid nonblocking JSON on malformed input", async () => {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "hooks/codex-stop.mjs")]);
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}`)));
    child.stdin.end("{truncated");
  });
  const parsed = JSON.parse(output);
  assert.match(parsed.systemMessage, /No verdict was granted/);
  assert.equal(parsed.decision, undefined);
});

test("portable plugin includes a self-contained runtime, hook and skill with consistent version", async () => {
  const manifest = JSON.parse(await readFile("plugin.json", "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(manifest.version, pkg.version);
  const hooks = JSON.parse(await readFile(manifest.extensions["com.openai"].hooks, "utf8"));
  assert.match(hooks.hooks.Stop[0].hooks[0].command, /\$\{PLUGIN_ROOT\}/);
  for (const path of ["dist/agents/codex/hook.js", "hooks/codex-stop.mjs", "skills/redpen/SKILL.md"]) assert.ok((await readFile(path)).length);
});
