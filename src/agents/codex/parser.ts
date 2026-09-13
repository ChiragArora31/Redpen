export interface CodexCompletionRecord {
  message: string;
  completedAt: string;
  turnId?: string;
}

export interface CodexSessionRecord {
  id: string;
  path: string;
  workingDirectory: string;
  startedAt: string;
  updatedAt: string;
  prompts: { text: string; timestamp: string }[];
  completions: CodexCompletionRecord[];
  historicalToolCalls: number;
  truncated: boolean;
}

function textContent(payload: Record<string, unknown>): string {
  if (!Array.isArray(payload.content)) return "";
  return payload.content
    .map((part) => part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? (part as Record<string, unknown>).text as string : "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function parseCodexSession(contents: string, path: string): CodexSessionRecord {
  const lines = contents.split(/\r?\n/);
  let lastContentIndex = lines.length - 1;
  while (lastContentIndex >= 0 && !lines[lastContentIndex]?.trim()) lastContentIndex -= 1;
  let metadata: { id: string; cwd: string; timestamp: string } | undefined;
  let updatedAt = "";
  let historicalToolCalls = 0;
  let truncated = false;
  const prompts: CodexSessionRecord["prompts"] = [];
  const finalMessages = new Map<string, CodexCompletionRecord>();
  const completedTurns = new Map<string, CodexCompletionRecord>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; } catch {
      if (index === lastContentIndex) { truncated = true; continue; }
      throw new Error(`Codex session could not be parsed at line ${index + 1}.`);
    }
    const timestamp = typeof event.timestamp === "string" ? event.timestamp : "";
    if (timestamp) updatedAt = timestamp;
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    if (event.type === "session_meta") {
      const id = typeof payload.id === "string" ? payload.id : typeof payload.session_id === "string" ? payload.session_id : "";
      if (id && typeof payload.cwd === "string") metadata = { id, cwd: payload.cwd, timestamp: typeof payload.timestamp === "string" ? payload.timestamp : timestamp };
    }
    if (event.type === "response_item" && payload.type === "message") {
      const text = textContent(payload);
      if (payload.role === "user" && text) prompts.push({ text, timestamp });
      if (payload.role === "assistant" && payload.phase === "final_answer" && text) {
        const passthrough = payload.internal_chat_message_metadata_passthrough && typeof payload.internal_chat_message_metadata_passthrough === "object"
          ? payload.internal_chat_message_metadata_passthrough as Record<string, unknown>
          : {};
        const turnId = typeof passthrough.turn_id === "string" ? passthrough.turn_id : undefined;
        finalMessages.set(turnId ?? timestamp, { message: text, completedAt: timestamp, ...(turnId ? { turnId } : {}) });
      }
    }
    if (event.type === "response_item" && ["custom_tool_call", "function_call", "local_shell_call"].includes(String(payload.type))) historicalToolCalls += 1;
    if (event.type === "event_msg" && payload.type === "task_complete" && typeof payload.last_agent_message === "string" && payload.last_agent_message.trim()) {
      const turnId = typeof payload.turn_id === "string" ? payload.turn_id : undefined;
      completedTurns.set(turnId ?? timestamp, { message: payload.last_agent_message.trim(), completedAt: timestamp, ...(turnId ? { turnId } : {}) });
    }
  }
  if (!metadata) throw new Error("Codex session is missing session metadata.");
  const completions = [...finalMessages.entries()]
    .filter(([key]) => !completedTurns.has(key))
    .map(([, value]) => value)
    .concat([...completedTurns.values()])
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
  return {
    id: metadata.id,
    path,
    workingDirectory: metadata.cwd,
    startedAt: metadata.timestamp,
    updatedAt: updatedAt || metadata.timestamp,
    prompts,
    completions,
    historicalToolCalls,
    truncated,
  };
}

export function latestCompletionAfter(record: CodexSessionRecord, startedAt: string): CodexCompletionRecord | undefined {
  const threshold = Date.parse(startedAt);
  return record.completions.filter((completion) => Date.parse(completion.completedAt) >= threshold).at(-1);
}
