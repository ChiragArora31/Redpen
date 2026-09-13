import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileChange } from "../core/types.js";
import { capture } from "../system/process.js";

interface StatusEntry {
  path: string;
  status: string;
  untracked: boolean;
}

interface DiffEntry {
  path: string;
  status: string;
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export function parsePorcelain(output: string): StatusEntry[] {
  const tokens = output.split("\0");
  const entries: StatusEntry[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.length < 4) continue;
    const status = token.slice(0, 2);
    const path = token.slice(3);
    if (status.includes("R") || status.includes("C")) {
      // In -z mode Git reports the destination first, followed by the source.
      index += 1;
    }
    if (path === ".redpen/report.json" || path.startsWith(".redpen/")) continue;
    entries.push({ path, status, untracked: status === "??" });
  }
  return entries;
}

export function parseNumstat(output: string): Map<string, { additions: number | null; deletions: number | null }> {
  const stats = new Map<string, { additions: number | null; deletions: number | null }>();
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const [added, deleted, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    if (!path || added === undefined || deleted === undefined) continue;
    stats.set(path, {
      additions: added === "-" ? null : Number(added),
      deletions: deleted === "-" ? null : Number(deleted),
    });
  }
  return stats;
}

export function parseNameStatus(output: string): DiffEntry[] {
  const tokens = output.split("\0");
  const entries: DiffEntry[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index];
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const destination = tokens[index + 2];
      if (destination) entries.push({ path: destination, status: status[0] ?? status });
      index += 2;
    } else {
      const path = tokens[index + 1];
      if (path) entries.push({ path, status });
      index += 1;
    }
  }
  return entries.filter((entry) => entry.path !== ".redpen" && !entry.path.startsWith(".redpen/"));
}

async function countUntrackedLines(root: string, path: string): Promise<number | null> {
  try {
    const contents = await readFile(join(root, path), "utf8");
    if (!contents) return 0;
    return contents.split(/\r?\n/).length - (contents.endsWith("\n") ? 1 : 0);
  } catch {
    return null;
  }
}

export async function findRepositoryRoot(cwd: string): Promise<string> {
  const result = await capture("git", ["rev-parse", "--show-toplevel"], cwd);
  if (result.exitCode !== 0) throw new Error("Redpen must be run inside a Git repository.\n\nChange to a repository, or initialize one with `git init`.");
  return result.stdout.trim();
}

export async function readHead(root: string): Promise<string | undefined> {
  const result = await capture("git", ["rev-parse", "--verify", "HEAD"], root);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

export async function listRepositoryFiles(root: string): Promise<string[]> {
  const result = await capture("git", ["ls-files", "-co", "--exclude-standard", "-z"], root);
  if (result.exitCode !== 0) throw new Error(result.stderr || "Could not list repository files.");
  return result.stdout.split("\0").filter((path) => path && path !== ".redpen" && !path.startsWith(".redpen/"));
}

export async function createWorktreeSnapshot(root: string): Promise<string> {
  const temporary = await mkdtemp(join(tmpdir(), "redpen-index-"));
  const indexPath = join(temporary, "index");
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    const head = await readHead(root);
    const seed = await capture("git", head ? ["read-tree", head] : ["read-tree", "--empty"], root, env);
    if (seed.exitCode !== 0) throw new Error(seed.stderr || "Could not initialize the Redpen baseline.");
    const add = await capture("git", ["add", "-A", "--", "."], root, env);
    if (add.exitCode !== 0) throw new Error(add.stderr || "Could not snapshot the working tree.");
    const redpenFiles = await capture("git", ["ls-files", "-z", "--", ".redpen"], root, env);
    const trackedStatePaths = redpenFiles.stdout.split("\0").filter(Boolean);
    if (trackedStatePaths.length > 0) {
      const removeRedpen = await capture("git", ["update-index", "--force-remove", "--", ...trackedStatePaths], root, env);
      if (removeRedpen.exitCode !== 0) throw new Error(removeRedpen.stderr || "Could not exclude Redpen state from the baseline.");
    }
    const tree = await capture("git", ["write-tree"], root, env);
    if (tree.exitCode !== 0) throw new Error(tree.stderr || "Could not write the Redpen baseline.");
    return tree.stdout.trim();
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function collectChangesSinceTree(root: string, baselineTree: string): Promise<FileChange[]> {
  const currentTree = await createWorktreeSnapshot(root);
  const [nameResult, numstatResult, statusResult] = await Promise.all([
    capture("git", ["diff", "--name-status", "-z", baselineTree, currentTree, "--"], root),
    capture("git", ["diff", "--numstat", baselineTree, currentTree, "--"], root),
    capture("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], root),
  ]);
  if (nameResult.exitCode !== 0 || numstatResult.exitCode !== 0) {
    throw new Error(nameResult.stderr || numstatResult.stderr || "Could not compare the repository to its Redpen baseline.");
  }
  const stats = parseNumstat(numstatResult.stdout);
  const untracked = new Set(parsePorcelain(statusResult.stdout).filter((entry) => entry.untracked).map((entry) => entry.path));
  return parseNameStatus(nameResult.stdout).map((entry) => ({
    ...entry,
    additions: stats.get(entry.path)?.additions ?? null,
    deletions: stats.get(entry.path)?.deletions ?? null,
    untracked: untracked.has(entry.path),
  }));
}

export async function collectChanges(root: string): Promise<FileChange[]> {
  const [statusResult, headResult] = await Promise.all([
    capture("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], root),
    capture("git", ["rev-parse", "--verify", "HEAD"], root),
  ]);
  if (statusResult.exitCode !== 0) throw new Error(statusResult.stderr || "Could not inspect Git status.");

  const base = headResult.exitCode === 0 ? "HEAD" : EMPTY_TREE;
  const diffArgs = ["diff", "--numstat", base, "--"];
  const diffResult = await capture("git", diffArgs, root);
  const stats = parseNumstat(diffResult.stdout);
  const entries = parsePorcelain(statusResult.stdout);

  return Promise.all(entries.map(async (entry) => {
    const stat = stats.get(entry.path);
    return {
      ...entry,
      additions: entry.untracked ? await countUntrackedLines(root, entry.path) : (stat?.additions ?? null),
      deletions: entry.untracked ? 0 : (stat?.deletions ?? null),
    };
  }));
}
