import { randomUUID } from "node:crypto";
import type { RedpenSession } from "../core/types.js";
import { findRepositoryRoot, createWorktreeSnapshot, readHead } from "../repository/git.js";
import { generateDefinitionOfDone } from "./definition.js";
import { sessionExists, writeSession } from "./store.js";
import { readProjectConfig } from "./config.js";

export async function startSession(cwd: string, taskDescription: string, replace = false, template = "default"): Promise<RedpenSession> {
  const task = taskDescription.trim();
  if (!task) throw new Error("Task description must not be empty.");
  const root = await findRepositoryRoot(cwd);
  if (await sessionExists(root) && !replace) {
    throw new Error("An active Redpen task already exists. Run `redpen reset` first, or use `redpen start --force \"<task>\"` to replace it.");
  }
  const [baselineTree, baselineCommit, generated, config] = await Promise.all([
    createWorktreeSnapshot(root),
    readHead(root),
    generateDefinitionOfDone(root),
    readProjectConfig(root),
  ]);
  const configured = config?.templates?.[template];
  if (!configured && template !== "default" && !["bugfix", "feature", "refactor", "dependency-update"].includes(template)) {
    throw new Error(`Unknown task template: ${template}. Run redpen init to create editable templates.`);
  }
  const definitionOfDone = configured ?? (template === "refactor"
    ? generated.map((item) => item.id === "regression-coverage" ? { ...item, required: false } : item)
    : template === "dependency-update" ? generated.filter((item) => item.id !== "regression-coverage") : generated);
  const session: RedpenSession = {
    schemaVersion: 1,
    id: randomUUID(),
    task: { description: task },
    startedAt: new Date().toISOString(),
    repository: { root, baselineTree, ...(baselineCommit ? { baselineCommit } : {}) },
    definitionOfDone,
  };
  await writeSession(session);
  return session;
}
