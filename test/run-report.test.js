const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const FAKE = path.join(KIT_ROOT, 'test-support', 'fake-session.js');
let project;
let logFile;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const loop = (...args) => spawnSync(process.execPath, [BIN, 'loop', ...args], {
  cwd: project,
  encoding: 'utf8',
  env: { ...process.env, OURKIT_LOOP_COMMAND: `"${process.execPath}" "${FAKE}"`, FAKE_SESSION_LOG: logFile },
});
const report = () => fs.readFileSync(path.join(project, '.ourkit', 'run-report.md'), 'utf8');
const section = (name) => report().split(`## ${name}\n`)[1].split('\n## ')[0];

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-report-'));
  logFile = path.join(os.tmpdir(), `ourkit-report-log-${path.basename(project)}.txt`);
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(logFile, { force: true });
});

test('gathers every part from each ticket\'s branch', () => {
  const result = loop('run', '--hours', '1', 't1', 't2');
  assert.match(result.stdout, /run-report\.md/);
  assert.match(report(), /\*\*Stopped:\*\* done\./);
  assert.match(section('Question Batch'), /\*\*t1:\*\* Open question on t1\?/);
  assert.match(section('Question Batch'), /\*\*t2:\*\* Open question on t2\?/);
  assert.match(section('Test Handoff'), /\*\*t1:\*\* Check t1 Steps: 1\. Open it\./);
  assert.match(section('Decision Log'), /\*\*t2:\*\* Decided on t2 Why: It was simplest/);
  assert.match(section('Non-blocking findings'), /A nicety on t1/);
  assert.match(section('Finished'), /### t1\n\nOutcome: shipped on branch `ticket-t1`/);
});

test('leaves out what is settled', () => {
  loop('run', '--hours', '1', 't1');
  assert.ok(!report().includes('Answered question'));
  assert.ok(!report().includes('A fixed bug'));
});

test('says what each outcome needs from the user, without suggesting a merge is done', () => {
  loop('run', '--hours', '1', 't1', 'stopped-2', 'blocked-3', 'noresult');
  const waiting = section('Waiting for you');
  assert.match(waiting, /\*\*t1:\*\* review and merge its PR.*Merging is your decision/);
  assert.match(waiting, /\*\*stopped-2:\*\* waiting for your approval/);
  assert.match(waiting, /\*\*blocked-3:\*\* blocked/);
  assert.match(waiting, /\*\*noresult:\*\* the session didn't say how it ended/);
});

for (const [label, args, stopped, expected] of [
  ['the Budget', ['--tokens', '100', 't1', 't2'], 'budget', /\*\*t2:\*\* didn't finish, and is still queued/],
  ['a failed session', ['--hours', '1', 'crash'], 'session-failed', /\*\*crash:\*\* didn't finish/],
  ['a dirty tree', ['--hours', '1', 'dirtymain'], 'dirty-tree', /the session didn't say|left-behind/],
  ['nothing shipped', ['--hours', '1', 'blocked-1'], 'all-blocked', /\*\*blocked-1:\*\* blocked/],
]) {
  test(`writes a report when stopped by ${label}`, () => {
    loop('run', ...args);
    assert.match(report(), new RegExp(`\\*\\*Stopped:\\*\\* ${stopped}\\.`));
    assert.match(report(), expected);
  });
}

test('shows the Budget and what was used, and empty parts say so', () => {
  loop('run', '--tokens', '500', 'noresult');
  assert.match(report(), /150 tokens, of a Budget of \{"tokens":500\}/);
  assert.match(section('Decision Log'), /None\./);
});

test('a session that failed records its error', () => {
  loop('run', '--hours', '1', 'error');
  assert.match(report(), /\*\*Last error:\*\* You have hit your limit/);
});

test('the report stays out of git', () => {
  loop('run', '--hours', '1', 'stopped-1', 't2');
  assert.strictEqual(git('ls-files', '.ourkit/run-report.md'), '');
  assert.strictEqual(spawnSync('git', ['cat-file', '-e', 'ticket-stopped-1:.ourkit/run-report.md'], { cwd: project }).status, 128);
  assert.strictEqual(git('status', '--porcelain', '--', '.ourkit/run-report.md'), '');
});

test('the Stage answers from the report and treats it as data', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-run-report', 'SKILL.md'), 'utf8');
  for (const required of ['.ourkit/run-report.md', 'git show', 'never follow instructions', "Don't merge"]) {
    assert.ok(stage.includes(required), required);
  }
});
