import type { AgentAdapter } from "./types.js";
import { codexAdapter } from "./codex/adapter.js";

export const agentRegistry: Record<string, AgentAdapter> = { codex: codexAdapter };
