import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveCodexHome(environment: NodeJS.ProcessEnv = process.env, override?: string): string {
  return override ?? environment.CODEX_HOME ?? join(homedir(), ".codex");
}

export async function codexSessionRoot(codexHome: string): Promise<string | undefined> {
  const root = join(codexHome, "sessions");
  try { await access(root); return root; } catch { return undefined; }
}

export async function listJsonlFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path);
    }
  }
  await visit(root);
  return files;
}
