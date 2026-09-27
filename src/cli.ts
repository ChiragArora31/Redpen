#!/usr/bin/env node
import { collectRepository } from "./repository/collect.js";
import { verifyRepository } from "./core/engine.js";
import { renderSessionStarted, renderTerminal } from "./reporters/terminal.js";
import { writeJsonReport } from "./reporters/json.js";
import { verifierRegistry } from "./verifiers/registry.js";
import { genericDefinitionOfDone } from "./session/definition.js";
import { startSession } from "./session/lifecycle.js";
import { clearSession, readLastReport, readSession } from "./session/store.js";
import { findRepositoryRoot } from "./repository/git.js";
import { renderStatus } from "./reporters/status.js";
import { createInterface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ingestClaims } from "./claims/store.js";
import { agentRegistry } from "./agents/registry.js";
import { applyAgentImport } from "./agents/import.js";
import { REDPEN_VERSION } from "./version.js";
import { DEFAULT_COMMAND_TIMEOUT_MS } from "./system/process.js";
import { initializeProjectConfig } from "./session/config.js";
import { addCriterion, decideProposal } from "./session/criteria.js";
import { createWorktreeSnapshot } from "./repository/git.js";
import type { BuiltinVerifierType } from "./core/types.js";

const HELP = `Redpen

"Done" is a claim. Evidence makes it true.

Usage:
  redpen init
  redpen start [--template <name>] [--force] "<task>"
  redpen add "<criterion>" --type <verifier> [options]
  redpen add "<criterion>" --command <program> [args...]
  redpen accept <proposal-id>
  redpen reject <proposal-id>
  redpen import codex [--session <id>] [--file <path>] [--dry-run]
  redpen check [--timeout <seconds>] [--json] [--verbose]
  redpen explain
  redpen status
  redpen claims [--file <path>] "<completion claims>"
  redpen reset [--yes]

Typical workflow:

  redpen start "Fix pagination when cursor is null"
  # work normally with Codex
  redpen import codex
  redpen check

Options:
  --timeout    Stop each test/build command after this many seconds (default: 120)
  --json       Print the report as JSON; .redpen/report.json is always written
  --verbose    Show detailed evidence and command output
  --advisory   Make a new criterion non-blocking
  --propose    Queue a criterion until it is accepted
  --help       Show help
  --version    Show version`;

async function confirmReset(): Promise<boolean> {
  if (!process.stdin.isTTY) throw new Error("Reset requires confirmation. Re-run with `redpen reset --yes`.");
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await input.question("Clear the active Redpen task and report? [y/N] ")).trim().toLowerCase() === "y"; }
  finally { input.close(); }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("Provide claim text as an argument, with `--file`, or pipe it to stdin.");
  let contents = "";
  for await (const chunk of process.stdin) contents += chunk.toString();
  return contents;
}

async function claimInput(args: string[]): Promise<string> {
  const fileIndex = args.indexOf("--file");
  const direct = args.filter((arg, index) => arg !== "--file" && (fileIndex < 0 || index !== fileIndex + 1) && !arg.startsWith("--"));
  if (fileIndex >= 0) {
    const path = args[fileIndex + 1];
    if (!path || path.startsWith("--")) throw new Error("`--file` requires a path.");
    if (direct.length > 0) throw new Error("Provide claims using either a direct argument or `--file`, not both.");
    return readFile(resolve(process.cwd(), path), "utf8");
  }
  return direct.length > 0 ? direct.join(" ") : readStdin();
}

function rejectUnknownOptions(args: string[], allowed: string[]): void {
  const unknown = args.find((arg) => arg.startsWith("--") && !allowed.includes(arg));
  if (unknown) throw new Error(`Unknown option: ${unknown}. Run \`redpen --help\` for usage.`);
}

function positionalArgs(args: string[], valueOptions: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (valueOptions.includes(arg)) { index += 1; continue; }
    if (!arg.startsWith("--")) values.push(arg);
  }
  return values;
}

function timeoutValue(args: string[]): number {
  const raw = optionValue(args, "--timeout");
  if (!raw) return DEFAULT_COMMAND_TIMEOUT_MS;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86_400) {
    throw new Error("`--timeout` must be a number of seconds between 0 and 86400.");
  }
  return Math.round(seconds * 1_000);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`\`${name}\` requires a value.`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { console.log(HELP); return; }
  if (args.includes("--version") || args.includes("-v")) { console.log(REDPEN_VERSION); return; }
  const command = args[0];
  if (!command || !["init", "start", "add", "accept", "reject", "claims", "import", "check", "explain", "status", "reset"].includes(command)) {
    console.error(command ? `Unknown command: ${command}\n\n${HELP}` : HELP);
    process.exitCode = command ? 2 : 0;
    return;
  }

  if (command === "start") {
    const commandArgs = args.slice(1);
    rejectUnknownOptions(commandArgs, ["--force", "--template"]);
    const task = positionalArgs(commandArgs, ["--template"]).join(" ");
    const session = await startSession(process.cwd(), task, args.includes("--force"), optionValue(commandArgs, "--template") ?? "default");
    console.log(renderSessionStarted(session.task.description, session.definitionOfDone));
    return;
  }

  const root = await findRepositoryRoot(process.cwd());
  if (command === "init") {
    if (args.length > 1) throw new Error("`redpen init` does not accept arguments.");
    const path = await initializeProjectConfig(root);
    console.log(`REDPEN\n\nProject proof plans created at ${path}.\nCommit .redpen/config.json to share them.`);
    return;
  }
  if (command === "add") {
    const session = await readSession(root);
    if (!session) throw new Error("No active Redpen task. Start one with `redpen start \"<task>\"`.");
    const input = args.slice(1);
    const firstOption = input.findIndex((part) => part.startsWith("--"));
    const title = (firstOption < 0 ? input : input.slice(0, firstOption)).join(" ").trim();
    if (!title) throw new Error("Give the criterion a title, for example: `redpen add \"API test passes\" --command npm test`. ");
    const options = firstOption < 0 ? [] : input.slice(firstOption);
    const commandAt = options.indexOf("--command");
    const namedOptions = commandAt < 0 ? options : options.slice(0, commandAt);
    rejectUnknownOptions(namedOptions, ["--type", "--path", "--text", "--report", "--minimum", "--advisory", "--propose"]);
    const optionNames = new Set(["--type", "--path", "--text", "--report", "--minimum"]);
    if (positionalArgs(namedOptions, [...optionNames]).length > 0) throw new Error("Unexpected add argument. Put command arguments after `--command`.");
    const rawType = optionValue(namedOptions, "--type") ?? (commandAt >= 0 ? "command-succeeds" : undefined);
    if (!rawType) throw new Error("Choose a verifier with `--type`, or provide `--command <program> [args...]`.");
    const type = rawType as BuiltinVerifierType;
    const path = optionValue(namedOptions, "--path");
    const text = optionValue(namedOptions, "--text");
    const reportPath = optionValue(namedOptions, "--report");
    const minimumRaw = optionValue(namedOptions, "--minimum");
    const argv = commandAt < 0 ? [] : options.slice(commandAt + 1);
    if (commandAt >= 0 && (!argv[0] || argv[0].startsWith("--"))) throw new Error("`--command` requires a program followed by optional arguments.");
    const config = {
      ...(path ? { path } : {}),
      ...(text ? { text } : {}),
      ...(reportPath ? { reportPath } : {}),
      ...(minimumRaw ? { minimumPercent: Number(minimumRaw) } : {}),
      ...(argv.length > 0 ? { command: argv[0], args: argv.slice(1) } : {}),
    };
    const item = await addCriterion(session, { title, type, ...(Object.keys(config).length ? { config } : {}), required: !namedOptions.includes("--advisory"), propose: namedOptions.includes("--propose") });
    console.log(`REDPEN\n\n${namedOptions.includes("--propose") ? "Proposed" : "Added"}: ${item.title}\nID: ${item.id}${namedOptions.includes("--propose") ? `\n\nAccept it with: redpen accept ${item.id}` : ""}`);
    return;
  }
  if (command === "accept" || command === "reject") {
    const id = args[1];
    if (!id || args.length !== 2) throw new Error(`Usage: redpen ${command} <proposal-id>`);
    const session = await readSession(root);
    if (!session) throw new Error("No active Redpen task. Start one with `redpen start \"<task>\"`.");
    const item = await decideProposal(session, id, command === "accept");
    console.log(`REDPEN\n\n${command === "accept" ? "Accepted" : "Rejected"}: ${item.title}`);
    return;
  }
  if (command === "import") {
    const commandArgs = args.slice(1);
    rejectUnknownOptions(commandArgs, ["--session", "--file", "--dry-run", "--verbose"]);
    const agentId = args[args.indexOf("import") + 1];
    if (!agentId || agentId.startsWith("--")) throw new Error("Choose an agent to import, for example: `redpen import codex`.");
    const adapter = agentRegistry[agentId];
    if (!adapter) throw new Error(`Unknown agent adapter: ${agentId}. Available adapters: ${Object.keys(agentRegistry).join(", ")}.`);
    const session = await readSession(root);
    if (!session) throw new Error("No active Redpen task. Start one with `redpen start \"<task>\"`.");
    const selectedSession = optionValue(args, "--session");
    const file = optionValue(args, "--file");
    if (positionalArgs(commandArgs, ["--session", "--file"]).length !== 1) throw new Error("Unexpected import argument. Run `redpen --help` for usage.");
    if (selectedSession && file) throw new Error("Use either `--session` or `--file`, not both.");
    const imported = await adapter.importCompletion({
      repositoryRoot: root,
      taskDescription: session.task.description,
      redpenStartedAt: session.startedAt,
      ...(selectedSession ? { sessionId: selectedSession } : {}),
      ...(file ? { filePath: resolve(process.cwd(), file) } : {}),
      environment: process.env,
    });
    const result = await applyAgentImport(session, imported, args.includes("--dry-run"));
    console.log("REDPEN\n");
    if (result.alreadyImported) console.log(`${adapter.displayName} session already imported.\nNo new claims found.`);
    else {
      console.log(args.includes("--dry-run") ? `${adapter.displayName} completion ready to import. No files changed.\n` : `${adapter.displayName} completion imported.\n`);
      console.log(`${result.detectedClaims.length} ${result.detectedClaims.length === 1 ? "claim" : "claims"} detected:\n`);
      for (const claim of result.detectedClaims) console.log(`□ ${claim.originalText}`);
      console.log("\nRun:\n\nredpen check");
    }
    return;
  }
  if (command === "claims") {
    const commandArgs = args.slice(1);
    rejectUnknownOptions(commandArgs, ["--file"]);
    const result = await ingestClaims(root, await claimInput(commandArgs));
    console.log("REDPEN\n");
    console.log(`${result.added.length} ${result.added.length === 1 ? "claim" : "claims"} recorded.`);
    for (const claim of result.added) console.log(`□ ${claim.originalText}`);
    if (result.duplicates > 0) console.log(`\n${result.duplicates} exact ${result.duplicates === 1 ? "duplicate was" : "duplicates were"} already present.`);
    console.log("\nRun:\n\nredpen check");
    return;
  }
  if (command === "status") {
    rejectUnknownOptions(args.slice(1), []);
    if (args.length > 1) throw new Error("`redpen status` does not accept arguments.");
    const session = await readSession(root);
    if (!session) {
      console.log("No active Redpen task.\n\nStart one with:\n\nredpen start \"<task>\"");
      return;
    }
    const report = await readLastReport(root);
    const stale = Boolean(report?.evidenceFreshness && (await createWorktreeSnapshot(root)) !== report.evidenceFreshness.verifiedTree);
    console.log(renderStatus(session, report, stale));
    return;
  }

  if (command === "explain") {
    if (args.length > 1) throw new Error("`redpen explain` does not accept arguments.");
    const session = await readSession(root);
    if (!session) throw new Error("No active Redpen task. Start one with `redpen start \"<task>\"`.");
    const report = await readLastReport(root);
    if (!report || report.session?.id !== session.id) { console.log("No check has run for this task yet. Run `redpen check` first."); return; }
    const stale = Boolean(report.evidenceFreshness && (await createWorktreeSnapshot(root)) !== report.evidenceFreshness.verifiedTree);
    const unresolved = report.definitionOfDoneResults.filter((result, index) => result.status !== "proven" && session.definitionOfDone[index]?.required !== false);
    console.log(["REDPEN", "", `Task: ${session.task.description}`, "", ...(stale ? ["Evidence is stale: repository files changed after the last check.", "Run `redpen check` again.", ""] : []),
      ...(unresolved.length ? unresolved.flatMap((item) => [`${item.status.toUpperCase()}  ${item.title}`, `  ${item.reason}`, ""]) : ["All required criteria were proven at the last check.", ""]),
      ...(session.proposedCriteria?.length ? [`${session.proposedCriteria.length} proposed criteria await acceptance.`] : []),
    ].join("\n"));
    return;
  }

  if (command === "reset") {
    rejectUnknownOptions(args.slice(1), ["--yes"]);
    if (positionalArgs(args.slice(1), []).length > 0) throw new Error("`redpen reset` does not accept arguments.");
    const session = await readSession(root);
    if (!session) { console.log("No active Redpen task."); return; }
    if (!args.includes("--yes") && !await confirmReset()) { console.log("Reset cancelled."); return; }
    await clearSession(root);
    console.log("REDPEN\n\nTask cleared. Repository files were not changed.");
    return;
  }

  const commandArgs = args.slice(1);
  rejectUnknownOptions(commandArgs, ["--json", "--no-color", "--verbose", "--timeout"]);
  if (positionalArgs(commandArgs, ["--timeout"]).length > 0) throw new Error("`redpen check` does not accept positional arguments.");
  const timeoutMs = timeoutValue(commandArgs);
  const session = await readSession(root);
  const repository = await collectRepository(root, session?.repository.baselineTree);
  const definition = session?.definitionOfDone ?? genericDefinitionOfDone;
  const report = await verifyRepository(repository, definition, verifierRegistry, session, { timeoutMs });
  await writeJsonReport(report, root);
  console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : renderTerminal(report, !args.includes("--no-color") && process.stdout.isTTY, args.includes("--verbose")));
  if (report.verdict === "not_done") process.exitCode = 1;
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  const path = error && typeof error === "object" && "path" in error ? String(error.path) : undefined;
  const message = code === "ENOENT" && path
    ? `File not found: ${path}\n\nCheck the path and try again.`
    : code === "EACCES" && path
      ? `Permission denied: ${path}\n\nCheck the file permissions and try again.`
      : error instanceof Error ? error.message : String(error);
  console.error(`redpen: ${message}`);
  if (process.argv.includes("--verbose") && error instanceof Error && error.stack) console.error(`\n${error.stack}`);
  process.exitCode = 2;
});
