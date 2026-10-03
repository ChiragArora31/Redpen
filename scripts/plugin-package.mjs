#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const assertPath = (path) => assert(/^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith("/") && !path.split("/").some((p) => p === ".." || p === ""), `Unsafe package path: ${path}`);

async function regularFile(path) {
  assert((await lstat(path)).isFile(), `Not a regular file: ${path}`);
  return readFile(path);
}

async function outputDirectory(path) {
  try { assert((await lstat(path)).isDirectory(), `Unsafe output directory: ${path}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; await mkdir(path); }
}

async function outputFile(path, data) {
  try {
    const stat = await lstat(path);
    assert(stat.isFile() && stat.nlink === 1, `Unsafe output file: ${path}`);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(path, data);
}

async function tree(root, prefix = "") {
  assert((await lstat(root)).isDirectory(), `Not a regular directory: ${root}`);
  const files = new Map();
  for (const name of (await readdir(root)).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    assertPath(relative);
    const path = join(root, name);
    const stat = await lstat(path);
    assert(!stat.isSymbolicLink(), `Symlinks cannot ship: ${relative}`);
    if (stat.isDirectory()) for (const [key, value] of await tree(path, relative)) files.set(key, value);
    else files.set(relative, await regularFile(path));
  }
  return files;
}

/** Construct a separate public artifact. Never mutate the hook-enabled source. */
export async function collectPublicPackage(root = repository) {
  const pkg = JSON.parse(await regularFile(join(root, "package.json")));
  const manifest = JSON.parse(await regularFile(join(root, "plugin.json")));
  assert.equal(manifest.version, pkg.version, "Plugin and CLI versions differ");
  const openai = manifest.extensions["com.openai"];
  delete openai.hooks;
  openai.interface.longDescription = "Define acceptance criteria before editing a coding task, record a completion summary, independently run project checks, and return an evidence receipt. Requires a shell-capable environment, the Git repository, Node.js 18+, and Git. No background hooks, hosted service, or general correctness judging.";
  openai.publication = { release_notes: "Initial hook-free public coding-workflow package with bundled verification runtime, task contracts, evidence receipts, and explicit execution prerequisites." };
  const files = new Map([
    ["plugin.json", json(manifest)],
    ["package.json", json({ name: "redpen-plugin-runtime", version: pkg.version, private: true, type: "module", engines: pkg.engines, license: "MIT" })],
    ["README.md", await regularFile(join(root, "docs/public-plugin.md"))],
  ]);
  for (const path of ["LICENSE", "PRIVACY.md", "SECURITY.md", "SUPPORT.md"]) files.set(path, await regularFile(join(root, path)));
  for (const directory of ["skills", "assets"]) for (const [path, data] of await tree(join(root, directory), directory)) files.set(path, data);
  for (const [path, data] of await tree(join(root, "dist"), "dist")) {
    if (!path.endsWith(".js") || path === "dist/agents/codex/hook.js") continue;
    // Source maps aren't required to execute, and needlessly expose source paths.
    files.set(path, Buffer.from(data.toString("utf8").replace(/^\/\/# sourceMappingURL=.*\r?\n?/gm, "")));
  }
  validatePublicPackage(files);
  return files;
}

/** Local preflight only. OpenAI's dashboard remains the authoritative validator. */
export function validatePublicPackage(files) {
  for (const [path, contents] of files) {
    assertPath(path);
    assert(/^(plugin\.json|package\.json|README\.md|LICENSE|PRIVACY\.md|SECURITY\.md|SUPPORT\.md|assets\/[\w-]+\.svg|skills\/redpen\/(SKILL\.md|agents\/openai\.yaml)|dist\/[\w/.-]+\.js)$/.test(path), `Unexpected public package file: ${path}`);
    assert(!path.includes("hook") && !path.endsWith(".map"), `Hook or source map in public package: ${path}`);
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(contents.toString("utf8")), `Credential-shaped content in ${path}`);
  }
  const manifest = JSON.parse(files.get("plugin.json")?.toString() ?? "null");
  assert(manifest?.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name) && manifest.name.length <= 64);
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version), "Use an explicit release version");
  const extension = manifest.extensions?.["com.openai"];
  assert(extension && !extension.hooks && !extension.apps && !manifest.hooks && !manifest.apps && !manifest.mcpServers, "Public submission must be skills-only and hook-free");
  const ui = extension.interface;
  for (const [key, limit] of [["displayName", 50], ["shortDescription", 30], ["longDescription", 4000], ["developerName", 80]]) assert(typeof ui?.[key] === "string" && ui[key].trim() && ui[key].length <= limit, `Invalid ${key}`);
  assert(ui.category === "Productivity" && !ui.screenshots, "Skills-only package cannot declare screenshots");
  for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    const url = new URL(ui[key]);
    assert(url.protocol === "https:" && !url.username && !url.password && ui[key].length <= 1024, `Invalid ${key}`);
  }
  assert(Array.isArray(ui.defaultPrompt) && ui.defaultPrompt.length >= 1 && ui.defaultPrompt.length <= 3);
  for (const prompt of ui.defaultPrompt) assert(typeof prompt === "string" && prompt.trim() && prompt.length <= 128 && !prompt.includes("@"));
  for (const key of ["logo", "logoDark", "composerIcon", "composerIconDark"]) {
    assert(typeof ui[key] === "string" && ui[key].startsWith("./assets/"), `Invalid ${key} path`);
    const image = files.get(ui[key].slice(2));
    assert(image && image.length <= 5 * 1024 * 1024, `Missing or oversized ${key}`);
    const svg = image.toString();
    const size = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    assert(size && size[1] === size[2] && Number(size[1]) >= 48, `${key} must be square and at least 48px`);
    assert(!/<script|<foreignObject|\bon\w+=|(?:href|src)=/i.test(svg), `Active or external SVG content: ${key}`);
  }
  const skill = files.get("skills/redpen/SKILL.md")?.toString();
  assert(skill?.startsWith("---\nname: redpen\ndescription:"), "Valid skill frontmatter is required");
  assert(files.has("skills/redpen/agents/openai.yaml"));
  for (const path of ["dist/cli.js", "dist/version.js", "LICENSE", "PRIVACY.md", "SUPPORT.md"]) assert(files.has(path), `Missing runtime or policy file: ${path}`);
  assert(files.get("dist/version.js").toString().includes(`"${manifest.version}"`), "Built runtime is stale; rebuild before packaging");
  assert.equal(JSON.parse(files.get("package.json").toString()).type, "module");
  for (const [path, data] of files) if (path.endsWith(".js")) {
    for (const match of data.toString().matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g)) {
      const dependency = join(dirname(path), match[1]).replaceAll("\\", "/");
      assert(files.has(dependency), `Missing runtime dependency ${dependency} (from ${path})`);
    }
  }
  return manifest;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Small deterministic ZIP writer: fixed timestamps, UTF-8 paths, no system ZIP dependency. */
export function archivePackage(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [path, data] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    assertPath(path);
    const name = Buffer.from(path), compressed = deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); header.copy(entry, 6, 4, 30);
    entry.writeUInt32LE(offset, 42); central.push(entry, name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export async function buildPublicPackage(root = repository) {
  const files = await collectPublicPackage(root), manifest = validatePublicPackage(files);
  const artifacts = join(root, "artifacts"), marketplace = join(artifacts, "public"), plugin = join(marketplace, "redpen");
  // Never follow a previously created output symlink when copying runtime files.
  for (const dir of [artifacts, marketplace, plugin]) {
    await outputDirectory(dir);
  }
  for (const [path, data] of files) {
    const target = join(plugin, path);
    const parents = path.split("/").slice(0, -1);
    let parent = plugin;
    for (const segment of parents) {
      parent = join(parent, segment);
      await outputDirectory(parent);
    }
    await outputFile(target, data);
  }
  const actual = await tree(plugin);
  validatePublicPackage(actual);
  assert.equal(actual.size, files.size, "Old output files remain; use a fresh artifacts/public directory");
  const zip = archivePackage(files), filename = `redpen-plugin-${manifest.version}.zip`;
  await outputFile(join(artifacts, filename), zip);
  await outputFile(join(artifacts, `${filename}.sha256`), `${hash(zip)}  ${filename}\n`);
  await outputFile(join(artifacts, "plugin-inventory.json"), json({ version: manifest.version, archive: filename, sha256: hash(zip), files: [...files].map(([path, data]) => ({ path, bytes: data.length, sha256: hash(data) })) }));
  await outputDirectory(join(marketplace, ".agents"));
  await outputDirectory(join(marketplace, ".agents", "plugins"));
  await outputFile(join(marketplace, ".agents", "plugins", "marketplace.json"), json({ name: "redpen-public", interface: { displayName: "Redpen public candidate" }, plugins: [{ name: "redpen", source: { source: "local", path: "./redpen" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }] }));
  return { zip: join(artifacts, filename), plugin, version: manifest.version, files: files.size, sha256: hash(zip) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--validate")) {
      const manifest = validatePublicPackage(await tree(join(repository, "artifacts/public/redpen")));
      console.log(`Public package ${manifest.name}@${manifest.version}: local preflight passed. Portal scans and approval are still required.`);
    } else console.log(JSON.stringify(await buildPublicPackage(), null, 2));
  } catch (error) { console.error(`Plugin packaging failed: ${error.message}`); process.exitCode = 1; }
}
