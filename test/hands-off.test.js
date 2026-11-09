const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const PLAN = ['Approach', 'Prior Art', 'Changes', 'Risks', 'Test Strategy'].map((s) => `## ${s}\n\nText.\n`).join('\n');
const TASKS = '## Tasks\n\n### 1. One\n\nDo it.\n\nDepends on: none\nVerify: x\n';
const REPORT = '## Summary\n\n1\n2\n3\n4\n5\n\n## Details\n\nMore.\n';
const BODY = '**Summary:** S.\n\n**User Story:** As a user, I want x, so that y.\n\n**Context:** C.\n\n**Scope Boundary:**\n- In: a.\n- Out: b.\n\n**Links & References:** None.\n';
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
const docPath = (name) => ourkit('gate', 'path', name).stdout.trim();
const gate = (name) => {
  const result = ourkit('gate', name);
  return { status: result.status, json: JSON.parse(result.stdout) };
};
const commitAll = () => {
  git('add', '-A');
  git('commit', '-q', '-m', 'work');
};
// A Hands-off Feature with its work finished, committed, reviewed and checked in QA.
const finishWork = (tierArgs = []) => {
  write('work.txt', 'done');
  ourkit('tier', 'set', 'feature', '--reason', 'r', ...tierArgs);
  write(docPath('spec'), '## Acceptance Criteria\n\n- It works\n');
  write(docPath('tasks'), TASKS);
  ourkit('task', 'done', '1');
  write(docPath('report'), REPORT);
  commitAll();
  ourkit('review', 'complete');
  ourkit('qa', 'check', '1', 'pass', 'seen');
  ourkit('qa', 'complete');
};
const passIntake = (ticket, facts = {}) => {
  const file = path.join(project, 'facts.json');
  fs.writeFileSync(file, JSON.stringify({
    ticket, title: 'A title', body: BODY, authorIsTeam: true, readyLabelPresent: false, readyLabelAppliedByTeam: false, editedByOutsiderAfterReady: false, ...facts,
  }));
  const result = ourkit('intake', 'assess', file);
  fs.rmSync(file);
  return result;
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-handsoff-'));
  git('init', '-q', '-b', 'main');
  write('old.txt');
  commitAll();
  git('switch', '-q', '-c', 'my-change');
  ourkit('mode', 'hands-off');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('an ordinary change runs from Plan to Ship with no approval', () => {
  finishWork();
  write(docPath('plan'), PLAN);
  assert.strictEqual(gate('approval').status, 0);
  assert.deepStrictEqual(gate('ship').status, 0);
});

test('a Sensitive Area change stops after Plan until the user approves', () => {
  ourkit('tier', 'set', 'feature', '--reason', 'r', '--sensitive', 'auth');
  write(docPath('plan'), PLAN);
  const { status, json } = gate('approval');
  assert.strictEqual(status, 1);
  assert.strictEqual(json.action, 'stop-for-user');
  assert.match(json.reason, /not approved/);
  assert.strictEqual(ourkit('gate', 'approve-plan').status, 0);
  assert.strictEqual(gate('approval').status, 0);
});

test('a Sensitive Area change stops before Ship until the user approves', () => {
  finishWork(['--sensitive', 'money']);
  const stopped = gate('ship');
  assert.strictEqual(stopped.status, 1);
  assert.strictEqual(stopped.json.action, 'stop-for-user');
  assert.deepStrictEqual(stopped.json.problems, ['the user must approve this change before Ship']);
  assert.strictEqual(ourkit('gate', 'approve-ship').status, 0);
  assert.strictEqual(gate('ship').status, 0);
});

test('a change needing the user on a service stops at both places', () => {
  ourkit('handsoff', 'needs-service', 'Create a token in the dashboard');
  finishWork();
  write(docPath('plan'), PLAN);
  assert.strictEqual(gate('approval').json.action, 'stop-for-user');
  assert.strictEqual(gate('ship').json.action, 'stop-for-user');
  assert.deepStrictEqual(JSON.parse(ourkit('handsoff', 'status').stdout).serviceActions, ['Create a token in the dashboard']);
});

test('work changed after the approval needs approving again', () => {
  finishWork(['--sensitive', 'money']);
  ourkit('gate', 'approve-ship');
  write('work.txt', 'changed');
  commitAll();
  ourkit('review', 'complete');
  ourkit('qa', 'complete');
  const { status, json } = gate('ship');
  assert.strictEqual(status, 1);
  assert.deepStrictEqual(json.problems, ['the change moved after the user approved it, so it needs approving again']);
});

test('approval cannot be recorded for unfinished work', () => {
  ourkit('tier', 'set', 'feature', '--reason', 'r', '--sensitive', 'money');
  const result = ourkit('gate', 'approve-ship');
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /isn't ready for approval/);
});

test('a linked ticket must have passed intake, at both Gates', () => {
  finishWork();
  write(docPath('plan'), PLAN);
  ourkit('tracker', 'link', '42');
  for (const name of ['approval', 'ship']) {
    assert.strictEqual(gate(name).status, 1, name);
    assert.strictEqual(gate(name).json.action, 'stop-for-user', name);
  }
  assert.match(gate('approval').json.reason, /has not passed intake/);
  assert.strictEqual(passIntake('42').status, 0);
  assert.strictEqual(gate('approval').status, 0);
  assert.strictEqual(gate('ship').status, 0);
});

test('a rejected ticket stops the work', () => {
  write(docPath('plan'), PLAN);
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  ourkit('tracker', 'link', '42');
  assert.strictEqual(passIntake('42', { authorIsTeam: false }).status, 1);
  assert.match(gate('approval').json.reason, /rejected at intake/);
});

test('passing intake for another ticket does not count', () => {
  write(docPath('plan'), PLAN);
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  passIntake('41');
  ourkit('tracker', 'link', '42');
  assert.match(gate('approval').json.reason, /42 has not passed intake/);
});

test('Pair needs no intake and has no second stop', () => {
  ourkit('mode', 'pair');
  finishWork(['--sensitive', 'money']);
  ourkit('tracker', 'link', '42');
  assert.strictEqual(gate('ship').status, 0);
});

test('a Test Handoff always has steps, and status shows it', () => {
  assert.strictEqual(ourkit('handsoff', 'test-handoff', 'The email looks right').status, 2);
  assert.strictEqual(ourkit('handsoff', 'test-handoff', 'The email looks right', '1. Sign up. 2. Open the email.').status, 0);
  assert.deepStrictEqual(JSON.parse(ourkit('handsoff', 'status').stdout).testHandoff, [
    { what: 'The email looks right', steps: '1. Sign up. 2. Open the email.' },
  ]);
});

test('rejects bad usage', () => {
  assert.strictEqual(ourkit('handsoff', 'needs-service').status, 2);
  assert.strictEqual(ourkit('handsoff').status, 2);
});

test('the Stage covers intake, both stops and the report, and never merges', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-handsoff', 'SKILL.md'), 'utf8');
  for (const required of ['ourkit mode hands-off', 'core/intake.md', 'After Plan', 'Before Ship', 'ourkit gate approve-ship', 'test-handoff', 'Merging and deploying to production are the user', 'A later session may pick up']) {
    assert.ok(stage.includes(required), required);
  }
});
