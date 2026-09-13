import { randomUUID } from "node:crypto";
import type { RedpenSession } from "../core/types.js";
import { findRepositoryRoot, createWorktreeSnapshot, readHead } from "../repository/git.js";
import { generateDefinitionOfDone } from "./definition.js";
import { sessionExists, writeSession } from "./store.js";

export async function startSession(cwd: string, taskDescription: string, replace = false): Promise<RedpenSession> {
  const task = taskDescription.trim();
  if (!task) throw new Error("Task description must not be empty.");
  const root = await findRepositoryRoot(cwd);
  if (await sessionExists(root) && !replace) {
    throw new Error("An active Redpen task already exists. Run `redpen reset` first, or use `redpen start --force \"<task>\"` to replace it.");
  }
  const [baselineTree, baselineCommit, definitionOfDone] = await Promise.all([
    createWorktreeSnapshot(root),
    readHead(root),
    generateDefinitionOfDone(root),
  ]);
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
