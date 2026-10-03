#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this through npm run smoke:package.");
const temporary = await mkdtemp(join(tmpdir(), "redpen-package-smoke-"));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repository, encoding: "utf8", timeout: 60_000, maxBuffer: 2_000_000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.error ?? result.stderr}`);
  return result.stdout;
}
try {
  const [pack] = JSON.parse(run(process.execPath, [npm, "pack", "--json", "--ignore-scripts", "--pack-destination", temporary]));
  assert.ok(pack.files.every(({ path }) => !path.startsWith(".redpen/") && !path.startsWith("tests/") && !path.startsWith("node_modules/")));
  const prefix = join(temporary, "prefix with spaces");
  run(process.execPath, [npm, "install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, pack.filename)]);
  const packageRoot = process.platform === "win32" ? join(prefix, "node_modules", "redpen-cli") : join(prefix, "lib", "node_modules", "redpen-cli");
  const cli = join(packageRoot, "dist", "cli.js");
  assert.equal(run(process.execPath, [cli, "--version"]).trim(), pack.version);
  assert.match(run(process.execPath, [cli, "--help"]), /redpen import codex/);
  if (process.platform !== "win32") assert.equal(run(join(prefix, "bin", "redpen"), ["--version"]).trim(), pack.version);
  for (const path of ["plugin.json", "hooks/hooks.json", "hooks/codex-stop.mjs", "skills/redpen/SKILL.md", ".agents/plugins/marketplace.json"]) assert.ok((await readFile(join(packageRoot, path))).length);
  if (process.argv.includes("--codex")) {
    const state = join(temporary, "isolated-codex-home");
    await mkdir(state);
    const options = { env: { ...process.env, CODEX_HOME: state } };
    run("codex", ["plugin", "marketplace", "add", packageRoot, "--json"], options);
    const installed = JSON.parse(run("codex", ["plugin", "add", "redpen@redpen-beta", "--json"], options));
    assert.equal(installed.version, pack.version);
    assert.ok((await readFile(join(installed.installedPath, "dist", "cli.js"))).length);
    const listed = JSON.parse(run("codex", ["plugin", "list", "--marketplace", "redpen-beta", "--json"], options));
    assert.equal(listed.installed[0].enabled, true);
    console.log("Codex installed and listed the packed plugin in an isolated profile.");
  }
  console.log(`Packed redpen-cli@${pack.version}: ${pack.entryCount} files, ${pack.size} bytes. Global executable and plugin runtime passed.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
