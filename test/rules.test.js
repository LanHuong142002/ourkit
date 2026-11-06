const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { renderRules, resolveLayers } = require('../src/rules');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let project;

const write = (relative, content) => {
  const file = path.join(project, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const layerNames = () => resolveLayers(project).map(({ layer }) => layer);

// Written in reverse so the order can't come from creation time or from a name sort.
const writeEveryLayer = () => {
  write('.ourkit/rules.md', 'Indent with project rule.\n');
  write('.ourkit/kit/stack-packs/pack/a.md', 'Indent with pack rule.\n');
  write('.ourkit/kit/roles/role/a.md', 'Indent with role rule.\n');
  write('.ourkit/kit/core/a.md', 'Indent with core rule.\n');
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-rules-'));
  fs.cpSync(path.join(KIT_ROOT, 'fixtures', 'node'), project, { recursive: true });
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('orders layers as Core, Role, Stack Pack, Project Rules', () => {
  writeEveryLayer();
  assert.deepStrictEqual(layerNames(), ['Core', 'Role', 'Stack Pack', 'Project Rules']);
});

test('prints conflicting rules with Project Rules last', () => {
  writeEveryLayer();
  const output = renderRules(project);
  const positions = ['core', 'role', 'pack', 'project'].map((name) => output.indexOf(`Indent with ${name} rule.`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepStrictEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(output, /the later section wins/);
  assert.match(output, /<!-- Project Rules: \.ourkit\/rules\.md -->/);
});

test('sorts files within a layer, including several Roles', () => {
  write('.ourkit/kit/roles/frontend/checklist.md', 'f');
  write('.ourkit/kit/roles/backend/z.md', 'bz');
  write('.ourkit/kit/roles/backend/a.md', 'ba');
  const files = resolveLayers(project).map(({ file }) => path.relative(project, file).replace(/\\/g, '/'));
  assert.deepStrictEqual(files, [
    '.ourkit/kit/roles/backend/a.md',
    '.ourkit/kit/roles/backend/z.md',
    '.ourkit/kit/roles/frontend/checklist.md',
  ]);
});

test('works with Core only, because every other layer is optional', () => {
  write('.ourkit/kit/core/a.md', 'c');
  assert.deepStrictEqual(layerNames(), ['Core']);
});

test('works on a project with no kit files', () => {
  assert.deepStrictEqual(resolveLayers(project), []);
});

test('ignores files that are not Markdown', () => {
  write('.ourkit/kit/core/a.md', 'c');
  write('.ourkit/kit/core/script.sh', 'nope');
  assert.strictEqual(resolveLayers(project).length, 1);
});

test('command prints rules and installs nothing', () => {
  writeEveryLayer();
  const result = spawnSync(process.execPath, [BIN, 'rules', project], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /Indent with project rule\./);
  assert.ok(!fs.existsSync(path.join(project, '.claude')));
});
