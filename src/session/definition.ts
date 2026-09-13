import type { DefinitionOfDoneItem } from "../core/types.js";
import { discoverCommands } from "../repository/commands.js";
import { listRepositoryFiles } from "../repository/git.js";
import { isTestFile } from "../repository/test-files.js";

export const genericDefinitionOfDone: DefinitionOfDoneItem[] = [
  { id: "implementation", title: "Implementation changed", verifier: { type: "changes-exist" } },
  { id: "regression-coverage", title: "Regression coverage", verifier: { type: "tests-changed" } },
  { id: "tests", title: "Tests pass", verifier: { type: "tests-pass" } },
  { id: "build", title: "Build passes", verifier: { type: "build-pass" } },
];

export async function generateDefinitionOfDone(root: string): Promise<DefinitionOfDoneItem[]> {
  const [commands, files] = await Promise.all([discoverCommands(root), listRepositoryFiles(root)]);
  const definition: DefinitionOfDoneItem[] = [genericDefinitionOfDone[0]!];
  if (files.some(isTestFile)) definition.push(genericDefinitionOfDone[1]!);
  if (commands.testCommand) definition.push(genericDefinitionOfDone[2]!);
  if (commands.buildCommand) definition.push(genericDefinitionOfDone[3]!);
  return definition;
}
