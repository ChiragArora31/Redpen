#!/usr/bin/env node
// Real disposable Git repos; simulated agent words, independently executed checks.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const scenarios = ["regression", "missing-tests", "failed-build", "stale-evidence", "unsupported-claim"];
const selection = process.argv[2];
if (selection && !scenarios.includes(selection)) throw new Error(`Choose: ${scenarios.join(", ")}`);
for (const scenario of selection ? [selection] : scenarios) {
  const root = await mkdtemp(join(tmpdir(), "redpen-case-"));
  const put = async (path, content) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); };
  const run = (args, expected = 0) => {
    console.log(`\n$ redpen ${args.join(" ")}`);
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (result.error || result.status !== expected) throw new Error(`Expected exit ${expected}; got ${result.status}. ${result.error ?? ""}`);
  };
  try {
    console.log(`\n=== ${scenario}: real checks, simulated completion ===`);
    await put("package.json", JSON.stringify({ type: "module", scripts: { test: "node --test", build: "node --check src/page.mjs" } }));
    await put("src/page.mjs", "export const page = cursor => cursor === null ? [] : [1, 2];\n");
    await put("tests/page.test.mjs", "import test from 'node:test'; test('existing case',()=>{});\n");
    for (const args of [["init", "-q"], ["config", "user.name", "Redpen Demo"], ["config", "user.email", "demo@example.test"], ["add", "."], ["commit", "-qm", "baseline"]]) execFileSync("git", args, { cwd: root });
    run(["start", "Fix null cursor pagination"]);
    await put("src/page.mjs", "export const page = cursor => [1, 2];\n");
    if (scenario !== "missing-tests") await put("tests/null-cursor.test.mjs", "import test from 'node:test'; import assert from 'node:assert/strict'; import {page} from '../src/page.mjs'; test('null cursor starts at beginning',()=>assert.deepEqual(page(null),[1,2]));\n");
    if (scenario === "regression") run(["add", "Null cursor regression", "--type", "regression-test", "--path", "tests/null-cursor.test.mjs"]);
    if (scenario === "failed-build") await put("package.json", JSON.stringify({ type: "module", scripts: { test: "node --test", build: 'node -e "process.exit(1)"' } }));
    run(["claims", "Added tests. All tests pass. Build succeeds. No breaking changes."]);
    run(["check", "--no-color", ...(scenario === "unsupported-claim" ? ["--strict-claims"] : [])], ["missing-tests", "failed-build", "unsupported-claim"].includes(scenario) ? 1 : 0);
    if (scenario === "stale-evidence") {
      await put("src/page.mjs", "export const page = cursor => [];\n");
      run(["report"], 1);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}
