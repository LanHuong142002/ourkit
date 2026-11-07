const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runProjectCheck } = require('../src/contract-check');
const { orphanOverrides, resolveKitFile } = require('../src/overrides');
const { renderRules, resolveLayers } = require('../src/rules');

const KIT_ROOT = path.join(__dirname, '..');
let project;

const write = (relative, content) => {
  const file = path.join(project, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-override-'));
  fs.cpSync(path.join(KIT_ROOT, 'fixtures', 'node'), project, { recursive: true });
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('uses the kit file when there is no Override', () => {
  write('.ourkit/kit/core/a.md', 'kit');
  const { file, overridden } = resolveKitFile(project, path.join('core', 'a.md'));
  assert.strictEqual(overridden, false);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'kit');
});

test('an Override wins over the kit file, which stays untouched', () => {
  write('.ourkit/kit/core/a.md', 'kit');
  write('.ourkit/overrides/core/a.md', 'override');
  const { file, overridden } = resolveKitFile(project, path.join('core', 'a.md'));
  assert.strictEqual(overridden, true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'override');
  assert.strictEqual(fs.readFileSync(path.join(project, '.ourkit/kit/core/a.md'), 'utf8'), 'kit');
});

test('rules show the Override in the original file\'s place and hide the original', () => {
  write('.ourkit/kit/core/a.md', 'kit core');
  write('.ourkit/kit/roles/r/a.md', 'kit role');
  write('.ourkit/overrides/core/a.md', 'override core');
  write('.ourkit/rules.md', 'project rules');

  const output = renderRules(project);

  assert.deepStrictEqual(resolveLayers(project).map(({ layer }) => layer), ['Core', 'Role', 'Project Rules']);
  assert.ok(!output.includes('kit core'));
  assert.match(output, /<!-- Core \(Override\): \.ourkit\/overrides\/core\/a\.md -->\noverride core/);
  assert.ok(output.indexOf('override core') < output.indexOf('kit role'));
});

test('Overrides apply to Roles and Stack Packs', () => {
  write('.ourkit/kit/roles/r/a.md', 'kit');
  write('.ourkit/kit/stack-packs/p/a.md', 'kit');
  write('.ourkit/overrides/roles/r/a.md', 'o');
  write('.ourkit/overrides/stack-packs/p/a.md', 'o');
  assert.ok(resolveLayers(project).every(({ overridden }) => overridden));
});

test('an Override with no kit file is ignored by rules and reported by the check', () => {
  write('.ourkit/kit/core/a.md', 'kit');
  write('.ourkit/overrides/core/renamed.md', 'stale');

  assert.ok(!renderRules(project).includes('stale'));
  assert.deepStrictEqual(orphanOverrides(project), [path.join('core', 'renamed.md')]);

  const { problems } = runProjectCheck(project);
  assert.strictEqual(problems.length, 1);
  assert.strictEqual(problems[0].contract, 'Override');
  assert.match(problems[0].message, /no effect/);
});

test('a project with matching or no Overrides passes the check', () => {
  assert.deepStrictEqual(runProjectCheck(project).problems, []);
  write('.ourkit/kit/core/a.md', 'kit');
  write('.ourkit/overrides/core/a.md', 'o');
  assert.deepStrictEqual(runProjectCheck(project).problems, []);
});

test('Stage Overrides are not reported as orphans', () => {
  write('.ourkit/overrides/stages/ourkit-init/SKILL.md', 'o');
  assert.deepStrictEqual(orphanOverrides(project), []);
});
