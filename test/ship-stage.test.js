const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const TASKS = '## Tasks\n\n### 1. One\n\nDo it.\n\nDepends on: none\nVerify: x\n\n### 2. Two\n\nDo it.\n\nDepends on: none\nVerify: x\n';
const REPORT = '## Summary\n\none\ntwo\nthree\nfour\nfive\n\n## Details\n\nMore.\n';
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const write = (name, content = 'x') => {
  fs.mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
  fs.writeFileSync(path.join(project, name), content);
};
const commitAll = () => {
  git('add', '-A');
  git('commit', '-q', '-m', 'work');
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const shipGate = () => {
  const result = ourkit('gate', 'ship');
  return { status: result.status, problems: JSON.parse(result.stdout).problems || [] };
};
// A Feature with its work done, committed and reviewed.
const readyFeature = () => {
  write('work.txt', 'done');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  write(ourkit('gate', 'path', 'tasks').stdout.trim(), TASKS);
  ourkit('task', 'done', '1');
  ourkit('task', 'done', '2');
  write(ourkit('gate', 'path', 'report').stdout.trim(), REPORT);
  commitAll();
  ourkit('review', 'complete');
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-ship-'));
  git('init', '-q', '-b', 'main');
  write('old.txt');
  commitAll();
  git('switch', '-q', '-c', 'my-change');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('a finished, reviewed, committed Feature may ship', () => {
  readyFeature();
  assert.deepStrictEqual(shipGate(), { status: 0, problems: [] });
});

test('an unreviewed change may not ship', () => {
  write('work.txt');
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  commitAll();
  assert.ok(shipGate().problems.includes('this change has not been reviewed yet'));
});

test('a blocking finding stops Ship', () => {
  readyFeature();
  ourkit('review', 'add', 'blocking', 'wrong');
  const { status, problems } = shipGate();
  assert.strictEqual(status, 1);
  assert.match(problems[0], /blocking finding/);
});

test('uncommitted work stops Ship, but kit records do not', () => {
  readyFeature();
  ourkit('decision', 'add', 'd', '--why', 'w');
  assert.strictEqual(shipGate().status, 0);
  write('more.txt');
  assert.ok(shipGate().problems.some((problem) => /uncommitted work/.test(problem)));
});

test('work moved since the review stops Ship', () => {
  readyFeature();
  write('work.txt', 'changed');
  commitAll();
  assert.ok(shipGate().problems.some((problem) => /moved since/.test(problem)));
});

test('unfinished or blocked tasks stop a Feature', () => {
  readyFeature();
  ourkit('task', 'reopen', '2');
  assert.ok(shipGate().problems.includes('some tasks are not finished'));
  ourkit('task', 'block', '2', 'Stuck');
  assert.ok(shipGate().problems.includes('these tasks are blocked: 2'));
});

test('a Feature without tasks may not ship', () => {
  write('work.txt');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  commitAll();
  ourkit('review', 'complete');
  assert.ok(shipGate().problems.some((problem) => /doesn't exist yet/.test(problem)));
});

test('a reviewed Patch needs no task list', () => {
  write('work.txt');
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  commitAll();
  ourkit('review', 'complete');
  assert.strictEqual(shipGate().status, 0);
});

test('a change on the default branch may not ship', () => {
  git('switch', '-q', 'main');
  write('work.txt');
  commitAll();
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  ourkit('review', 'complete');
  assert.ok(shipGate().problems.some((problem) => /own branch/.test(problem)));
});

test('in Hands-off, a blocked Ship means fix or stop', () => {
  ourkit('mode', 'hands-off');
  write('work.txt');
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  assert.strictEqual(JSON.parse(ourkit('gate', 'ship').stdout).action, 'fix-or-stop');
});

test('the Stage never merges, and covers both Patch paths', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-ship', 'SKILL.md'), 'utf8');
  for (const required of ['Never merge a PR', 'auto-merge', 'A Patch in Pair', 'A Patch in Hands-off', 'ourkit gate ship', '--pr', 'Test Handoff', 'ourkit pending add']) {
    assert.ok(stage.includes(required), required);
  }
});
