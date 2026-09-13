import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { collectChanges, parseNumstat, parsePorcelain } from "../src/repository/git.js";

const exec = promisify(execFile);

test("parses changed and untracked paths from porcelain output", () => {
  assert.deepEqual(parsePorcelain(" M src/a.ts\0?? tests/a.test.ts\0"), [
    { path: "src/a.ts", status: " M", untracked: false },
    { path: "tests/a.test.ts", status: "??", untracked: true },
  ]);
});

test("keeps the destination path and consumes the source path for renames", () => {
  assert.deepEqual(parsePorcelain("R  src/new.ts\0src/old.ts\0 M src/next.ts\0"), [
    { path: "src/new.ts", status: "R ", untracked: false },
    { path: "src/next.ts", status: " M", untracked: false },
  ]);
});

test("parses text and binary numstat", () => {
  const stats = parseNumstat("12\t3\tsrc/a.ts\n-\t-\tlogo.png\n");
  assert.deepEqual(stats.get("src/a.ts"), { additions: 12, deletions: 3 });
  assert.deepEqual(stats.get("logo.png"), { additions: null, deletions: null });
});

test("counts staged files before a repository has its first commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "redpen-git-"));
  try {
    await exec("git", ["init", "--quiet"], { cwd: root });
    await writeFile(join(root, "first.ts"), "export const first = true;\n", "utf8");
    await exec("git", ["add", "first.ts"], { cwd: root });
    const changes = await collectChanges(root);
    assert.deepEqual(changes, [{ path: "first.ts", status: "A ", untracked: false, additions: 1, deletions: 0 }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
