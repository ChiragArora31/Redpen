import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { CommandEvidence, VerificationResult, Verifier } from "../core/types.js";
import { runProcess } from "../system/process.js";
import { safeRelativePath } from "../session/validation.js";

const exec = promisify(execFile);

/** Materialize regular Git blobs, not a checkout: never touch the user's index or dependencies.
 * Deliberately small beta: no symlinks, submodules, installs, build steps or copied node_modules.
 * This is isolation from accidental writes, NOT a security sandbox for project code.
 */
async function materialize(root: string, tree: string, destination: string): Promise<void> {
  const { stdout } = await exec("git", ["ls-tree", "-rz", "--full-tree", tree], { cwd: root, maxBuffer: 2_000_000, timeout: 30_000 });
  const entries = stdout.split("\0").filter(Boolean);
  if (entries.length > 500) throw new Error("Regression beta supports snapshots of up to 500 files.");
  let total = 0;
  for (const entry of entries) {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/s.exec(entry);
    if (!match) throw new Error("Cannot read baseline tree entry.");
    const [, mode, type, hash, rawPath] = match;
    if (rawPath?.startsWith(".redpen/")) continue;
    if (type !== "blob" || !["100644", "100755"].includes(mode!)) throw new Error("Regression beta does not support symlinks or submodules.");
    const path = safeRelativePath(rawPath!, "snapshot path");
    if (path.split("/").some((part) => part.toLowerCase() === ".git" || part.toLowerCase() === "node_modules")) throw new Error("Unsafe regression snapshot path.");
    const { stdout: bytes } = await exec("git", ["cat-file", "blob", hash!], { cwd: root, encoding: "buffer", maxBuffer: 5_000_000, timeout: 30_000 });
    total += bytes.length;
    if (total > 25_000_000) throw new Error("Regression beta supports snapshots of up to 25 MB.");
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { mode: mode === "100755" ? 0o755 : 0o644 });
  }
}

function singleTest(run: CommandEvidence, passed: boolean): string | undefined {
  if (run.error || run.timedOut || !new RegExp(`^# tests 1$`, "m").test(run.stdout)) return undefined;
  const match = new RegExp(`^${passed ? "ok" : "not ok"} 1 - (.+)$`, "m").exec(run.stdout);
  if (!match || /# (SKIP|TODO)/i.test(match[1]!)) return undefined;
  if (passed) return run.exitCode === 0 && /^# pass 1$/m.test(run.stdout) ? match[1] : undefined;
  return run.exitCode !== 0 && /code: ['"]ERR_ASSERTION['"]/.test(run.stdout) ? match[1] : undefined;
}

export const regressionTestVerifier: Verifier = {
  type: "regression-test",
  async verify(context, config): Promise<VerificationResult> {
    const result = (status: VerificationResult["status"], reason: string, runs: CommandEvidence[] = []): VerificationResult => ({
      id: "regression-test", title: "Regression reproduces the bug", status, reason,
      evidence: runs.map((run, index) => ({ type: "command", source: index === 0 ? "baseline + current test" : "current snapshot", summary: `${run.spec.display} · exit ${run.exitCode ?? "unknown"}`, details: run })),
    });
    if (!context.baselineTree || !context.repository.stateTree) return result("unverified", "A task baseline is required. Start a Redpen task before making changes.");
    if (typeof config?.path !== "string") return result("unverified", "Specify a focused node:test file with --path.");
    const path = safeRelativePath(config.path, "regression test path");
    const temporary = await mkdtemp(join(tmpdir(), "redpen-regression-"));
    const baseline = join(temporary, "baseline");
    const current = join(temporary, "current");
    try {
      await Promise.all([mkdir(baseline), mkdir(current)]);
      await materialize(context.repository.root, context.baselineTree, baseline);
      await materialize(context.repository.root, context.repository.stateTree, current);
      const test = await readFile(join(current, path));
      await mkdir(dirname(join(baseline, path)), { recursive: true });
      await writeFile(join(baseline, path), test);
      const spec = { command: process.execPath, args: ["--test", "--test-reporter=tap", path], display: `node --test ${path}`, source: "regression-test" };
      const options = { ...(context.timeoutMs ? { timeoutMs: context.timeoutMs } : {}), env: { NODE_OPTIONS: "", NODE_PATH: "", NODE_TEST_CONTEXT: undefined } };
      const before = await runProcess(spec, baseline, options);
      const after = await runProcess(spec, current, options);
      // Temporary paths are implementation details, never part of a shareable receipt.
      for (const run of [before, after]) {
        run.spec = { ...run.spec, command: "node" };
        for (const key of ["stdout", "stderr"] as const) run[key] = run[key].replaceAll(`/private${temporary}`, "<regression-snapshot>").replaceAll(temporary, "<regression-snapshot>");
      }
      const runs = [before, after];
      if (after.error || after.timedOut) return result("unverified", "The current regression test could not complete. Inspect the command evidence.", runs);
      const currentTest = singleTest(after, true);
      if (!currentTest) return result(after.exitCode !== 0 && singleTest(after, false) ? "failed" : "unverified", "The current snapshot must pass exactly one unskipped node:test assertion test.", runs);
      if (singleTest(before, true)) return result("failed", "This test also passes on the baseline; it does not reproduce the bug.", runs);
      if (singleTest(before, false) !== currentTest) return result("unverified", "Baseline must fail the same named test with ERR_ASSERTION. Setup errors are not regression proof.", runs);
      return result("proven", `“${currentTest}” fails with an assertion on the baseline and passes on the current snapshot. This proves the tested case, not general correctness.`, runs);
    } catch (error) {
      return result("unverified", `Cannot isolate the regression test: ${error instanceof Error ? error.message.replaceAll(temporary, "<regression-snapshot>") : "snapshot unavailable"}`);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
};
