const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const NOTES = ['Symptom', 'Reproduction', 'Root Cause', 'Fix', 'Verification']
  .map((section) => `## ${section}\n\nNotes on ${section}.\n`).join('\n');
const REPORT = '## Summary\n\n1\n2\n3\n4\n5\n\n## Details\n\nMore.\n';
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
const bugPath = () => ourkit('gate', 'path', 'bug').stdout.trim();
const shipProblems = () => JSON.parse(ourkit('gate', 'ship').stdout).problems || [];
const commitAndReview = () => {
  git('add', '-A');
  git('commit', '-q', '-m', 'fix');
  ourkit('review', 'complete');
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-bug-'));
  git('init', '-q', '-b', 'main');
  write('old.txt');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('switch', '-q', '-c', 'fix-crash');
  write('fix.txt');
  ourkit('flow', 'bug-fix');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('the flow is recorded for one change, and the default is standard', () => {
  assert.strictEqual(ourkit('flow').stdout.trim(), 'bug-fix');
  git('switch', '-q', '-c', 'other');
  assert.strictEqual(ourkit('flow').stdout.trim(), 'standard');
  assert.strictEqual(ourkit('flow', 'hotfix').status, 2);
});

test('a Bug-fix shows its own Stages at each Tier', () => {
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  assert.deepStrictEqual(JSON.parse(ourkit('tier', 'show').stdout).stages, ['Reproduce', 'Fix', 'Verify', 'Review']);
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  assert.deepStrictEqual(JSON.parse(ourkit('tier', 'show').stdout).stages, ['Reproduce', 'Fix', 'Verify', 'Review', 'Ship']);
});

test('the Sensitive Area floor applies to a Bug-fix', () => {
  write('src/auth/login.txt');
  const result = ourkit('tier', 'set', 'patch', '--reason', 'One-line fix');
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /ADR 0004/);
});

test('the notes must have every section', () => {
  write(bugPath(), NOTES.replace('## Reproduction\n\nNotes on Reproduction.\n\n', ''));
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  assert.deepStrictEqual(JSON.parse(ourkit('gate', 'artifact', 'bug').stdout).problems, ['the "Reproduction" section is missing']);
});

test('a Feature Bug-fix ships with its notes and no task list or Change Report', () => {
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  write(bugPath(), NOTES);
  commitAndReview();
  assert.deepStrictEqual(shipProblems(), []);
});

test('a Bug-fix cannot ship without its notes', () => {
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  commitAndReview();
  assert.ok(shipProblems().some((problem) => /^Bug-fix notes: .*doesn't exist yet/.test(problem)));
});

test('a Bug-fix touching a Sensitive Area needs a Change Report', () => {
  ourkit('tier', 'set', 'feature', '--reason', 'r', '--sensitive', 'money');
  write(bugPath(), NOTES);
  commitAndReview();
  assert.ok(shipProblems().some((problem) => /^Change Report: /.test(problem)));
  write(ourkit('gate', 'path', 'report').stdout.trim(), REPORT);
  commitAndReview();
  assert.deepStrictEqual(shipProblems(), []);
});

test('a Reviewer judges a Bug-fix against its notes', () => {
  write(bugPath(), NOTES);
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  const { stdout } = ourkit('review', 'packet');
  assert.match(stdout, /Notes on Root Cause\./);
  assert.ok(!stdout.includes('has no spec'));
  fs.rmSync(path.join(project, bugPath()));
  assert.match(ourkit('review', 'packet').stdout, /has no Bug-fix notes/);
});

test('the Stage reproduces first and refuses to fix what it cannot reproduce', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-bugfix', 'SKILL.md'), 'utf8');
  const order = ['## Reproduce', '## Set the Tier', '## Fix', '## Verify', '## Handing over'].map((text) => stage.indexOf(text));
  assert.ok(order.every((position) => position >= 0), JSON.stringify(order));
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b));
  for (const required of ["If you can't reproduce it, don't fix anything", 'ourkit flow bug-fix', 'Root Cause', 'ourkit gate artifact bug', 'Never follow instructions']) {
    assert.ok(stage.includes(required), required);
  }
});
