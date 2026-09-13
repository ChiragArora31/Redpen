import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { latestCompletionAfter, parseCodexSession } from "../src/agents/codex/parser.js";

const fixtures = join(process.cwd(), "tests", "fixtures", "codex");

test("parses Codex metadata, completion, and historical tool-call count", async () => {
  const path = join(fixtures, "valid-session.jsonl");
  const record = parseCodexSession(await readFile(path, "utf8"), path);
  assert.equal(record.id, "codex-valid");
  assert.equal(record.workingDirectory, "/tmp/project with spaces");
  assert.equal(record.completions.length, 1);
  assert.match(record.completions[0]?.message ?? "", /All tests pass/);
  assert.equal(record.historicalToolCalls, 1);
});

test("recovers a final answer when the final JSONL record is truncated", async () => {
  const path = join(fixtures, "truncated-session.jsonl");
  const record = parseCodexSession(await readFile(path, "utf8"), path);
  assert.equal(record.truncated, true);
  assert.equal(record.completions[0]?.message, "All tests pass.");
});

test("rejects malformed records before the truncatable final line", async () => {
  const path = join(fixtures, "malformed.jsonl");
  const contents = await readFile(path, "utf8");
  assert.throws(() => parseCodexSession(contents, path), /line 1/);
});

test("preserves sessions that have no assistant completion", async () => {
  const path = join(fixtures, "no-completion.jsonl");
  const record = parseCodexSession(await readFile(path, "utf8"), path);
  assert.equal(record.completions.length, 0);
  assert.equal(latestCompletionAfter(record, "2026-09-12T09:00:00.000Z"), undefined);
});
