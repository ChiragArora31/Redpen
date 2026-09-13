import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandSpec } from "../core/types.js";

type Scripts = Record<string, string>;

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function nodeScripts(root: string): Promise<Scripts | undefined> {
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { scripts?: Scripts };
    return pkg.scripts;
  } catch {
    return undefined;
  }
}

async function packageRunner(root: string): Promise<{ command: string; runArgs: string[] }> {
  if (await exists(join(root, "pnpm-lock.yaml"))) return { command: "pnpm", runArgs: [] };
  if (await exists(join(root, "yarn.lock"))) return { command: "yarn", runArgs: [] };
  return { command: "npm", runArgs: ["run"] };
}

function scriptCommand(name: string, runner: { command: string; runArgs: string[] }): CommandSpec {
  const args = [...runner.runArgs, name];
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", `${runner.command}.cmd`, ...args],
      display: [runner.command, ...args].join(" "),
      source: `package.json#scripts.${name}`,
    };
  }
  return { command: runner.command, args, display: [runner.command, ...args].join(" "), source: `package.json#scripts.${name}` };
}

export async function discoverCommands(root: string): Promise<{ testCommand?: CommandSpec; buildCommand?: CommandSpec }> {
  const scripts = await nodeScripts(root);
  if (scripts) {
    const runner = await packageRunner(root);
    const testScript = scripts.test;
    const placeholder = testScript?.includes("Error: no test specified");
    return {
      ...(testScript && !placeholder ? { testCommand: scriptCommand("test", runner) } : {}),
      ...(scripts.build ? { buildCommand: scriptCommand("build", runner) } : {}),
    };
  }

  const pythonMarkers = ["pyproject.toml", "pytest.ini", "setup.cfg", "tox.ini"];
  if ((await Promise.all(pythonMarkers.map((name) => exists(join(root, name))))).some(Boolean)) {
    return {
      testCommand: {
        command: process.platform === "win32" ? "python" : "python3",
        args: ["-m", "pytest"],
        display: "python -m pytest",
        source: "Python project metadata",
      },
    };
  }
  return {};
}
