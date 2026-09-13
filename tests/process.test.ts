import assert from "node:assert/strict";
import test from "node:test";
import { runProcess } from "../src/system/process.js";

test("stops a command after its timeout and records the reason", async () => {
  const spec = {
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    display: "hanging command",
    source: "test",
  };
  const result = await runProcess(spec, process.cwd(), { timeoutMs: 100 });
  assert.equal(result.timedOut, true);
  assert.equal(result.timeoutMs, 100);
  assert.match(result.error ?? "", /Timed out/);
  assert.ok(result.durationMs < 5_000);
});

test("bounds captured command output", async () => {
  const spec = {
    command: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(30000))"],
    display: "large output",
    source: "test",
  };
  const result = await runProcess(spec, process.cwd());
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /output truncated by Redpen/);
  assert.ok(result.stdout.length < 9_000);
});
