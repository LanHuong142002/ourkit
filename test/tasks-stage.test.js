const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseTasks } = require('../src/artifacts');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let project;

const task = (id, dependsOn = 'none', verify = 'A test passes') =>
  `### ${id}. Task number ${id}\n\nDo the thing.\n\nDepends on: ${dependsOn}\nVerify: ${verify}\n`;
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
const problems = () => {
  const result = ourkit('gate', 'artifact', 'tasks');
  return JSON.parse(result.stdout).problems || [];
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-tasks-'));
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

test('parses tasks with their dependencies', () => {
  assert.deepStrictEqual(parseTasks(`${task(1)}\n${task(2, '1')}\n${task(3, '1, 2')}`), [
    { id: 1, title: 'Task number 1', dependsOn: [], verify: 'A test passes' },
    { id: 2, title: 'Task number 2', dependsOn: [1], verify: 'A test passes' },
    { id: 3, title: 'Task number 3', dependsOn: [1, 2], verify: 'A test passes' },
  ]);
});

test('accepts a valid list, including independent tasks and Windows line endings', () => {
  writeTasks(`${task(1)}\n${task(2)}\n${task(3, '1, 2')}`.replace(/\n/g, '\r\n'));
  assert.deepStrictEqual(problems(), []);
  assert.strictEqual(ourkit('gate', 'artifact', 'tasks').status, 0);
});

for (const [label, content, pattern] of [
  ['no tasks', 'Just some text.\n', /no tasks/],
  ['no dependency line', '### 1. Title\n\nVerify: x\n', /needs a "Depends on:" line/],
  ['no verify line', '### 1. Title\n\nDepends on: none\n', /needs a "Verify:" line/],
  ['an empty verify line', task(1, 'none', ''), /needs a "Verify:" line/],
  ['no title', '### 1.\n\nDepends on: none\nVerify: x\n', /has no title/],
  ['a repeated number', `${task(1)}${task(1)}`, /numbers repeat: 1/],
  ['an unknown dependency', task(1, '9'), /depends on task 9, which doesn't exist/],
  ['a task that depends on itself', task(1, '1'), /circle: 1 -> 1/],
  ['a circle of tasks', `${task(1, '2')}${task(2, '3')}${task(3, '1')}`, /circle: 1 -> 2 -> 3 -> 1/],
]) {
  test(`reports ${label}`, () => {
    writeTasks(content);
    const found = problems();
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.match(found[0], pattern);
  });
}

test('a shared dependency is not a circle', () => {
  writeTasks(`${task(1)}${task(2, '1')}${task(3, '1')}${task(4, '2, 3')}`);
  assert.deepStrictEqual(problems(), []);
});

test('the Stage checks approval first and explains independence', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-tasks', 'SKILL.md'), 'utf8');
  for (const required of ['ourkit gate approval', 'Depends on:', 'Verify:', 'ourkit gate artifact tasks', 'independent']) {
    assert.ok(stage.includes(required), required);
  }
});
