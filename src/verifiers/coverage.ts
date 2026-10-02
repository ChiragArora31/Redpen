import { readFile, stat } from "node:fs/promises";
import type { CommandSpec, Evidence, Verifier } from "../core/types.js";
import { repositoryFile } from "./files.js";

function percentage(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const report = value as Record<string, unknown>;
  const istanbul = (report.total as Record<string, unknown> | undefined)?.lines as Record<string, unknown> | undefined;
  if (typeof istanbul?.pct === "number") return istanbul.pct;
  const python = report.totals as Record<string, unknown> | undefined;
  return typeof python?.percent_covered === "number" ? python.percent_covered : undefined;
}

export const coverageThresholdVerifier: Verifier = {
  type: "coverage-threshold",
  async verify({ repository, runCommand }, config) {
    const command = String(config?.command ?? "");
    const args = config?.args as string[];
    const path = String(config?.reportPath ?? "");
    const minimum = Number(config?.minimumPercent);
    const spec: CommandSpec = { command, args, display: [command, ...args].join(" "), source: "Definition of Done coverage command" };
    const run = await runCommand(spec);
    const evidence: Evidence[] = [{ type: "command", source: spec.source, summary: `${spec.display} → ${run.timedOut ? "timed out" : run.exitCode === null ? "could not start" : `exit ${run.exitCode}`}`, details: run }];
    if (run.exitCode !== 0) return { id: this.type, title: "Coverage threshold", status: "failed", reason: `${spec.display} did not succeed.`, evidence };
    const file = await repositoryFile(repository.root, path);
    if (!file.exists || !file.regular) return { id: this.type, title: "Coverage threshold", status: "unverified", reason: `Coverage command did not produce ${path}.`, evidence };
    const modified = (await stat(file.resolved)).mtimeMs;
    if (modified <= Date.parse(run.startedAt)) return { id: this.type, title: "Coverage threshold", status: "unverified", reason: `${path} predates the coverage command.`, evidence };
    let result: unknown;
    try { result = JSON.parse(await readFile(file.resolved, "utf8")); }
    catch { return { id: this.type, title: "Coverage threshold", status: "unverified", reason: `${path} is not valid coverage JSON.`, evidence }; }
    const actual = percentage(result);
    if (actual === undefined || !Number.isFinite(actual) || actual < 0 || actual > 100) return { id: this.type, title: "Coverage threshold", status: "unverified", reason: `${path} has no supported total coverage percentage.`, evidence };
    evidence.push({ type: "command", source: path, summary: `${actual}% line coverage in ${path}`, details: { actual, minimum } });
    return { id: this.type, title: "Coverage threshold", status: actual >= minimum ? "proven" : "failed", reason: `${actual}% line coverage; required ${minimum}%.`, evidence };
  },
};
