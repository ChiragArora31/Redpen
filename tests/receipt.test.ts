import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { RedpenReport } from "../src/core/types.js";
import { renderMarkdown } from "../src/reporters/markdown.js";
import { createRepository, put, removeRepository } from "./helpers.js";

const cli = join(process.cwd(), "dist", "cli.js");

function runCli(root: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
  });
}

test("strict claims makes unsupported claims block DONE without changing the default policy", async () => {
  const root = await createRepository();
  try {
    assert.equal((await runCli(root, ["start", "Change the value"])).exitCode, 0);
    await put(root, "src/index.ts", "export const value = 2;\n");
    assert.equal((await runCli(root, ["claims", "No breaking changes were introduced."])).exitCode, 0);
    const ordinary = await runCli(root, ["check", "--no-color"]);
    assert.equal(ordinary.exitCode, 0);
    assert.match(ordinary.stdout, /1 additional claim remains unverified/);
    const strict = await runCli(root, ["check", "--strict-claims", "--no-color"]);
    assert.equal(strict.exitCode, 1);
    assert.match(strict.stdout, /1 agent claim needs proof under the strict-claims policy/);
    const stored = JSON.parse(await readFile(join(root, ".redpen", "report.json"), "utf8")) as RedpenReport;
    assert.equal(stored.schemaVersion, 8);
    assert.equal(stored.verificationPolicy?.requireAllClaims, true);
    assert.equal(stored.requiredSummary?.satisfied, true);
    assert.equal(stored.verdict, "not_done");
    const explanation = await runCli(root, ["explain"]);
    assert.match(explanation.stdout, /UNVERIFIED CLAIMS/);
    assert.match(explanation.stdout, /No breaking changes were introduced/);
    assert.match(explanation.stdout, /These claims block DONE under the strict-claims policy/);
  } finally { await removeRepository(root); }
});

test("a committed project policy can require proof for every claim", async () => {
  const root = await createRepository({
    ".redpen/config.json": JSON.stringify({ schemaVersion: 1, policy: { requireAllClaims: true } }),
    "src/index.ts": "export const value = 1;\n",
  });
  try {
    await runCli(root, ["start", "Change the value"]);
    await put(root, "src/index.ts", "export const value = 2;\n");
    await runCli(root, ["claims", "No breaking changes were introduced."]);
    const check = await runCli(root, ["check", "--no-color"]);
    assert.equal(check.exitCode, 1);
    const stored = JSON.parse(await readFile(join(root, ".redpen", "report.json"), "utf8")) as RedpenReport;
    assert.equal(stored.verificationPolicy?.requireAllClaims, true);
    await put(root, ".redpen/config.json", JSON.stringify({ schemaVersion: 1, policy: { requireAllClaims: "yes" } }));
    const malformed = await runCli(root, ["check"]);
    assert.equal(malformed.exitCode, 2);
    assert.match(malformed.stderr, /policy.requireAllClaims must be a boolean/);
  } finally { await removeRepository(root); }
});

test("report prints a shareable receipt without rerunning checks and warns when stale", async () => {
  const root = await createRepository({
    "package.json": JSON.stringify({ scripts: { test: "node -e \"require('fs').appendFileSync('.redpen/runs.txt','x')\"" } }),
    "src/index.js": "export const value = 1;\n",
  });
  try {
    await runCli(root, ["start", "Review a change"]);
    await put(root, "src/index.js", "export const value = 2;\n");
    const check = await runCli(root, ["check", "--markdown"]);
    assert.equal(check.exitCode, 0);
    assert.match(check.stdout, /# Redpen evidence receipt/);
    assert.match(check.stdout, /\*\*Verdict:\*\* DONE/);
    assert.equal(await readFile(join(root, ".redpen", "runs.txt"), "utf8"), "x");
    const receipt = await runCli(root, ["report"]);
    assert.equal(receipt.exitCode, 0);
    assert.match(receipt.stdout, /\*\*Task:\*\* Review a change/);
    assert.equal(await readFile(join(root, ".redpen", "runs.txt"), "utf8"), "x");
    await put(root, "src/index.js", "export const value = 3;\n");
    const stale = await runCli(root, ["report"]);
    assert.equal(stale.exitCode, 1);
    assert.match(stale.stdout, /\*\*Verdict:\*\* CHECK NEEDED/);
    assert.match(stale.stdout, /Evidence is stale/);
    assert.equal(await readFile(join(root, ".redpen", "runs.txt"), "utf8"), "x");
  } finally { await removeRepository(root); }
});

test("Markdown treats agent content as text and never includes raw command output", () => {
  const report: RedpenReport = {
    schemaVersion: 6, redpenVersion: "0.1.1", timestamp: "2026-10-02T00:00:00.000Z", repository: { root: "." },
    summary: { proven: 1, failed: 0, unverified: 1, done: true },
    definitionOfDoneSummary: { proven: 1, failed: 0, unverified: 0, satisfied: true },
    agentClaimSummary: { proven: 0, failed: 0, unverified: 1 }, verdict: "done",
    task: { description: "Fix [pagination](https://bad.example)\n## forged heading\u001b[31m" },
    definitionOfDone: [{ id: "tests", title: "Tests pass", verifier: { type: "tests-pass" } }],
    definitionOfDoneResults: [{ id: "tests", title: "Tests pass", status: "proven", reason: "npm test · exit 0", evidence: [{ type: "command", source: "package.json", summary: "npm test → exit 0", details: { stdout: "SECRET_TOKEN=do-not-share" } }] }],
    agentClaims: [{ id: "claim", originalText: "No breaking changes", type: "unknown", source: { type: "manual" } }],
    agentClaimResults: [{ claimId: "claim", originalText: "No breaking changes\n## forged claim", normalizedType: "unknown", status: "unverified", reason: "No verifier available", evidence: [] }],
    checks: [],
  };
  const output = renderMarkdown(report);
  assert.doesNotMatch(output, /SECRET_TOKEN/);
  assert.doesNotMatch(output, /\u001b/);
  assert.doesNotMatch(output, /\n## forged/);
  assert.doesNotMatch(output, /\[pagination\]\(https:\/\/bad\.example\)/);
  assert.match(output, /\*\*Claim policy:\*\* Required criteria must be proven/);
});

test("receipt CLI refuses missing reports and incompatible output options", async () => {
  const root = await createRepository();
  try {
    const missing = await runCli(root, ["report"]);
    assert.equal(missing.exitCode, 2);
    assert.match(missing.stderr, /Run `redpen check` first/);
    const conflict = await runCli(root, ["check", "--json", "--markdown"]);
    assert.equal(conflict.exitCode, 2);
    assert.match(conflict.stderr, /either `--json` or `--markdown`/);
    const verbose = await runCli(root, ["check", "--markdown", "--verbose"]);
    assert.equal(verbose.exitCode, 2);
    assert.match(verbose.stderr, /Markdown omits raw command output/);
  } finally { await removeRepository(root); }
});

test("explain distinguishes contradicted claims from missing proof", async () => {
  const root = await createRepository({
    "package.json": JSON.stringify({ scripts: { test: "node -e \"process.exit(1)\"" } }),
    "src/index.js": "export const value = 1;\n",
  });
  try {
    await runCli(root, ["start", "Review failed tests"]);
    await put(root, "src/index.js", "export const value = 2;\n");
    await runCli(root, ["claims", "All tests pass. No breaking changes."]);
    const check = await runCli(root, ["check", "--no-color"]);
    assert.equal(check.exitCode, 1);
    const explanation = await runCli(root, ["explain"]);
    assert.match(explanation.stdout, /CONTRADICTED CLAIMS/);
    assert.match(explanation.stdout, /FAILED  “All tests pass\.”/);
    assert.match(explanation.stdout, /UNVERIFIED CLAIMS/);
  } finally { await removeRepository(root); }
});
