import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandSpec, DefinitionOfDoneItem } from "../core/types.js";
import { generateDefinitionOfDone } from "./definition.js";
import { validateDefinitionItem } from "./validation.js";

export interface ProjectConfig {
  schemaVersion: 1;
  commands?: Partial<Record<"test" | "build" | "lint" | "typecheck", { command: string; args: string[] }>>;
  templates?: Record<string, DefinitionOfDoneItem[]>;
  policy?: { requireAllClaims: boolean };
}

export const configPath = (root: string) => join(root, ".redpen", "config.json");

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}

export function validateProjectConfig(value: unknown): ProjectConfig {
  const input = record(value, "config");
  if (input.schemaVersion !== 1) throw new Error("schemaVersion must be 1.");
  for (const key of Object.keys(input)) if (!["schemaVersion", "commands", "templates", "policy"].includes(key)) throw new Error(`Unknown config field: ${key}.`);
  const output: ProjectConfig = { schemaVersion: 1 };
  if (input.policy !== undefined) {
    const policy = record(input.policy, "policy");
    for (const key of Object.keys(policy)) if (key !== "requireAllClaims") throw new Error(`Unknown policy field: ${key}.`);
    if (typeof policy.requireAllClaims !== "boolean") throw new Error("policy.requireAllClaims must be a boolean.");
    output.policy = { requireAllClaims: policy.requireAllClaims };
  }
  if (input.commands !== undefined) {
    const commands = record(input.commands, "commands");
    output.commands = {};
    for (const [name, raw] of Object.entries(commands)) {
      if (!["test", "build", "lint", "typecheck"].includes(name)) throw new Error(`Unknown command: ${name}.`);
      const item = record(raw, `commands.${name}`);
      if (typeof item.command !== "string" || !item.command.trim()) throw new Error(`commands.${name}.command must be a non-empty string.`);
      if (!Array.isArray(item.args) || !item.args.every((arg) => typeof arg === "string")) throw new Error(`commands.${name}.args must be an array of strings.`);
      for (const key of Object.keys(item)) if (!["command", "args"].includes(key)) throw new Error(`Unknown commands.${name} field: ${key}.`);
      output.commands[name as keyof NonNullable<ProjectConfig["commands"]>] = { command: item.command, args: item.args as string[] };
    }
  }
  if (input.templates !== undefined) {
    const templates = record(input.templates, "templates");
    output.templates = {};
    for (const [name, raw] of Object.entries(templates)) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`Invalid template name: ${name}.`);
      if (!Array.isArray(raw) || raw.length === 0) throw new Error(`templates.${name} must contain at least one item.`);
      const items = raw.map((item, index) => validateDefinitionItem(item, `templates.${name}[${index}]`));
      if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error(`templates.${name} has duplicate criterion ids.`);
      output.templates[name] = items;
    }
  }
  return output;
}

export async function readProjectConfig(root: string): Promise<ProjectConfig | undefined> {
  let contents: string;
  try { contents = await readFile(configPath(root), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try { return validateProjectConfig(JSON.parse(contents)); }
  catch (error) { throw new Error(`Invalid .redpen/config.json: ${error instanceof Error ? error.message : String(error)}`); }
}

export function configuredCommand(name: "test" | "build" | "lint" | "typecheck", config: ProjectConfig): CommandSpec | undefined {
  const entry = config.commands?.[name];
  if (!entry) return undefined;
  return {
    command: entry.command,
    args: entry.args,
    display: [entry.command, ...entry.args].join(" "),
    source: `.redpen/config.json#commands.${name}`,
  };
}

export async function initializeProjectConfig(root: string): Promise<string> {
  const path = configPath(root);
  try { await access(path); throw new Error(".redpen/config.json already exists. Edit it directly to preserve your settings."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const defaults = await generateDefinitionOfDone(root);
  const config: ProjectConfig = {
    schemaVersion: 1,
    // Do not freeze OS-specific discovered commands in a committed plan.
    // Discovery remains local; teams may add explicit argv overrides when needed.
    templates: {
      default: defaults,
      bugfix: defaults,
      feature: defaults,
      refactor: defaults.map((item) => item.id === "regression-coverage" ? { ...item, required: false } : item),
      "dependency-update": defaults.filter((item) => item.id !== "regression-coverage"),
    },
  };
  await mkdir(join(root, ".redpen"), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return path;
}
