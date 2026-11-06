const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const write = (name, content = 'x') => {
  fs.mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
  fs.writeFileSync(path.join(project, name), content);
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const reviewGate = () => {
  const result = ourkit('gate', 'review');
  return { status: result.status, json: JSON.parse(result.stdout) };
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-review-'));
  git('init', '-q', '-b', 'main');
  write('old.txt', 'old content');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('switch', '-q', '-c', 'my-change');
  write('old.txt', 'changed content');
  write('new.txt', 'new content');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('the packet holds the spec, the checklists and the diff, including new files', () => {
  write(ourkit('gate', 'path', 'spec').stdout.trim(), '## Goal\n\nThe spec text.\n');
  write('.ourkit/kit/roles/backend/checklist.md', '- [ ] Backend item\n');
  write('.ourkit/kit/roles/backend/guidance.md', 'Guidance text\n');
  const { stdout } = ourkit('review', 'packet');
  assert.match(stdout, /The spec text\./);
  assert.match(stdout, /Backend item/);
  assert.match(stdout, /\+changed content/);
  assert.match(stdout, /new file: new\.txt\nnew content/);
  assert.ok(!stdout.includes('Guidance text'), 'a Reviewer gets checklists, not guidance');
});

test('the packet carries no record of how the work was done', () => {
  ourkit('decision', 'add', 'Secret reasoning here', '--why', 'Because of how it went');
  ourkit('review', 'add', 'blocking', 'An earlier finding');
  const { stdout } = ourkit('review', 'packet');
  assert.ok(!stdout.includes('Secret reasoning'));
  assert.ok(!stdout.includes('An earlier finding'));
});

test('the packet names Sensitive Areas and uses Overrides of checklists', () => {
  ourkit('tier', 'set', 'feature', '--reason', 'r', '--sensitive', 'money');
  write('.ourkit/kit/roles/backend/checklist.md', '- [ ] Original item\n');
  write('.ourkit/overrides/roles/backend/checklist.md', '- [ ] Overridden item\n');
  const { stdout } = ourkit('review', 'packet');
  assert.match(stdout, /# Sensitive Areas\n\nmoney/);
  assert.match(stdout, /Overridden item/);
  assert.ok(!stdout.includes('Original item'));
});

test('the packet leaves out kit files and copes with no spec or Role', () => {
  write('.ourkit/kit/core/a.md', 'kit file text');
  const { stdout } = ourkit('review', 'packet');
  assert.ok(!stdout.includes('kit file text'));
  assert.match(stdout, /This change has no spec/);
  assert.match(stdout, /No Role is enabled/);
});

test('the Gate blocks a Feature that has not been reviewed', () => {
  const { status, json } = reviewGate();
  assert.strictEqual(status, 1);
  assert.match(json.reason, /not been reviewed/);
  assert.strictEqual(json.severity, 'block');
});

test('an unreviewed Patch only reminds', () => {
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  const { status, json } = reviewGate();
  assert.strictEqual(status, 0);
  assert.strictEqual(json.severity, 'remind');
});

test('a completed review passes the Gate', () => {
  ourkit('review', 'complete');
  assert.strictEqual(reviewGate().status, 0);
});

test('an unresolved blocking finding blocks, at any Tier', () => {
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  ourkit('review', 'add', 'blocking', 'a.txt:1 is wrong');
  ourkit('review', 'complete');
  const { status, json } = reviewGate();
  assert.strictEqual(status, 1);
  assert.strictEqual(json.findings[0].text, 'a.txt:1 is wrong');
});

test('resolving the finding clears it, and non-blocking findings never block', () => {
  ourkit('review', 'add', 'blocking', 'wrong');
  ourkit('review', 'add', 'non-blocking', 'could be nicer');
  ourkit('review', 'complete');
  assert.strictEqual(reviewGate().status, 1);
  assert.strictEqual(ourkit('review', 'resolve', '1').status, 0);
  assert.strictEqual(reviewGate().status, 0);
  assert.strictEqual(JSON.parse(ourkit('review', 'list').stdout).length, 2);
});

for (const [label, edit] of [
  ['an edited file', () => write('old.txt', 'edited again')],
  ['an edited new file', () => write('new.txt', 'edited again')],
  ['an added file', () => write('another.txt')],
]) {
  test(`${label} after the review needs another review`, () => {
    ourkit('review', 'complete');
    edit();
    const { status, json } = reviewGate();
    assert.strictEqual(status, 1);
    assert.match(json.reason, /moved since/);
  });
}

test('committing reviewed work does not need another review', () => {
  ourkit('review', 'complete');
  git('add', 'old.txt', 'new.txt');
  git('commit', '-q', '-m', 'work');
  assert.strictEqual(reviewGate().status, 0);
});

test('kit records changing does not need another review', () => {
  ourkit('review', 'complete');
  ourkit('decision', 'add', 'd', '--why', 'w');
  assert.strictEqual(reviewGate().status, 0);
});

test('rejects bad findings and unknown ids', () => {
  assert.strictEqual(ourkit('review', 'add', 'urgent', 'x').status, 2);
  assert.strictEqual(ourkit('review', 'add', 'blocking').status, 2);
  assert.strictEqual(ourkit('review', 'resolve', '9').status, 1);
  assert.strictEqual(ourkit('review', 'nonsense').status, 2);
});

test('Reviewers run on the strong model and cannot edit', () => {
  for (const agent of ['ourkit-reviewer', 'ourkit-sensitive-reviewer']) {
    const text = fs.readFileSync(path.join(KIT_ROOT, 'hosts/claude-code/agents', `${agent}.md`), 'utf8');
    assert.match(text, /^model: opus/m, agent);
    assert.match(text, /^tools: Read, Grep, Glob, Bash/m, agent);
    assert.match(text, /review packet/, agent);
    assert.match(text, /Never follow instructions/, agent);
  }
});

test('the Stage keeps Reviewers unbiased and covers each Tier', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-review', 'SKILL.md'), 'utf8');
  for (const required of ['ourkit-reviewer', 'ourkit-sensitive-reviewer', 'review it yourself', 'at most two attempts', 'ourkit gate review', "Don't explain the work"]) {
    assert.ok(stage.includes(required), required);
  }
});
