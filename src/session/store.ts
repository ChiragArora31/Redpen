import { access, chmod, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolve } from "node:path";
import type { RedpenReport, RedpenSession } from "../core/types.js";
import { validateSession } from "./validation.js";

export const statePaths = (root: string) => ({
  directory: join(root, ".redpen"),
  session: join(root, ".redpen", "session.json"),
  report: join(root, ".redpen", "report.json"),
});

export async function sessionExists(root: string): Promise<boolean> {
  try { await access(statePaths(root).session); return true; } catch { return false; }
}

export async function readSession(root: string): Promise<RedpenSession | undefined> {
  const path = statePaths(root).session;
  let contents: string;
  try { contents = await readFile(path, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const session = validateSession(JSON.parse(contents));
    let sameRepository = resolve(session.repository.root) === resolve(root);
    try {
      const [storedRoot, requestedRoot] = await Promise.all([realpath(session.repository.root), realpath(root)]);
      sameRepository = storedRoot === requestedRoot;
    } catch { /* The lexical comparison remains authoritative when a path no longer exists. */ }
    if (!sameRepository) {
      throw new Error(`Session belongs to a different repository: ${session.repository.root}`);
    }
    return session;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid .redpen/session.json: ${reason}`);
  }
}

export async function writeSession(session: RedpenSession, clearPreviousReport = true): Promise<string> {
  const paths = statePaths(session.repository.root);
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  await chmod(paths.directory, 0o700);
  const temporary = `${paths.session}.tmp`;
  await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, paths.session);
  if (clearPreviousReport) await rm(paths.report, { force: true });
  return paths.session;
}

export async function readLastReport(root: string): Promise<RedpenReport | undefined> {
  try {
    const report = JSON.parse(await readFile(statePaths(root).report, "utf8")) as Partial<RedpenReport>;
    if (typeof report.schemaVersion !== "number" || typeof report.timestamp !== "string" || !report.summary || (report.verdict !== "done" && report.verdict !== "not_done")) {
      throw new Error("Invalid .redpen/report.json: required report fields are missing.");
    }
    return report as RedpenReport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) throw new Error("Invalid .redpen/report.json: expected valid JSON.");
    throw error;
  }
}

export async function clearSession(root: string): Promise<void> {
  const paths = statePaths(root);
  await Promise.all([rm(paths.session, { force: true }), rm(paths.report, { force: true })]);
}
