import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RedpenReport } from "../core/types.js";

export async function writeJsonReport(report: RedpenReport, repositoryRoot: string): Promise<string> {
  const directory = join(repositoryRoot, ".redpen");
  const path = join(directory, "report.json");
  const temporary = `${path}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await chmod(join(directory, "session.json"), 0o600).catch(() => undefined);
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  return path;
}
