import type { AgentClaim, AgentClaimType, AgentCompletion, BuiltinVerifierType, ClaimSource, DefinitionOfDoneItem, RedpenSession } from "../core/types.js";

export const VERIFIER_TYPES = new Set<BuiltinVerifierType>([
  "changes-exist", "tests-changed", "tests-pass", "build-pass", "file-changed",
  "file-exists", "content-matches", "command-succeeds", "lint-pass", "typecheck-pass", "coverage-threshold", "regression-test",
]);
const CLAIM_TYPES = new Set<AgentClaimType>(["tests-pass", "tests-changed", "build-pass", "implementation-changed", "implementation-result", "file-changed", "unknown"]);

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string.`);
  return value;
}

function timestampAt(value: unknown, path: string): string {
  const timestamp = stringAt(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${path} must be a valid timestamp.`);
  return timestamp;
}

function gitObjectAt(value: unknown, path: string): string {
  const object = stringAt(value, path);
  if (!/^[0-9a-f]{40,64}$/i.test(object)) throw new Error(`${path} must be a Git object ID.`);
  return object;
}

export function validateDefinitionItem(value: unknown, path: string): DefinitionOfDoneItem {
  const item = objectAt(value, path);
  const verifier = objectAt(item.verifier, `${path}.verifier`);
  const type = stringAt(verifier.type, `${path}.verifier.type`);
  if (!VERIFIER_TYPES.has(type as BuiltinVerifierType)) {
    throw new Error(`${path}.verifier.type has unsupported value "${type}". Supported types: ${[...VERIFIER_TYPES].join(", ")}.`);
  }
  if (verifier.config !== undefined && (!verifier.config || typeof verifier.config !== "object" || Array.isArray(verifier.config))) {
    throw new Error(`${path}.verifier.config must be an object.`);
  }
  const config = verifier.config === undefined ? undefined : objectAt(verifier.config, `${path}.verifier.config`);
  const keys: Record<string, string[]> = {
    "changes-exist": [], "tests-changed": [], "tests-pass": [], "build-pass": [],
    "lint-pass": [], "typecheck-pass": [], "file-changed": ["path", "action"],
    "file-exists": ["path"], "content-matches": ["path", "text"],
    "command-succeeds": ["command", "args"],
    "coverage-threshold": ["command", "args", "reportPath", "minimumPercent"],
    "regression-test": ["path"],
  };
  for (const key of Object.keys(config ?? {})) {
    if (!keys[type]!.includes(key)) throw new Error(`${path}.verifier.config.${key} is not supported for "${type}".`);
  }
  const needsConfig = ["file-changed", "file-exists", "content-matches", "command-succeeds", "coverage-threshold", "regression-test"].includes(type);
  if (needsConfig && !config) throw new Error(`${path}.verifier.config must be an object.`);
  if (["file-changed", "file-exists", "content-matches", "regression-test"].includes(type)) safeRelativePath(stringAt(config?.path, `${path}.verifier.config.path`), `${path}.verifier.config.path`);
  if (type === "regression-test" && !/\.(?:c|m)?js$/.test(String(config?.path))) throw new Error(`${path}.verifier.config.path must be a JavaScript node:test file (.js, .mjs or .cjs).`);
  if (type === "file-changed" && config?.action !== undefined && config.action !== "added") throw new Error(`${path}.verifier.config.action must be "added".`);
  if (type === "content-matches") stringAt(config?.text, `${path}.verifier.config.text`);
  if (["command-succeeds", "coverage-threshold"].includes(type)) {
    stringAt(config?.command, `${path}.verifier.config.command`);
    if (!Array.isArray(config?.args) || !config.args.every((arg) => typeof arg === "string")) throw new Error(`${path}.verifier.config.args must be an array of strings.`);
  }
  if (type === "coverage-threshold") {
    safeRelativePath(stringAt(config?.reportPath, `${path}.verifier.config.reportPath`), `${path}.verifier.config.reportPath`);
    if (typeof config?.minimumPercent !== "number" || !Number.isFinite(config.minimumPercent) || config.minimumPercent < 0 || config.minimumPercent > 100) {
      throw new Error(`${path}.verifier.config.minimumPercent must be between 0 and 100.`);
    }
  }
  if (item.required !== undefined && typeof item.required !== "boolean") throw new Error(`${path}.required must be a boolean.`);
  return {
    id: stringAt(item.id, `${path}.id`),
    title: stringAt(item.title, `${path}.title`),
    ...(item.description === undefined ? {} : { description: stringAt(item.description, `${path}.description`) }),
    ...(item.required === undefined ? {} : { required: item.required as boolean }),
    verifier: {
      type: type as BuiltinVerifierType,
      ...(verifier.config === undefined ? {} : { config: verifier.config as Record<string, unknown> }),
    },
  };
}

export function safeRelativePath(value: string, path: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (/^(\/|[A-Za-z]:\/)/.test(normalized) || normalized.split("/").some((part) => part === ".." || part === ".redpen") || normalized.trim() === "") {
    throw new Error(`${path} must stay inside the repository and outside .redpen/.`);
  }
  return normalized.replace(/^\.\//, "");
}

function validateClaim(value: unknown, index: number): AgentClaim {
  const path = `agentCompletion.claims[${index}]`;
  const claim = objectAt(value, path);
  const type = stringAt(claim.type, `${path}.type`);
  if (!CLAIM_TYPES.has(type as AgentClaimType)) throw new Error(`${path}.type has unsupported value "${type}".`);
  if (claim.normalized !== undefined && (!claim.normalized || typeof claim.normalized !== "object" || Array.isArray(claim.normalized))) {
    throw new Error(`${path}.normalized must be an object.`);
  }
  if (type === "file-changed") {
    const normalized = objectAt(claim.normalized, `${path}.normalized`);
    stringAt(normalized.path, `${path}.normalized.path`);
  }
  let source: ClaimSource = { type: "manual" };
  if (claim.source !== undefined) {
    const rawSource = objectAt(claim.source, `${path}.source`);
    const sourceType = stringAt(rawSource.type, `${path}.source.type`);
    if (sourceType === "manual") source = { type: "manual" };
    else if (sourceType === "agent") {
      source = {
        type: "agent",
        agentId: stringAt(rawSource.agentId, `${path}.source.agentId`),
        ...(rawSource.sessionId === undefined ? {} : { sessionId: stringAt(rawSource.sessionId, `${path}.source.sessionId`) }),
      };
    } else throw new Error(`${path}.source.type must be "manual" or "agent".`);
  }
  return {
    id: stringAt(claim.id, `${path}.id`),
    originalText: stringAt(claim.originalText, `${path}.originalText`),
    type: type as AgentClaimType,
    source,
    ...(claim.normalized === undefined ? {} : { normalized: claim.normalized as Record<string, unknown> }),
  };
}

function validateCompletion(value: unknown): AgentCompletion {
  const completion = objectAt(value, "agentCompletion");
  if (completion.schemaVersion !== 1) throw new Error("agentCompletion.schemaVersion must be 1.");
  if (!Array.isArray(completion.claims)) throw new Error("agentCompletion.claims must be an array.");
  const claims = completion.claims.map(validateClaim);
  const ids = claims.map((claim) => claim.id);
  if (new Set(ids).size !== ids.length) throw new Error("agentCompletion claim ids must be unique.");
  let agent: AgentCompletion["agent"];
  if (completion.agent !== undefined) {
    const source = objectAt(completion.agent, "agentCompletion.agent");
    agent = {
      id: source.id === undefined ? "unknown" : stringAt(source.id, "agentCompletion.agent.id"),
      name: stringAt(source.name, "agentCompletion.agent.name"),
      ...(source.sessionId === undefined ? {} : { sessionId: stringAt(source.sessionId, "agentCompletion.agent.sessionId") }),
    };
  }
  const importedAt = completion.importedAt === undefined ? undefined : timestampAt(completion.importedAt, "agentCompletion.importedAt");
  let completionSource: AgentCompletion["source"];
  if (completion.source !== undefined) {
    const rawSource = objectAt(completion.source, "agentCompletion.source");
    if (rawSource.type !== "local-session" && rawSource.type !== "file" && rawSource.type !== "hook") throw new Error("agentCompletion.source.type must be \"local-session\", \"file\" or \"hook\".");
    completionSource = { type: rawSource.type, ...(rawSource.path === undefined ? {} : { path: stringAt(rawSource.path, "agentCompletion.source.path") }) };
  }
  let metadata: AgentCompletion["metadata"];
  if (completion.metadata !== undefined) {
    const raw = objectAt(completion.metadata, "agentCompletion.metadata");
    metadata = {
      ...(raw.startedAt === undefined ? {} : { startedAt: timestampAt(raw.startedAt, "agentCompletion.metadata.startedAt") }),
      ...(raw.completedAt === undefined ? {} : { completedAt: timestampAt(raw.completedAt, "agentCompletion.metadata.completedAt") }),
      ...(raw.workingDirectory === undefined ? {} : { workingDirectory: stringAt(raw.workingDirectory, "agentCompletion.metadata.workingDirectory") }),
      ...(raw.turnId === undefined ? {} : { turnId: stringAt(raw.turnId, "agentCompletion.metadata.turnId") }),
      ...(typeof raw.historicalToolCalls === "number" ? { historicalToolCalls: raw.historicalToolCalls } : {}),
    };
  }
  return {
    schemaVersion: 1,
    ...(agent ? { agent } : {}),
    message: stringAt(completion.message, "agentCompletion.message"),
    recordedAt: timestampAt(completion.recordedAt, "agentCompletion.recordedAt"),
    ...(importedAt ? { importedAt } : {}),
    ...(completionSource ? { source: completionSource } : {}),
    ...(completion.rawMessage === undefined ? {} : { rawMessage: stringAt(completion.rawMessage, "agentCompletion.rawMessage") }),
    ...(metadata ? { metadata } : {}),
    claims,
  };
}

export function validateSession(value: unknown): RedpenSession {
  const session = objectAt(value, "session");
  if (session.schemaVersion !== 1) throw new Error("schemaVersion must be 1.");
  const task = objectAt(session.task, "task");
  const repository = objectAt(session.repository, "repository");
  if (!Array.isArray(session.definitionOfDone) || session.definitionOfDone.length === 0) {
    throw new Error("definitionOfDone must contain at least one check.");
  }
  const definitionOfDone = session.definitionOfDone.map((item, index) => validateDefinitionItem(item, `definitionOfDone[${index}]`));
  const ids = definitionOfDone.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("definitionOfDone item ids must be unique.");
  if (session.proposedCriteria !== undefined && !Array.isArray(session.proposedCriteria)) throw new Error("proposedCriteria must be an array.");
  const proposedCriteria = (session.proposedCriteria as unknown[] | undefined)?.map((item, index) => validateDefinitionItem(item, `proposedCriteria[${index}]`));
  if (proposedCriteria && new Set([...ids, ...proposedCriteria.map((item) => item.id)]).size !== ids.length + proposedCriteria.length) throw new Error("Criterion ids must be unique across the plan and proposals.");
  const baselineCommit = repository.baselineCommit;
  if (baselineCommit !== undefined) gitObjectAt(baselineCommit, "repository.baselineCommit");
  return {
    schemaVersion: 1,
    id: stringAt(session.id, "id"),
    task: { description: stringAt(task.description, "task.description") },
    startedAt: timestampAt(session.startedAt, "startedAt"),
    repository: {
      root: stringAt(repository.root, "repository.root"),
      baselineTree: gitObjectAt(repository.baselineTree, "repository.baselineTree"),
      ...(baselineCommit === undefined ? {} : { baselineCommit: baselineCommit as string }),
    },
    definitionOfDone,
    ...(proposedCriteria ? { proposedCriteria } : {}),
    ...(session.agentCompletion === undefined ? {} : { agentCompletion: validateCompletion(session.agentCompletion) }),
    ...(session.codexBinding === undefined ? {} : { codexBinding: { sessionId: stringAt(objectAt(session.codexBinding, "codexBinding").sessionId, "codexBinding.sessionId") } }),
  };
}
