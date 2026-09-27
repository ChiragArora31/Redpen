import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { Verifier } from "../core/types.js";

async function repositoryFile(root: string, path: string): Promise<{ resolved: string; exists: boolean; regular: boolean }> {
  const candidate = resolve(root, path);
  const boundary = relative(root, candidate);
  if (boundary === ".." || boundary.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(boundary)) {
    throw new Error(`File criterion escapes the repository: ${path}`);
  }
  try {
    const resolved = await realpath(candidate);
    const realBoundary = relative(await realpath(root), resolved);
    if (realBoundary === ".." || realBoundary.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(realBoundary)) {
      throw new Error(`File criterion follows a link outside the repository: ${path}`);
    }
    return { resolved, exists: true, regular: (await stat(resolved)).isFile() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { resolved: candidate, exists: false, regular: false };
    throw error;
  }
}

export const fileExistsVerifier: Verifier = {
  type: "file-exists",
  async verify({ repository }, config) {
    const path = String(config?.path ?? "");
    const file = await repositoryFile(repository.root, path);
    if (!file.exists || !file.regular) return { id: this.type, title: "File exists", status: "failed", reason: `${path} is not a regular file.`, evidence: [] };
    return { id: this.type, title: "File exists", status: "proven", reason: `${path} exists.`, evidence: [{ type: "file-change", source: path, summary: `${path} is a regular file.` }] };
  },
};

export const contentMatchesVerifier: Verifier = {
  type: "content-matches",
  async verify({ repository }, config) {
    const path = String(config?.path ?? "");
    const expected = String(config?.text ?? "");
    const file = await repositoryFile(repository.root, path);
    if (!file.exists || !file.regular) return { id: this.type, title: "Content matches", status: "failed", reason: `${path} is not a regular file.`, evidence: [] };
    const contents = await readFile(file.resolved, "utf8");
    if (!contents.includes(expected)) return { id: this.type, title: "Content matches", status: "failed", reason: `${path} does not contain the required text.`, evidence: [{ type: "metadata", source: path, summary: `Searched ${path} for configured literal text.` }] };
    return { id: this.type, title: "Content matches", status: "proven", reason: `${path} contains the required text.`, evidence: [{ type: "metadata", source: path, summary: `Found configured literal text in ${path}.` }] };
  },
};

export { repositoryFile };
