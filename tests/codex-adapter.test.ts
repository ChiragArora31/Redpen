import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { codexAdapter } from "../src/agents/codex/adapter.js";
import { put } from "./helpers.js";

const fixturePath = join(process.cwd(), "tests", "fixtures", "codex", "valid-session.jsonl");

async function codexHome(records: { id: string; cwd: string; completedAt?: string; message?: string }[]): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "redpen-codex-"));
  await mkdir(join(home, "sessions"), { recursive: true });
  for (const record of records) {
    const completedAt = record.completedAt ?? "2026-09-12T10:01:00.000Z";
    const message = record.message ?? "All tests pass.";
    const contents = [
      JSON.stringify({ timestamp: "2026-09-12T10:00:00.000Z", type: "session_meta", payload: { id: record.id, timestamp: "2026-09-12T10:00:00.000Z", cwd: record.cwd } }),
      JSON.stringify({ timestamp: completedAt, type: "event_msg", payload: { type: "task_complete", turn_id: `turn-${record.id}`, last_agent_message: message } }),
    ].join("\n");
    await put(home, `sessions/2026/09/12/rollout-${record.id}.jsonl`, `${contents}\n`);
  }
  return home;
}

function context(home: string, root = "/tmp/project") {
  return { repositoryRoot: root, taskDescription: "Fix authentication", redpenStartedAt: "2026-09-12T09:59:00.000Z", codexHome: home, environment: {} };
}

test("detects Codex storage and reports a missing installation", async () => {
  const missing = await mkdtemp(join(tmpdir(), "redpen-no-codex-"));
  const present = await codexHome([]);
  try {
    assert.equal((await codexAdapter.detect({ codexHome: missing, environment: {} })).detected, false);
    assert.equal((await codexAdapter.detect({ codexHome: present, environment: {} })).detected, true);
  } finally { await Promise.all([rm(missing, { recursive: true, force: true }), rm(present, { recursive: true, force: true })]); }
});

test("discovers one repository and time-matched session", async () => {
  const home = await codexHome([{ id: "match", cwd: "/tmp/project" }, { id: "other", cwd: "/tmp/other" }]);
  try {
    const imported = await codexAdapter.importCompletion(context(home));
    assert.equal(imported.agent.sessionId, "match");
    assert.equal(imported.rawMessage, "All tests pass.");
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("refuses ambiguous sessions and supports explicit session selection", async () => {
  const home = await codexHome([{ id: "first", cwd: "/tmp/project" }, { id: "second", cwd: "/tmp/project" }]);
  try {
    await assert.rejects(() => codexAdapter.importCompletion(context(home)), /Multiple matching Codex sessions/);
    const imported = await codexAdapter.importCompletion({ ...context(home), sessionId: "second" });
    assert.equal(imported.agent.sessionId, "second");
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("prefers an inherited Codex thread ID", async () => {
  const home = await codexHome([{ id: "first", cwd: "/tmp/project" }, { id: "second", cwd: "/tmp/project" }]);
  try {
    const imported = await codexAdapter.importCompletion({ ...context(home), environment: { CODEX_THREAD_ID: "first" } });
    assert.equal(imported.agent.sessionId, "first");
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("imports an explicit file whose path contains spaces", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redpen codex file "));
  const destination = join(directory, "session data.jsonl");
  try {
    await put(directory, "session data.jsonl", await readFile(fixturePath, "utf8"));
    const imported = await codexAdapter.importCompletion({ ...context(directory), filePath: destination });
    assert.equal(imported.source.type, "file");
    assert.equal(imported.agent.sessionId, "codex-valid");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("never executes commands embedded in a transcript", async () => {
  const target = "/tmp/redpen-must-not-execute";
  await rm(target, { force: true });
  await codexAdapter.importCompletion({ ...context("/tmp"), filePath: fixturePath });
  await assert.rejects(() => access(target), /ENOENT/);
});

test("reports explicit malformed and completion-free sessions clearly", async () => {
  await assert.rejects(
    () => codexAdapter.importCompletion({ ...context("/tmp"), filePath: join(process.cwd(), "tests", "fixtures", "codex", "malformed.jsonl") }),
    /could not be parsed/,
  );
  await assert.rejects(
    () => codexAdapter.importCompletion({ ...context("/tmp"), filePath: join(process.cwd(), "tests", "fixtures", "codex", "no-completion.jsonl") }),
    /no assistant completion/,
  );
});
