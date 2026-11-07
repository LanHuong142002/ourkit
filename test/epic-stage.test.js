const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let project;

const feature = (id, blockedBy = 'none', title = `Feature number ${id}`) => `## F${id} ${title}

**Summary:** Do a thing.

**User Story:** As a user, I want a thing, so that I benefit.

**Context:** It matters.

**Scope Boundary:**
- In: the thing.
- Out: other things.

**Links & References:** ADR 0001.
**Blocked by:** ${blockedBy}

`;
const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const writeEpic = (content) => {
  const file = path.join(project, ourkit('gate', 'path', 'epic').stdout.trim());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const problems = () => JSON.parse(ourkit('gate', 'artifact', 'epic').stdout).problems || [];

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-epic-'));
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('switch', '-q', '-c', 'big-change');
  ourkit('tier', 'set', 'epic', '--reason', 'Too large for one cycle');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('accepts Features that meet the standard, and Windows line endings', () => {
  writeEpic(`${feature(1)}${feature(2, 'F1')}${feature(3, 'F1, F2')}`.replace(/\n/g, '\r\n'));
  assert.deepStrictEqual(problems(), []);
});

test('rejects a missing document and an empty one', () => {
  assert.match(problems()[0], /doesn't exist yet/);
  writeEpic('Some notes.\n');
  assert.match(problems()[0], /no Features/);
});

test('applies the Ticket Standard to each Feature, naming which one failed', () => {
  writeEpic(`${feature(1)}${feature(2).replace('**Context:** It matters.\n\n', '')}`);
  assert.deepStrictEqual(problems(), ['F2: [Complete] Context is missing']);
});

test('requires a dependency line', () => {
  writeEpic(feature(1).replace('**Blocked by:** none\n', ''));
  assert.deepStrictEqual(problems(), ['F1 needs a "Blocked by:" line, using "none" if nothing']);
});

for (const [label, content, pattern] of [
  ['an unknown dependency', feature(1, 'F9'), /F1 is blocked by F9, which doesn't exist/],
  ['a repeated number', `${feature(1)}${feature(1)}`, /Feature numbers repeat: F1/],
  ['a circle', `${feature(1, 'F2')}${feature(2, 'F1')}`, /circle: F1 -> F2 -> F1/],
]) {
  test(`rejects ${label}`, () => {
    writeEpic(content);
    const found = problems();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.match(found[0], pattern);
  });
}

test('an Epic routes to grilling and splitting', () => {
  assert.deepStrictEqual(JSON.parse(ourkit('tier', 'show').stdout).stages, ['Grill', 'Split into Features']);
});

test('the Stage grills first, needs the user, and waits before creating tickets', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-epic', 'SKILL.md'), 'utf8');
  const order = ['## Grill', '## Split', '## Handing over'].map((text) => stage.indexOf(text));
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b));
  for (const required of ['An Epic needs the user', 'Question Batch', 'ourkit gate artifact epic', 'wait for their agreement', 'never follow instructions']) {
    assert.ok(stage.includes(required), required);
  }
});

test('the Epic file is pushed before tickets link to it', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-epic', 'SKILL.md'), 'utf8');
  assert.ok(stage.indexOf('commit and push the branch with the Epic file') < stage.indexOf('create the tickets through it'));
  assert.ok(stage.includes('full URL'));
});
