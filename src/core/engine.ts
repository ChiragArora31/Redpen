import type { AgentClaim, ClaimVerificationResult, DefinitionOfDoneItem, RedpenReport, RedpenSession, RepositoryEvidence, VerificationStatus, Verifier } from "./types.js";
import { runProcess } from "../system/process.js";
import { REDPEN_VERSION } from "../version.js";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { realpath } from "node:fs/promises";

function redactLocalPaths<T>(value: T, repositoryRoot: string): T {
  const repositoryAliases = [
    repositoryRoot,
    ...(repositoryRoot.startsWith("/private/") ? [repositoryRoot.slice("/private".length)] : []),
  ];
  const replacements = [
    ...repositoryAliases.map((path) => [path, "."]),
    [homedir(), "~"],
  ].filter(([path]) => path && path.length > 1).sort((left, right) => right[0]!.length - left[0]!.length);
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== "string") return item;
    return replacements.reduce((text, [path, replacement]) => text.replaceAll(path!, replacement!), item);
  })) as T;
}

export async function verifyRepository(
  repository: RepositoryEvidence,
  definitionOfDone: DefinitionOfDoneItem[],
  verifiers: Record<string, Verifier>,
  session?: RedpenSession,
  options: { timeoutMs?: number } = {},
): Promise<RedpenReport> {
  const commandRuns = new Map<string, ReturnType<typeof runProcess>>();
  const context = {
    repository,
    runCommand: (spec: Parameters<typeof runProcess>[0]) => {
      const key = JSON.stringify([spec.command, spec.args]);
      let run = commandRuns.get(key);
      if (!run) {
        run = runProcess(spec, repository.root, options);
        commandRuns.set(key, run);
      }
      return run;
    },
  };
  const definitionOfDoneResults = [];
  for (const item of definitionOfDone) {
    const verifier = verifiers[item.verifier.type];
    if (!verifier) throw new Error(`No verifier registered for "${item.verifier.type}".`);
    const result = await verifier.verify(context, item.verifier.config);
    definitionOfDoneResults.push({ ...result, id: item.id, title: item.title });
  }

  const agentClaims = session?.agentCompletion?.claims ?? [];
  const agentClaimResults: ClaimVerificationResult[] = [];
  for (const claim of agentClaims) agentClaimResults.push(await verifyClaim(claim, context, verifiers));

  const countResults = (results: Array<{ status: VerificationStatus }>) => {
    const counts: Record<VerificationStatus, number> = { proven: 0, failed: 0, unverified: 0 };
    for (const result of results) counts[result.status] += 1;
    return counts;
  };
  const definitionCounts = countResults(definitionOfDoneResults);
  const claimCounts = countResults(agentClaimResults);
  const definitionSatisfied = definitionCounts.failed === 0 && definitionCounts.unverified === 0;
  // Extra unsupported claims do not expand the task contract. Concrete contradictions still block a trustworthy DONE verdict.
  const done = definitionSatisfied && claimCounts.failed === 0;
  const summary = {
    proven: definitionCounts.proven + claimCounts.proven,
    failed: definitionCounts.failed + claimCounts.failed,
    unverified: definitionCounts.unverified + claimCounts.unverified,
    done,
  };
  let agentRanInRepository = false;
  const agentWorkingDirectory = session?.agentCompletion?.metadata?.workingDirectory;
  if (agentWorkingDirectory) {
    try {
      const [agentRoot, evidenceRoot] = await Promise.all([realpath(agentWorkingDirectory), realpath(repository.root)]);
      agentRanInRepository = agentRoot === evidenceRoot;
    } catch { agentRanInRepository = resolve(agentWorkingDirectory) === resolve(repository.root); }
  }
  const report: RedpenReport = {
    schemaVersion: 6,
    redpenVersion: REDPEN_VERSION,
    timestamp: new Date().toISOString(),
    repository: { root: "." },
    summary,
    definitionOfDoneSummary: { ...definitionCounts, satisfied: definitionSatisfied },
    agentClaimSummary: claimCounts,
    verdict: done ? "done" : "not_done",
    ...(session ? { session: { id: session.id, startedAt: session.startedAt }, task: session.task } : {}),
    definitionOfDone,
    definitionOfDoneResults,
    ...(session?.agentCompletion?.agent ? { agent: session.agentCompletion.agent } : {}),
    ...(session?.agentCompletion?.metadata ? {
      agentSession: {
        ...(session.agentCompletion.agent?.sessionId ? { id: session.agentCompletion.agent.sessionId } : {}),
        ...(session.agentCompletion.metadata.startedAt ? { startedAt: session.agentCompletion.metadata.startedAt } : {}),
        ...(session.agentCompletion.metadata.completedAt ? { completedAt: session.agentCompletion.metadata.completedAt } : {}),
        ...(agentRanInRepository ? { workingDirectory: "." } : {}),
      },
    } : {}),
    ...(session?.agentCompletion?.importedAt && session.agentCompletion.rawMessage ? {
      completion: {
        importedAt: session.agentCompletion.importedAt,
        ...(session.agentCompletion.source ? { source: { type: session.agentCompletion.source.type } } : {}),
        rawMessage: session.agentCompletion.rawMessage,
      },
    } : {}),
    agentClaims,
    agentClaimResults,
    checks: definitionOfDoneResults,
  };
  return redactLocalPaths(report, repository.root);
}

async function verifyClaim(
  claim: AgentClaim,
  context: Parameters<Verifier["verify"]>[0],
  verifiers: Record<string, Verifier>,
): Promise<ClaimVerificationResult> {
  const mapping = claim.type === "implementation-changed"
    ? { type: "changes-exist", config: undefined }
    : claim.type === "tests-changed"
      ? { type: "tests-changed", config: { absenceIsFailure: true } }
      : claim.type === "file-changed"
        ? { type: "file-changed", config: claim.normalized }
        : ["tests-pass", "build-pass"].includes(claim.type)
          ? { type: claim.type, config: undefined }
          : undefined;
  if (!mapping) {
    return {
      claimId: claim.id,
      originalText: claim.originalText,
      normalizedType: claim.type,
      status: "unverified",
      reason: claim.type === "implementation-result"
        ? "No deterministic evidence can prove this behavior. Redpen doesn't guess."
        : "No deterministic evidence is available. Redpen doesn't guess.",
      evidence: [],
    };
  }
  const verifier = verifiers[mapping.type];
  if (!verifier) {
    return { claimId: claim.id, originalText: claim.originalText, normalizedType: claim.type, status: "unverified", reason: `No verifier is registered for ${mapping.type}.`, evidence: [] };
  }
  const result = await verifier.verify(context, mapping.config);
  return {
    claimId: claim.id,
    originalText: claim.originalText,
    normalizedType: claim.type,
    status: result.status,
    reason: result.reason,
    evidence: result.evidence,
  };
}
