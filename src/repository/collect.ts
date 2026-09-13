import type { RepositoryEvidence } from "../core/types.js";
import { discoverCommands } from "./commands.js";
import { collectChanges, collectChangesSinceTree, findRepositoryRoot } from "./git.js";
import { isTestFile } from "./test-files.js";

export async function collectRepository(cwd: string, baselineTree?: string): Promise<RepositoryEvidence> {
  const root = await findRepositoryRoot(cwd);
  const [changes, commands] = await Promise.all([
    baselineTree ? collectChangesSinceTree(root, baselineTree) : collectChanges(root),
    discoverCommands(root),
  ]);
  return {
    root,
    changes,
    testFiles: changes.filter((change) => isTestFile(change.path)),
    ...commands,
  };
}
