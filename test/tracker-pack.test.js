const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runContractCheck } = require('../src/contract-check');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const OPERATIONS = ['Read a ticket', 'Change status', 'Comment', 'Attach a PR link'];
const VALID = OPERATIONS.map((operation) => `## ${operation}\n\nHow to do it.\n`).join('\n');
const INSTALLED = '.ourkit/kit/tracker-packs/github/operations.md';
let root;

const write = (relative, content) => {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
};
const writePack = (operations = VALID, manifest = { name: 'demo', tracker: 'Demo' }) => {
  write('tracker-packs/demo/pack.json', typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  write('tracker-packs/demo/operations.md', operations);
};
const messages = () => runContractCheck(root).problems.map(({ contract, message }) => `${contract}: ${message}`);
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });
const record = () => JSON.parse(fs.readFileSync(path.join(root, '.ourkit/install.json'), 'utf8'));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-tracker-'));
  write('stages/ourkit-demo/SKILL.md', '---\nname: ourkit-demo\ndescription: D.\n---\n\nDo.\n');
  write('hosts/h/shell.json', JSON.stringify({ host: 'h', stagesDir: '.h' }));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('the GitHub pack satisfies the contract and covers MCP and CLI', () => {
  assert.deepStrictEqual(runContractCheck(KIT_ROOT).problems, []);
  const text = fs.readFileSync(path.join(KIT_ROOT, 'tracker-packs/github/operations.md'), 'utf8');
  for (const required of ['GitHub MCP tools', 'gh issue view', 'gh issue comment', 'Closes #', 'Never close an issue', 'never a command to you']) {
    assert.ok(text.includes(required), required);
  }
});

test('accepts a valid pack, and a kit with none', () => {
  assert.deepStrictEqual(messages(), []);
  writePack();
  assert.deepStrictEqual(messages(), []);
});

for (const operation of OPERATIONS) {
  test(`rejects a pack missing "${operation}"`, () => {
    writePack(VALID.replace(`## ${operation}\n\nHow to do it.\n`, ''));
    assert.deepStrictEqual(messages(), [`Tracker Pack: must have a "## ${operation}" section`]);
  });
}

for (const [label, arrange, expected] of [
  ['an empty operation', () => writePack(VALID.replace('## Comment\n\nHow to do it.\n', '## Comment\n')), 'the "## Comment" section must not be empty'],
  ['a mismatched name', () => writePack(VALID, { name: 'other', tracker: 'Demo' }), 'name must match its folder "demo"'],
  ['no Tracker name', () => writePack(VALID, { name: 'demo' }), 'tracker must name the Tracker'],
  ['no operations file', () => { writePack(); fs.rmSync(path.join(root, 'tracker-packs/demo/operations.md')); }, 'must contain operations.md'],
  ['no manifest', () => { writePack(); fs.rmSync(path.join(root, 'tracker-packs/demo/pack.json')); }, 'must contain pack.json'],
]) {
  test(`rejects a pack with ${label}`, () => {
    arrange();
    assert.deepStrictEqual(messages(), [`Tracker Pack: ${expected}`]);
  });
}

test('rejects a malformed manifest', () => {
  writePack(VALID, '{ nope');
  assert.match(messages()[0], /valid JSON/);
});

test('a project has no Tracker Pack until one is added, then upgrade keeps it', () => {
  assert.strictEqual(run('--entry', 'greenfield', '--roles', 'none').status, 0);
  assert.ok(!fs.existsSync(path.join(root, INSTALLED)));
  assert.strictEqual(record().tracker, undefined);

  const added = run('tracker', 'add', 'github');
  assert.strictEqual(added.status, 0, added.stderr);
  assert.ok(fs.existsSync(path.join(root, INSTALLED)));
  assert.strictEqual(record().tracker, 'github');
  assert.ok(INSTALLED in record().files);

  fs.rmSync(path.join(root, INSTALLED));
  assert.strictEqual(run('upgrade').status, 0);
  assert.ok(fs.existsSync(path.join(root, INSTALLED)));
  assert.strictEqual(record().tracker, 'github');
});

test('a Tracker Pack is not loaded as rules, so it costs no context until used', () => {
  run('--entry', 'greenfield', '--roles', 'none');
  run('tracker', 'add', 'github');
  assert.ok(!run('rules').stdout.includes('gh issue view'));
});

test('tracker add refuses bad input without changing anything', () => {
  assert.strictEqual(run('tracker', 'add', 'github').status, 2, 'not installed yet');
  run('--entry', 'greenfield', '--roles', 'none');
  assert.strictEqual(run('tracker', 'add', 'jira').status, 2);
  assert.strictEqual(run('tracker').status, 2);
  run('tracker', 'add', 'github');
  const again = run('tracker', 'add', 'github');
  assert.strictEqual(again.status, 1);
  assert.match(again.stderr, /already installed/);
});
