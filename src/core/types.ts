export type VerificationStatus = "proven" | "failed" | "unverified";

export interface Evidence {
  type: "repository" | "file-change" | "command" | "metadata";
  source: string;
  summary: string;
  details?: unknown;
}

export interface VerificationResult {
  id: string;
  title: string;
  status: VerificationStatus;
  reason: string;
  evidence: Evidence[];
}

export type BuiltinVerifierType =
  | "changes-exist"
  | "tests-changed"
  | "tests-pass"
  | "build-pass"
  | "file-changed";

export type AgentClaimType =
  | "tests-pass"
  | "tests-changed"
  | "build-pass"
  | "implementation-changed"
  | "implementation-result"
  | "file-changed"
  | "unknown";

export type ClaimSource =
  | { type: "manual" }
  | { type: "agent"; agentId: string; sessionId?: string };

export interface AgentClaim {
  id: string;
  originalText: string;
  type: AgentClaimType;
  normalized?: Record<string, unknown>;
  source: ClaimSource;
}

export interface AgentCompletion {
  schemaVersion: 1;
  agent?: { id: string; name: string; sessionId?: string };
  message: string;
  recordedAt: string;
  importedAt?: string;
  source?: { type: "local-session" | "file"; path?: string };
  rawMessage?: string;
  metadata?: {
    startedAt?: string;
    completedAt?: string;
    workingDirectory?: string;
    turnId?: string;
    historicalToolCalls?: number;
  };
  claims: AgentClaim[];
}

export interface ClaimVerificationResult {
  claimId: string;
  originalText: string;
  normalizedType: AgentClaimType;
  status: VerificationStatus;
  reason: string;
  evidence: Evidence[];
}

export interface DefinitionOfDoneItem {
  id: string;
  title: string;
  description?: string;
  verifier: {
    type: BuiltinVerifierType;
    config?: Record<string, unknown>;
  };
}

export interface RedpenSession {
  schemaVersion: 1;
  id: string;
  task: { description: string };
  startedAt: string;
  repository: {
    root: string;
    baselineTree: string;
    baselineCommit?: string;
  };
  definitionOfDone: DefinitionOfDoneItem[];
  agentCompletion?: AgentCompletion;
}

export interface FileChange {
  path: string;
  status: string;
  additions: number | null;
  deletions: number | null;
  untracked: boolean;
}

export interface CommandSpec {
  command: string;
  args: string[];
  display: string;
  source: string;
}

export interface CommandEvidence {
  spec: CommandSpec;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
  timedOut?: boolean;
  timeoutMs?: number;
}

export interface RepositoryEvidence {
  root: string;
  changes: FileChange[];
  testFiles: FileChange[];
  testCommand?: CommandSpec;
  buildCommand?: CommandSpec;
}

export interface VerificationContext {
  repository: RepositoryEvidence;
  runCommand(spec: CommandSpec): Promise<CommandEvidence>;
}

export interface Verifier {
  type: BuiltinVerifierType;
  verify(context: VerificationContext, config?: Record<string, unknown>): Promise<VerificationResult>;
}

export interface RedpenReport {
  schemaVersion: 5;
  redpenVersion: string;
  timestamp: string;
  repository: {
    root: string;
  };
  summary: Record<VerificationStatus, number> & { done: boolean };
  verdict: "done" | "not_done";
  session?: {
    id: string;
    startedAt: string;
  };
  task?: {
    description: string;
  };
  definitionOfDone: DefinitionOfDoneItem[];
  definitionOfDoneResults: VerificationResult[];
  agent?: AgentCompletion["agent"];
  agentSession?: { id?: string; startedAt?: string; completedAt?: string; workingDirectory?: string };
  completion?: { importedAt: string; source?: AgentCompletion["source"]; rawMessage: string };
  agentClaims: AgentClaim[];
  agentClaimResults: ClaimVerificationResult[];
  /** Kept as a compatibility alias for definitionOfDoneResults. */
  checks: VerificationResult[];
}
