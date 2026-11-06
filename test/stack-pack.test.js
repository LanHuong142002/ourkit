const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runContractCheck } = require('../src/contract-check');
const { resolveLayers } = require('../src/rules');
const { installStackPack } = require('../src/stack-pack');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let base;
let project;
let pack;

const writePack = (manifest = { name: 'demo-pack', technologies: ['Demo'] }, conventions = 'Run npm test.\n') => {
  fs.mkdirSync(pack, { recursive: true });
  fs.writeFileSync(path.join(pack, 'pack.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  fs.writeFileSync(path.join(pack, 'conventions.md'), conventions);
};
const add = (...args) => spawnSync(process.execPath, [BIN, 'pack', 'add', ...args], { encoding: 'utf8' });
const installedPath = () => path.join(project, '.ourkit', 'kit', 'stack-packs', 'demo-pack');

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-pack-'));
  project = path.join(base, 'project');
  pack = path.join(base, 'source', 'demo-pack');
  fs.mkdirSync(project);
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

test('v1 ships no real Stack Pack, and the kit passes without one', () => {
  assert.ok(!fs.existsSync(path.join(KIT_ROOT, 'stack-packs')));
  const { problems, packs } = runContractCheck(KIT_ROOT);
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(packs, 0);
});

test('installs a valid pack, which then loads after Roles and before Project Rules', () => {
  writePack();
  fs.mkdirSync(path.join(project, '.ourkit', 'kit', 'roles', 'r'), { recursive: true });
  fs.writeFileSync(path.join(project, '.ourkit', 'kit', 'roles', 'r', 'guidance.md'), 'role');
  fs.writeFileSync(path.join(project, '.ourkit', 'rules.md'), 'rules');

  assert.strictEqual(installStackPack(pack, project).installed, true);

  assert.deepStrictEqual(resolveLayers(project).map(({ layer }) => layer), ['Role', 'Stack Pack', 'Project Rules']);
  assert.ok(fs.existsSync(path.join(installedPath(), 'pack.json')));
});

test('rules load without any Stack Pack installed', () => {
  fs.mkdirSync(path.join(project, '.ourkit', 'kit', 'core'), { recursive: true });
  fs.writeFileSync(path.join(project, '.ourkit', 'kit', 'core', 'a.md'), 'core');
  assert.deepStrictEqual(resolveLayers(project).map(({ layer }) => layer), ['Core']);
});

for (const [label, manifest, conventions, pattern] of [
  ['a name that differs from its folder', { name: 'other', technologies: ['D'] }, 'c', /must match its folder/],
  ['no technologies', { name: 'demo-pack', technologies: [] }, 'c', /at least one name/],
  ['malformed JSON', '{ nope', 'c', /valid JSON/],
  ['a manifest that is not an object', '[]', 'c', /JSON object/],
  ['empty conventions', { name: 'demo-pack', technologies: ['D'] }, ' \n', /must not be empty/],
]) {
  test(`refuses to install a pack with ${label}`, () => {
    writePack(manifest, conventions);
    const result = installStackPack(pack, project);
    assert.strictEqual(result.installed, false);
    assert.strictEqual(result.problems.length, 1, JSON.stringify(result.problems));
    assert.match(result.problems[0].message, pattern);
    assert.ok(!fs.existsSync(installedPath()));
  });
}

test('refuses a pack without its required files', () => {
  fs.mkdirSync(pack, { recursive: true });
  const messages = installStackPack(pack, project).problems.map((p) => p.message);
  assert.deepStrictEqual(messages.sort(), ['must contain conventions.md', 'must contain pack.json']);
});

test('never overwrites an installed pack', () => {
  writePack();
  installStackPack(pack, project);
  fs.writeFileSync(path.join(installedPath(), 'conventions.md'), 'kept');
  const second = installStackPack(pack, project);
  assert.strictEqual(second.installed, false);
  assert.match(second.problems[0].message, /already installed/);
  assert.strictEqual(fs.readFileSync(path.join(installedPath(), 'conventions.md'), 'utf8'), 'kept');
});

test('the Contract Check verifies Stack Packs and allows them to name a stack', () => {
  const kit = path.join(base, 'kit');
  fs.mkdirSync(path.join(kit, 'stages', 'ourkit-demo'), { recursive: true });
  fs.writeFileSync(path.join(kit, 'stages', 'ourkit-demo', 'SKILL.md'), '---\nname: ourkit-demo\ndescription: D.\n---\n\nDo.\n');
  fs.mkdirSync(path.join(kit, 'hosts', 'h'), { recursive: true });
  fs.writeFileSync(path.join(kit, 'hosts', 'h', 'shell.json'), JSON.stringify({ host: 'h', stagesDir: '.h' }));
  const kitPack = path.join(kit, 'stack-packs', 'demo-pack');
  fs.mkdirSync(kitPack, { recursive: true });
  fs.writeFileSync(path.join(kitPack, 'pack.json'), JSON.stringify({ name: 'demo-pack', technologies: ['Python'] }));
  fs.writeFileSync(path.join(kitPack, 'conventions.md'), 'Run pytest with Python.\n');

  assert.deepStrictEqual(runContractCheck(kit).problems, []);
  fs.rmSync(path.join(kitPack, 'pack.json'));
  assert.strictEqual(runContractCheck(kit).problems[0].contract, 'Stack Pack');
});

test('command reports success, contract problems and bad usage', () => {
  writePack();
  const ok = add(pack, project);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /installed Stack Pack demo-pack/);
  assert.strictEqual(add(pack, project).status, 1);
  assert.strictEqual(add(path.join(base, 'missing'), project).status, 2);
  assert.match(add().stderr, /usage: ourkit pack add/);
});
