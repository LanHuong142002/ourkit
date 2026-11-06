const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const COMPLETE = ['Approach', 'Prior Art', 'Changes', 'Risks', 'Test Strategy']
  .map((section) => `## ${section}\n\nText for ${section}.\n`).join('\n');
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const writePlan = (content) => {
  const file = path.join(project, ourkit('gate', 'path', 'plan').stdout.trim());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const approval = () => {
  const result = ourkit('gate', 'approval');
  return { status: result.status, json: JSON.parse(result.stdout) };
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-plan-'));
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('switch', '-q', '-c', 'my-change');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('the plan must contain every section, including Prior Art', () => {
  writePlan(COMPLETE.replace('## Prior Art\n\nText for Prior Art.\n\n', ''));
  const result = ourkit('gate', 'artifact', 'plan');
  assert.strictEqual(result.status, 1);
  assert.deepStrictEqual(JSON.parse(result.stdout).problems, ['the "Prior Art" section is missing']);
});

test('in Pair, Build waits for a plan to exist and be approved', () => {
  assert.match(approval().json.reason, /doesn't exist yet/);
  writePlan(COMPLETE);
  const { status, json } = approval();
  assert.strictEqual(status, 1);
  assert.match(json.reason, /not approved/);
  assert.strictEqual(json.action, 'ask-user');
});

test('an approved plan lets Build start', () => {
  writePlan(COMPLETE);
  assert.strictEqual(ourkit('gate', 'approve-plan').status, 0);
  assert.strictEqual(approval().status, 0);
});

test('changing the plan after approval needs a new approval', () => {
  writePlan(COMPLETE);
  ourkit('gate', 'approve-plan');
  writePlan(`${COMPLETE}\nOne more thing.\n`);
  const { status, json } = approval();
  assert.strictEqual(status, 1);
  assert.match(json.reason, /changed after/);
});

test('a line ending change is not a change to the plan', () => {
  writePlan(COMPLETE);
  ourkit('gate', 'approve-plan');
  writePlan(COMPLETE.replace(/\n/g, '\r\n'));
  assert.strictEqual(approval().status, 0);
});

test('an incomplete plan cannot be approved', () => {
  writePlan('## Approach\n\nText.\n');
  const result = ourkit('gate', 'approve-plan');
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /can't be approved yet/);
});

test('Hands-off does not wait for approval', () => {
  ourkit('mode', 'hands-off');
  const { status, json } = approval();
  assert.strictEqual(status, 0);
  assert.match(json.reason, /does not wait/);
});

test('the Stage looks for Prior Art first and approves only on the user\'s word', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-plan', 'SKILL.md'), 'utf8');
  for (const required of ['Look for Prior Art', 'ourkit gate artifact plan', 'Only after they approve', 'stop here', "Don't write code"]) {
    assert.ok(stage.includes(required), required);
  }
  assert.ok(!stage.includes('Lessons'), 'reading Lessons belongs to #27');
});
