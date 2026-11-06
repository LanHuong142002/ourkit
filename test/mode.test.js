const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'ourkit.js');
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const run = (subcommand, ...args) => spawnSync(process.execPath, [BIN, subcommand, ...args], { cwd: project, encoding: 'utf8' });
const list = (subcommand, ...args) => JSON.parse(run(subcommand, 'list', ...args).stdout);

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-mode-'));
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('switch', '-q', '-c', 'my-change');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('the default Mode is Pair', () => {
  assert.strictEqual(run('mode').stdout.trim(), 'pair');
});

test('sets Hands-off and back', () => {
  assert.strictEqual(run('mode', 'hands-off').status, 0);
  assert.strictEqual(run('mode').stdout.trim(), 'hands-off');
  run('mode', 'pair');
  assert.strictEqual(run('mode').stdout.trim(), 'pair');
});

test('rejects an unknown Mode and keeps the current one', () => {
  run('mode', 'hands-off');
  assert.strictEqual(run('mode', 'autopilot').status, 2);
  assert.strictEqual(run('mode').stdout.trim(), 'hands-off');
});

test('Mode belongs to one change', () => {
  run('mode', 'hands-off');
  git('switch', '-q', '-c', 'other-change');
  assert.strictEqual(run('mode').stdout.trim(), 'pair');
});

test('Decision Log keeps each decision with its reason, in order', () => {
  run('decision', 'add', 'Use the existing date helper', '--why', 'It already handles time zones');
  run('decision', 'add', 'Keep the old name', '--why', 'Callers depend on it');
  assert.deepStrictEqual(list('decision'), [
    { id: 1, decision: 'Use the existing date helper', why: 'It already handles time zones' },
    { id: 2, decision: 'Keep the old name', why: 'Callers depend on it' },
  ]);
});

test('a decision needs a reason', () => {
  assert.strictEqual(run('decision', 'add', 'No reason').status, 2);
  assert.strictEqual(run('decision', 'add', 'Blank', '--why', ' ').status, 2);
  assert.deepStrictEqual(list('decision'), []);
});

test('Question Batch gathers questions and tracks answers', () => {
  run('question', 'add', 'Which plan should this apply to?');
  run('question', 'add', 'Should old links redirect?');
  assert.strictEqual(list('question', '--open').length, 2);
  assert.strictEqual(run('question', 'answer', '1', 'The paid plan').status, 0);
  assert.deepStrictEqual(list('question', '--open').map(({ id }) => id), [2]);
  assert.strictEqual(list('question')[0].answer, 'The paid plan');
});

test('rejects answers to unknown questions and bad usage', () => {
  assert.strictEqual(run('question', 'answer', '9', 'x').status, 1);
  assert.strictEqual(run('question', 'add').status, 2);
  assert.strictEqual(run('question', 'nonsense').status, 2);
});

test('records stay alongside the Tier of the same change', () => {
  run('tier', 'set', 'patch', '--reason', 'r');
  run('mode', 'hands-off');
  run('decision', 'add', 'd', '--why', 'w');
  const record = JSON.parse(run('tier', 'show').stdout);
  assert.strictEqual(record.tier, 'patch');
  assert.strictEqual(record.mode, 'hands-off');
  assert.strictEqual(record.decisions.length, 1);
});

test('outside a repository, every command explains why it can\'t run', () => {
  fs.rmSync(path.join(project, '.git'), { recursive: true, force: true });
  for (const subcommand of ['mode', 'decision', 'question']) {
    const result = run(subcommand, 'list');
    assert.strictEqual(result.status, 1, subcommand);
    assert.match(result.stderr, /no Active Change/);
  }
});
