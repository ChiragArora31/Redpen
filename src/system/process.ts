import { spawn } from "node:child_process";
import type { CommandEvidence, CommandSpec } from "../core/types.js";

export const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const OUTPUT_LIMIT = 8_000;

export interface RunProcessOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

function bounded(value: string): string {
  if (value.length <= OUTPUT_LIMIT) return value.trim();
  const half = Math.floor(OUTPUT_LIMIT / 2);
  return `${value.slice(0, half).trim()}\n… output truncated by Redpen …\n${value.slice(-half).trim()}`;
}

export async function runProcess(
  spec: CommandSpec,
  cwd: string,
  options: RunProcessOptions = {},
): Promise<CommandEvidence> {
  const started = performance.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, {
      cwd,
      env: { ...process.env, CI: process.env.CI ?? "1", ...options.env },
      shell: false,
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finish = (exitCode: number | null, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        spec,
        exitCode,
        stdout: bounded(stdout),
        stderr: bounded(stderr),
        durationMs: Math.round(performance.now() - started),
        ...(error ? { error } : {}),
        ...(timedOut ? { timedOut: true, timeoutMs } : {}),
      });
    };

    const terminate = (signal: NodeJS.Signals) => {
      try {
        if (process.platform === "win32" && child.pid) {
          const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
          killer.unref();
          child.kill();
        } else if (child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { child.kill(signal); }
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      terminate("SIGTERM");
      const force = setTimeout(() => terminate("SIGKILL"), 1_000);
      force.unref();
    }, timeoutMs);
    timeout.unref();

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => finish(null, error.message));
    child.on("close", (exitCode) => finish(exitCode, timedOut ? `Timed out after ${Math.ceil(timeoutMs / 1_000)} seconds.` : undefined));
  });
}

export async function capture(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const result = await runProcess(
    { command, args, display: [command, ...args].join(" "), source: "internal" },
    cwd,
    { env: extraEnv },
  );
  return result;
}
