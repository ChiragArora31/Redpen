import type { RepositoryEvidence } from "../core/types.js";
import { discoverCommands } from "./commands.js";
import { collectChanges, collectChangesSinceTree, findRepositoryRoot } from "./git.js";
import { isTestFile } from "./test-files.js";
import { createWorktreeSnapshot } from "./git.js";
import { configuredCommand, readProjectConfig } from "../session/config.js";

export async function collectRepository(cwd: string, baselineTree?: string): Promise<RepositoryEvidence> {
  const root = await findRepositoryRoot(cwd);
  const stateTree = await createWorktreeSnapshot(root);
  const [changes, commands, config] = await Promise.all([
    baselineTree ? collectChangesSinceTree(root, baselineTree, stateTree) : collectChanges(root),
    discoverCommands(root),
    readProjectConfig(root),
  ]);
  const testCommand = (config && configuredCommand("test", config)) || commands.testCommand;
  const buildCommand = (config && configuredCommand("build", config)) || commands.buildCommand;
  const lintCommand = (config && configuredCommand("lint", config)) || commands.lintCommand;
  const typecheckCommand = (config && configuredCommand("typecheck", config)) || commands.typecheckCommand;
  return {
    root,
    stateTree,
    changes,
    testFiles: changes.filter((change) => isTestFile(change.path)),
    ...(testCommand ? { testCommand } : {}),
    ...(buildCommand ? { buildCommand } : {}),
    ...(lintCommand ? { lintCommand } : {}),
    ...(typecheckCommand ? { typecheckCommand } : {}),
  };
}
