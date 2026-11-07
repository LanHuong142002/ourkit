const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let project;

const task = (id, dependsOn = 'none') => `### ${id}. Task ${id}\n\nDo it.\n\nDepends on: ${dependsOn}\nVerify: A test passes\n\n`;
const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const writeTasks = (content) => {
  const file = path.join(project, ourkit('gate', 'path', 'tasks').stdout.trim());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `## Tasks\n\n${content}`);
};
const list = () => JSON.parse(ourkit('task', 'list').stdout);

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-build-'));
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

test('only tasks whose dependencies are done are ready', () => {
  writeTasks(`${task(1)}${task(2, '1')}${task(3)}`);
  assert.deepStrictEqual(list().ready, [1, 3]);
  ourkit('task', 'done', '1');
  assert.deepStrictEqual(list().ready, [2, 3]);
  assert.strictEqual(list().finished, false);
});

test('finished is true only when no task is open', () => {
  writeTasks(`${task(1)}${task(2)}`);
  ourkit('task', 'done', '1');
  assert.strictEqual(list().finished, false);
  ourkit('task', 'done', '2');
  assert.strictEqual(list().finished, true);
  assert.deepStrictEqual(list().ready, []);
});

test('a blocked task holds back its dependents but not independent work', () => {
  writeTasks(`${task(1)}${task(2, '1')}${task(3, '2')}${task(4)}`);
  assert.strictEqual(ourkit('task', 'block', '1', 'The API is missing').status, 0);
  const summary = list();
  assert.deepStrictEqual(summary.blocked, [1]);
  assert.deepStrictEqual(summary.heldBack, [2, 3]);
  assert.deepStrictEqual(summary.ready, [4]);
  assert.strictEqual(summary.tasks[0].reason, 'The API is missing');
});

test('a run with only blocked work left has nothing ready and is not finished', () => {
  writeTasks(`${task(1)}${task(2, '1')}`);
  ourkit('task', 'block', '1', 'Stuck');
  const { ready, finished } = list();
  assert.deepStrictEqual(ready, []);
  assert.strictEqual(finished, false);
});

test('reopening a blocked task makes it ready again', () => {
  writeTasks(task(1));
  ourkit('task', 'block', '1', 'Stuck');
  assert.strictEqual(ourkit('task', 'reopen', '1').status, 0);
  assert.deepStrictEqual(list().ready, [1]);
});

test('a block needs a reason, and unknown tasks are rejected', () => {
  writeTasks(task(1));
  assert.strictEqual(ourkit('task', 'block', '1').status, 2);
  assert.strictEqual(ourkit('task', 'done', '9').status, 1);
  assert.strictEqual(ourkit('task', 'reopen', '9').status, 1);
  assert.strictEqual(ourkit('task', 'nonsense').status, 2);
});

test('task commands refuse an invalid or missing list', () => {
  const missing = ourkit('task', 'list');
  assert.strictEqual(missing.status, 1);
  assert.match(missing.stderr, /aren't ready/);
  writeTasks(task(1, '1'));
  assert.strictEqual(ourkit('task', 'list').status, 1);
});

test('the Stage gates on approval, delegates, and never pushes', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-build', 'SKILL.md'), 'utf8');
  for (const required of ['ourkit gate approval', 'ourkit-implementer', 'ourkit-runner', 'ourkit task block', 'ourkit gate floor', 'ourkit gate run test', 'Test Handoff', "Don't push, merge or deploy"]) {
    assert.ok(stage.includes(required), required);
  }
});

test('sessions run the project\'s checks through the Gate, since their permissions deny the commands themselves', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'hosts', 'claude-code', 'session-settings.json'), 'utf8'));
  assert.ok(settings.permissions.allow.includes('Bash(node .ourkit/kit/bin/ourkit.js*)'));
  assert.ok(!settings.permissions.allow.some((rule) => /npm|yarn|pnpm/.test(rule)));
  for (const file of [
    ['hosts', 'claude-code', 'agents', 'ourkit-implementer.md'],
    ['hosts', 'claude-code', 'agents', 'ourkit-runner.md'],
    ['stages', 'ourkit-build', 'SKILL.md'],
    ['stages', 'ourkit-tasks', 'SKILL.md'],
    ['stages', 'ourkit-handsoff', 'SKILL.md'],
  ]) {
    assert.match(fs.readFileSync(path.join(KIT_ROOT, ...file), 'utf8'), /gate run <(test\|lint\|build|name)>/, file.join('/'));
  }
});
