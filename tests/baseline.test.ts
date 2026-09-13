import assert from "node:assert/strict";
import test from "node:test";
import { collectChangesSinceTree, createWorktreeSnapshot } from "../src/repository/git.js";
import { collectRepository } from "../src/repository/collect.js";
import { createRepository, git, put, removeRepository } from "./helpers.js";

test("does not attribute pre-existing dirty or untracked files to the task", async () => {
  const root = await createRepository();
  try {
    await put(root, "src/index.ts", "export const value = 2;\n");
    await put(root, "notes.txt", "already here\n");
    const baseline = await createWorktreeSnapshot(root);
    assert.deepEqual(await collectChangesSinceTree(root, baseline), []);

    await put(root, "src/index.ts", "export const value = 3;\n");
    const changes = await collectChangesSinceTree(root, baseline);
    assert.deepEqual(changes.map((change) => change.path), ["src/index.ts"]);
  } finally { await removeRepository(root); }
});

test("snapshots successfully when Redpen state is ignored", async () => {
  const root = await createRepository({ ".gitignore": ".redpen/\n", "src/index.ts": "export const value = 1;\n" });
  try {
    await put(root, ".redpen/old-report.json", "{}\n");
    const baseline = await createWorktreeSnapshot(root);
    assert.deepEqual(await collectChangesSinceTree(root, baseline), []);
  } finally { await removeRepository(root); }
});

test("detects unstaged, staged, and untracked changes after the baseline", async () => {
  const root = await createRepository({
    "src/a.ts": "export const a = 1;\n",
    "src/b.ts": "export const b = 1;\n",
  });
  try {
    const baseline = await createWorktreeSnapshot(root);
    await put(root, "src/a.ts", "export const a = 2;\n");
    await put(root, "src/b.ts", "export const b = 2;\n");
    await git(root, ["add", "src/b.ts"]);
    await put(root, "src/new.ts", "export const c = 3;\n");
    const changes = await collectChangesSinceTree(root, baseline);
    assert.deepEqual(changes.map((change) => change.path), ["src/a.ts", "src/b.ts", "src/new.ts"]);
    assert.equal(changes.find((change) => change.path === "src/new.ts")?.untracked, true);
  } finally { await removeRepository(root); }
});

test("continues to detect task changes after they are committed", async () => {
  const root = await createRepository();
  try {
    const baseline = await createWorktreeSnapshot(root);
    await put(root, "src/index.ts", "export const value = 2;\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "--quiet", "-m", "agent work"]);
    const changes = await collectChangesSinceTree(root, baseline);
    assert.deepEqual(changes.map((change) => change.path), ["src/index.ts"]);
  } finally { await removeRepository(root); }
});

test("dependency and generated tests never contaminate regression evidence", async () => {
  const root = await createRepository({
    "src/math.js": "export const divide = (a, b) => a / b;\n",
    "tests/math.test.js": "// baseline test\n",
  });
  try {
    const baseline = await createWorktreeSnapshot(root);
    await put(root, "node_modules/dependency/test/index.js", "// dependency test\n");
    await put(root, "dist/generated.test.js", "// generated test\n");
    await put(root, "coverage/report.test.js", "// coverage artifact\n");
    await put(root, "vendor/library/spec/helper.js", "// vendored test\n");
    await put(root, ".venv/lib/test_module.py", "# environment test\n");
    await put(root, "tests/math.test.js", "// baseline test\n// division by zero regression\n");

    const repository = await collectRepository(root, baseline);
    assert.deepEqual(repository.changes.map((change) => change.path), ["tests/math.test.js"]);
    assert.deepEqual(repository.testFiles.map((change) => change.path), ["tests/math.test.js"]);
  } finally { await removeRepository(root); }
});
