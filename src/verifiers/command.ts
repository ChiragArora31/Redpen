import type { CommandEvidence, CommandSpec, VerificationResult, Verifier } from "../core/types.js";

function commandEvidence(result: CommandEvidence) {
  return {
    type: "command" as const,
    source: result.spec.source,
    summary: `${result.spec.display} → ${result.timedOut ? "timed out" : result.exitCode === null ? "could not start" : `exit ${result.exitCode}`} in ${result.durationMs}ms`,
    details: result,
  };
}

export function createCommandVerifier(options: {
  type: "tests-pass" | "build-pass";
  title: string;
  select: (repository: Parameters<Verifier["verify"]>[0]["repository"]) => CommandSpec | undefined;
  missingReason: string;
}): Verifier {
  return {
    type: options.type,
    async verify(context): Promise<VerificationResult> {
      const spec = options.select(context.repository);
      if (!spec) return { id: options.type, title: options.title, status: "unverified", reason: options.missingReason, evidence: [] };
      const result = await context.runCommand(spec);
      if (result.exitCode === 0) {
        return { id: options.type, title: options.title, status: "proven", reason: `${spec.display} · exit 0`, evidence: [commandEvidence(result)] };
      }
      return {
        id: options.type,
        title: options.title,
        status: "failed",
        reason: result.timedOut
          ? `${spec.display} timed out after ${Math.ceil((result.timeoutMs ?? 0) / 1_000)} seconds.`
          : result.exitCode === null ? `${spec.display} could not run: ${result.error ?? "unknown error"}` : `${spec.display} · exit ${result.exitCode}`,
        evidence: [commandEvidence(result)],
      };
    },
  };
}

export const testsPassVerifier = createCommandVerifier({
  type: "tests-pass",
  title: "Tests pass",
  select: (repository) => repository.testCommand,
  missingReason: "No test command could be confidently discovered.",
});

export const buildPassVerifier = createCommandVerifier({
  type: "build-pass",
  title: "Build passes",
  select: (repository) => repository.buildCommand,
  missingReason: "No build command could be confidently discovered.",
});
