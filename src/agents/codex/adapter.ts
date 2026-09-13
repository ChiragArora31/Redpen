import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentAdapter, AgentImportContext, AgentSessionCandidate, ImportedAgentCompletion } from "../types.js";
import { codexSessionRoot, listJsonlFiles, resolveCodexHome } from "./detect.js";
import { latestCompletionAfter, parseCodexSession, type CodexSessionRecord } from "./parser.js";

interface CandidateInternal { record: CodexSessionRecord; completion: NonNullable<ReturnType<typeof latestCompletionAfter>> }
const MAX_SESSION_BYTES = 25 * 1024 * 1024;

function sameDirectory(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}

function publicCandidate(candidate: CandidateInternal): AgentSessionCandidate {
  const prompt = candidate.record.prompts.filter((item) => Date.parse(item.timestamp) <= Date.parse(candidate.completion.completedAt)).at(-1)?.text;
  return {
    id: candidate.record.id,
    path: candidate.record.path,
    workingDirectory: candidate.record.workingDirectory,
    startedAt: candidate.record.startedAt,
    completedAt: candidate.completion.completedAt,
    ...(prompt ? { prompt } : {}),
  };
}

async function readRecord(path: string): Promise<CodexSessionRecord> {
  const info = await stat(path);
  if (info.size > MAX_SESSION_BYTES) throw new Error("Codex session is too large to import safely (limit: 25 MB).");
  return parseCodexSession(await readFile(path, "utf8"), path);
}

async function matchingRecords(context: AgentImportContext): Promise<CandidateInternal[]> {
  if (context.filePath) {
    const path = resolve(context.filePath);
    const record = await readRecord(path);
    const completion = latestCompletionAfter(record, context.redpenStartedAt) ?? record.completions.at(-1);
    if (!completion) throw new Error("Codex session contains no assistant completion.");
    return [{ record, completion }];
  }
  const home = resolveCodexHome(context.environment, context.codexHome);
  const root = await codexSessionRoot(home);
  if (!root) throw new Error("Codex installation not detected.");
  const files = await listJsonlFiles(root);
  const started = Date.parse(context.redpenStartedAt);
  const requestedId = context.sessionId ?? context.environment?.CODEX_THREAD_ID ?? context.environment?.CODEX_SESSION_ID;
  if (requestedId) {
    const namedFiles = files.filter((path) => path.includes(requestedId));
    for (const path of namedFiles) {
      const record = await readRecord(path);
      if (record.id !== requestedId) continue;
      const completion = latestCompletionAfter(record, context.redpenStartedAt);
      if (!completion) throw new Error(`Codex session ${requestedId} has no completed response after this Redpen task started.`);
      return [{ record, completion }];
    }
    if (context.sessionId) throw new Error(`Codex session ${requestedId} was not found.`);
  }
  const recent: string[] = [];
  for (const path of files) {
    try {
      if ((requestedId && path.includes(requestedId)) || (await stat(path)).mtimeMs >= started - 60_000) recent.push(path);
    } catch { /* File disappeared during discovery. */ }
  }
  const parsed: CodexSessionRecord[] = [];
  for (const path of recent) {
    try { parsed.push(await readRecord(path)); } catch { /* A malformed unrelated session is not a candidate. */ }
  }
  if (requestedId) {
    const exact = parsed.find((record) => record.id === requestedId);
    if (exact) {
      const completion = latestCompletionAfter(exact, context.redpenStartedAt);
      if (!completion) throw new Error(`Codex session ${requestedId} has no completed response after this Redpen task started.`);
      return [{ record: exact, completion }];
    }
    if (context.sessionId) throw new Error(`Codex session ${requestedId} was not found.`);
  }
  const matches = parsed.flatMap((record) => {
    if (!sameDirectory(record.workingDirectory, context.repositoryRoot)) return [];
    const completion = latestCompletionAfter(record, context.redpenStartedAt);
    return completion ? [{ record, completion }] : [];
  });
  if (matches.length <= 1) return matches;
  const taskMatches = matches.filter(({ record }) => record.prompts.some((prompt) => prompt.text.toLowerCase().includes(context.taskDescription.toLowerCase())));
  return taskMatches.length === 1 ? taskMatches : matches;
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  displayName: "Codex",
  async detect(context = {}) {
    const home = resolveCodexHome(context.environment, context.codexHome);
    const root = await codexSessionRoot(home);
    return root ? { detected: true, detail: `Codex sessions found at ${root}.` } : { detected: false, detail: "Codex installation not detected." };
  },
  async findCandidates(context) {
    return (await matchingRecords(context)).map(publicCandidate);
  },
  async importCompletion(context): Promise<ImportedAgentCompletion> {
    const matches = await matchingRecords(context);
    if (matches.length === 0) throw new Error("No Codex session found for this Redpen task.\n\nImport one explicitly with `redpen import codex --session <id>` or `redpen import codex --file <path>`." );
    if (matches.length > 1) {
      const choices = matches.map((candidate, index) => {
        const item = publicCandidate(candidate);
        const prompt = item.prompt?.replace(/\s+/g, " ").slice(0, 100) ?? "No prompt available";
        return `${index + 1}. ${item.id}  ${item.completedAt}\n   ${item.workingDirectory}\n   ${JSON.stringify(prompt)}`;
      }).join("\n\n");
      throw new Error(`Multiple matching Codex sessions found.\n\n${choices}\n\nChoose one with \`redpen import codex --session <id>\`.`);
    }
    const selected = matches[0]!;
    const completion = selected.completion;
    return {
      agent: { id: "codex", name: "Codex", sessionId: selected.record.id },
      source: { type: context.filePath ? "file" : "local-session", path: selected.record.path },
      rawMessage: completion.message,
      metadata: {
        startedAt: selected.record.startedAt,
        completedAt: completion.completedAt,
        workingDirectory: selected.record.workingDirectory,
        ...(completion.turnId ? { turnId: completion.turnId } : {}),
        historicalToolCalls: selected.record.historicalToolCalls,
      },
    };
  },
};
