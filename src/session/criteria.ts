import type { BuiltinVerifierType, DefinitionOfDoneItem, RedpenSession } from "../core/types.js";
import { validateDefinitionItem } from "./validation.js";
import { writeSession } from "./store.js";

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "criterion";
}

export async function addCriterion(
  session: RedpenSession,
  input: { title: string; type: BuiltinVerifierType; config?: Record<string, unknown>; required?: boolean; propose?: boolean },
): Promise<DefinitionOfDoneItem> {
  const ids = new Set([...session.definitionOfDone, ...(session.proposedCriteria ?? [])].map((item) => item.id));
  const base = slug(input.title);
  let id = base;
  for (let suffix = 2; ids.has(id); suffix += 1) id = `${base}-${suffix}`;
  const item = validateDefinitionItem({
    id,
    title: input.title,
    ...(input.required === false ? { required: false } : {}),
    verifier: { type: input.type, ...(input.config ? { config: input.config } : {}) },
  }, "criterion");
  if (input.propose) session.proposedCriteria = [...(session.proposedCriteria ?? []), item];
  else session.definitionOfDone.push(item);
  await writeSession(session);
  return item;
}

export async function decideProposal(session: RedpenSession, id: string, accept: boolean): Promise<DefinitionOfDoneItem> {
  const item = session.proposedCriteria?.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`No proposed criterion has id "${id}". Run redpen status to see proposals.`);
  session.proposedCriteria = session.proposedCriteria!.filter((candidate) => candidate.id !== id);
  if (accept) session.definitionOfDone.push(item);
  await writeSession(session);
  return item;
}
