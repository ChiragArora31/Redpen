import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm, cp, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { collectPublicPackage, validatePublicPackage, archivePackage, buildPublicPackage } from '../scripts/plugin-package.mjs';

test('builder refuses symlink and hardlinked output instead of overwriting other files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redpen-builder-'));
  try {
    await mkdir(join(root,'docs'));
    for (const path of ['package.json','plugin.json','docs/public-plugin.md','LICENSE','PRIVACY.md','SECURITY.md','SUPPORT.md','skills','assets','dist']) {
      await cp(new URL(`../${path}`, import.meta.url), join(root,path), {recursive:true});
    }
    const victim = join(root,'victim'); await writeFile(victim,'preserve');
    await mkdir(join(root,'artifacts'));
    const manifest = JSON.parse(await readFile(join(root,'package.json')));
    const output = join(root,'artifacts',`redpen-plugin-${manifest.version}.zip`);
    await symlink(victim,output);
    await assert.rejects(buildPublicPackage(root), /Unsafe output file/);
    assert.equal(await readFile(victim,'utf8'),'preserve');
    await rm(output);
    await link(victim,output);
    await assert.rejects(buildPublicPackage(root), /Unsafe output file/);
    assert.equal(await readFile(victim,'utf8'),'preserve');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('public package is hook-free, complete, deterministic, and leaves beta intact', async () => {
  const files = await collectPublicPackage();
  const manifest = validatePublicPackage(files);
  assert.equal(manifest.extensions['com.openai'].hooks, undefined);
  assert(JSON.parse(await readFile(new URL('../plugin.json', import.meta.url))).extensions['com.openai'].hooks);
  assert(![...files.keys()].some(p => /hook|\.map$|session\.json|node_modules/.test(p)));
  assert.deepEqual(archivePackage(files), archivePackage(new Map([...files].reverse())));
  const bad = new Map(files);
  bad.delete('dist/cli.js');
  assert.throws(() => validatePublicPackage(bad), /Missing runtime/);
  bad.set('../secret', Buffer.from('secret'));
  assert.throws(() => validatePublicPackage(bad), /Unsafe package path/);
});

test('public preflight rejects invalid metadata, active icons, credentials, and missing imports', async () => {
  const files = await collectPublicPackage();
  const mutate = (action) => { const copy = new Map(files); action(copy); return copy; };
  assert.throws(() => validatePublicPackage(mutate(f => {
    const m = JSON.parse(f.get('plugin.json')); m.extensions['com.openai'].interface.shortDescription = 'x'.repeat(31);
    f.set('plugin.json', Buffer.from(JSON.stringify(m)));
  })), /shortDescription/);
  assert.throws(() => validatePublicPackage(mutate(f => f.set('assets/logo.svg', Buffer.from('<svg viewBox="0 0 128 128"><script/></svg>')))), /Active/);
  assert.throws(() => validatePublicPackage(mutate(f => f.set('README.md', Buffer.from('-----BEGIN PRIVATE KEY-----')))), /Credential/);
  assert.throws(() => validatePublicPackage(mutate(f => f.set('dist/cli.js', Buffer.from('import "./missing.js";')))), /Missing runtime dependency/);
});

test('extracted ZIP executes real task workflow without global CLI and rejects stale evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'redpen plugin spaces '));
  try {
    const files = await collectPublicPackage();
    const zip = join(root, 'plugin.zip');
    await writeFile(zip, archivePackage(files));
    const plugin = join(root, 'plugin'); await mkdir(plugin);
    // Extract local records without requiring an OS-specific archive executable.
    const archive = await readFile(zip);
    let offset = 0;
    while (archive.readUInt32LE(offset) === 0x04034b50) {
      const length = archive.readUInt32LE(offset + 18);
      const nameLength = archive.readUInt16LE(offset + 26);
      const extraLength = archive.readUInt16LE(offset + 28);
      const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString();
      assert(files.has(name), `Unexpected archive path: ${name}`);
      const start = offset + 30 + nameLength + extraLength;
      const target = join(plugin, name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, inflateRawSync(archive.subarray(start, start + length)));
      offset = start + length;
    }
    assert.equal(archive.readUInt32LE(offset), 0x02014b50);
    for (const [path, data] of files) assert.deepEqual(await readFile(join(plugin, path)), data);
    const repo = join(root, 'repository'); await mkdir(repo);
    const put = async (path, text) => { await mkdir(dirname(join(repo, path)), { recursive: true }); await writeFile(join(repo, path), text); };
    await put('package.json', JSON.stringify({type:'module',scripts:{test:'node --test',build:'node --check src/page.mjs'}}));
    await put('src/page.mjs', 'export const page = cursor => cursor === null ? [] : [1,2];\n');
    await put('tests/page.test.mjs', "import test from 'node:test'; test('existing',()=>{});\n");
    for (const args of [['init','-q'],['config','user.name','Plugin Test'],['config','user.email','test@example.test'],['add','.'],['commit','-qm','baseline']]) execFileSync('git',args,{cwd:repo});
    const run = (args, code = 0) => {
      const result = spawnSync(process.execPath,[join(plugin,'dist/cli.js'),...args],{cwd:repo,encoding:'utf8'});
      assert.equal(result.status,code,result.stdout+result.stderr); return result.stdout;
    };
    run(['--help']); run(['start','Fix null cursor']);
    await put('src/page.mjs','export const page = cursor => [1,2];\n');
    await put('tests/null.test.mjs',"import test from 'node:test'; import assert from 'node:assert/strict'; import {page} from '../src/page.mjs'; test('null starts at beginning',()=>assert.deepEqual(page(null),[1,2]));\n");
    run(['claims','Added tests. All tests pass. Build succeeds. No breaking changes.']);
    assert.match(run(['check','--markdown']), /DONE/);
    const report = JSON.parse(await readFile(join(repo,'.redpen/report.json')));
    assert.equal(report.summary.done,true);
    assert(report.agentClaimResults.some(c => c.status === 'unverified'));
    assert.match(run(['check','--strict-claims','--markdown'],1),/NOT DONE/);
    run(['check']);
    await put('src/page.mjs','export const page = cursor => [];\n');
    assert.match(run(['report'],1),/CHECK NEEDED/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
