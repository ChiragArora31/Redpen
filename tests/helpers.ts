import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function git(root: string, args: string[]): Promise<string> {
  return (await exec("git", args, { cwd: root })).stdout.trim();
}

export async function put(root: string, path: string, contents: string): Promise<void> {
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

export async function createRepository(files: Record<string, string> = { "src/index.ts": "export const value = 1;\n" }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "redpen-repo-"));
  await git(root, ["init", "--quiet"]);
  await git(root, ["config", "user.name", "Redpen Test"]);
  await git(root, ["config", "user.email", "redpen@example.test"]);
  for (const [path, contents] of Object.entries(files)) await put(root, path, contents);
  await git(root, ["add", "."]);
  await git(root, ["commit", "--quiet", "-m", "initial"]);
  return root;
}

export async function removeRepository(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}
