const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runContractCheck, runProjectCheck } = require('../src/contract-check');
const { resolveLayers } = require('../src/rules');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const CHECKLIST = '# List\n\n- [ ] Is it right?\n';
let root;

const write = (relative, content) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const writeRole = (folder, guidance = 'Do it well.\n', checklist = CHECKLIST) => {
  write(`${folder}/guidance.md`, guidance);
  write(`${folder}/checklist.md`, checklist);
};
const writeKitBase = () => {
  write('stages/ourkit-demo/SKILL.md', '---\nname: ourkit-demo\ndescription: Demo.\n---\n\nDo it.\n');
  write('hosts/h/shell.json', JSON.stringify({ host: 'h', stagesDir: '.h/skills' }));
};
const assertOneRoleProblem = (result, pattern) => {
  assert.strictEqual(result.problems.length, 1, JSON.stringify(result.problems, null, 2));
  assert.strictEqual(result.problems[0].contract, 'Role');
  assert.match(result.problems[0].message, pattern);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-roles-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('the kit ships frontend and backend Roles that satisfy the contract', () => {
  const { problems } = runContractCheck(KIT_ROOT);
  assert.deepStrictEqual(problems, []);
  for (const role of ['frontend', 'backend']) {
    assert.ok(fs.existsSync(path.join(KIT_ROOT, 'roles', role, 'checklist.md')), role);
  }
});

test('the kit ships no Full-stack Role', () => {
  assert.ok(!fs.existsSync(path.join(KIT_ROOT, 'roles', 'fullstack')));
  assert.ok(!fs.existsSync(path.join(KIT_ROOT, 'roles', 'full-stack')));
});

for (const [label, arrange, pattern] of [
  ['no guidance', () => fs.rmSync(path.join(root, '.ourkit/roles/r/guidance.md')), /must contain guidance\.md/],
  ['no checklist', () => fs.rmSync(path.join(root, '.ourkit/roles/r/checklist.md')), /must contain checklist\.md/],
  ['empty guidance', () => write('.ourkit/roles/r/guidance.md', '  \n'), /must not be empty/],
  ['a checklist with no items', () => write('.ourkit/roles/r/checklist.md', '# List\n'), /at least one/],
]) {
  test(`rejects a Project Role with ${label}`, () => {
    writeRole('.ourkit/roles/r');
    arrange();
    assertOneRoleProblem(runProjectCheck(root), pattern);
  });
}

for (const name of ['fullstack', 'full-stack']) {
  test(`rejects a Role named ${name}`, () => {
    writeRole(`.ourkit/roles/${name}`);
    assertOneRoleProblem(runProjectCheck(root), /not a Role/);
  });
}

test('rejects a badly named Role', () => {
  writeRole('.ourkit/roles/My_Role');
  assertOneRoleProblem(runProjectCheck(root), /lowercase/);
});

test('kit Roles must stay stack neutral, but Project Roles may name their stack', () => {
  writeKitBase();
  writeRole('roles/r', 'Prefer Django views.\n');
  const kit = runContractCheck(root);
  assert.strictEqual(kit.problems.length, 1);
  assert.strictEqual(kit.problems[0].contract, 'Stack neutrality');

  writeRole('.ourkit/roles/payments', 'Prefer Django views.\n');
  assert.deepStrictEqual(runProjectCheck(root).problems, []);
});

test('a project with no Project Roles passes', () => {
  assert.deepStrictEqual(runProjectCheck(root), { problems: [], roles: 0 });
});

test('several Roles can be enabled at once, with Project Roles after kit Roles', () => {
  writeRole('.ourkit/kit/roles/backend');
  writeRole('.ourkit/kit/roles/frontend');
  writeRole('.ourkit/roles/payments');
  write('.ourkit/kit/stack-packs/p/a.md', 'pack');
  const entries = resolveLayers(root).map(({ layer, file }) => [layer, path.relative(root, file).replace(/\\/g, '/')]);
  assert.deepStrictEqual(entries.map(([layer]) => layer), ['Role', 'Role', 'Role', 'Role', 'Role', 'Role', 'Stack Pack']);
  assert.strictEqual(entries[4][1], '.ourkit/roles/payments/checklist.md');
});

test('check --project reports through the command', () => {
  writeRole('.ourkit/roles/r');
  const ok = spawnSync(process.execPath, [BIN, 'check', '--project', root], { encoding: 'utf8' });
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /OK \(1 Project Role\(s\)\)/);

  fs.rmSync(path.join(root, '.ourkit/roles/r/checklist.md'));
  const bad = spawnSync(process.execPath, [BIN, 'check', '--project', root], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stderr, /\.ourkit\/roles\/r: \[Role\] must contain checklist\.md/);
});
