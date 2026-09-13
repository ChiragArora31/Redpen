export interface AgentDetectionResult {
  detected: boolean;
  detail: string;
}

export interface AgentSessionCandidate {
  id: string;
  path: string;
  workingDirectory: string;
  startedAt: string;
  completedAt: string;
  prompt?: string;
}

export interface AgentImportContext {
  repositoryRoot: string;
  taskDescription: string;
  redpenStartedAt: string;
  sessionId?: string;
  filePath?: string;
  environment?: NodeJS.ProcessEnv;
  codexHome?: string;
}

export interface ImportedAgentCompletion {
  agent: { id: string; name: string; sessionId?: string };
  source: { type: "local-session" | "file"; path?: string };
  rawMessage: string;
  metadata: {
    startedAt?: string;
    completedAt?: string;
    workingDirectory?: string;
    turnId?: string;
    historicalToolCalls?: number;
  };
}

export interface AgentAdapter {
  id: string;
  displayName: string;
  detect(context?: Pick<AgentImportContext, "codexHome" | "environment">): Promise<AgentDetectionResult>;
  findCandidates(context: AgentImportContext): Promise<AgentSessionCandidate[]>;
  importCompletion(context: AgentImportContext): Promise<ImportedAgentCompletion>;
}
