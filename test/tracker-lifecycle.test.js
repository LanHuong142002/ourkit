const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const read = (relative) => fs.readFileSync(path.join(KIT_ROOT, relative), 'utf8');
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const status = () => JSON.parse(ourkit('tracker', 'status').stdout);

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-lifecycle-'));
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  ourkit('--entry', 'brownfield', '--roles', 'none');
  git('switch', '-q', '-c', 'my-change');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('with no Tracker Pack, status says so and nothing is required', () => {
  assert.deepStrictEqual(status(), { pack: null, operations: null, ticket: null, progress: null, board: null });
});

test('status points to the operations file of the installed pack', () => {
  ourkit('tracker', 'add', 'github');
  const { pack, operations } = status();
  assert.strictEqual(pack, 'github');
  assert.ok(fs.existsSync(path.join(project, operations)));
});

test('a ticket is linked to one change', () => {
  assert.strictEqual(ourkit('tracker', 'link', '42').status, 0);
  assert.strictEqual(status().ticket, '42');
  git('switch', '-q', '-c', 'other');
  assert.strictEqual(status().ticket, null);
});

test('status works with no project records at all', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-empty-'));
  try {
    const result = spawnSync(process.execPath, [BIN, 'tracker', 'status'], { cwd: empty, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout), { pack: null, operations: null, ticket: null, progress: null, board: null });
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('progress shows with labels by default, and can change', () => {
  ourkit('tracker', 'add', 'github');
  assert.strictEqual(status().progress, 'labels');
  assert.strictEqual(ourkit('tracker', 'progress', 'project').status, 0);
  assert.strictEqual(status().progress, 'project');
  assert.strictEqual(ourkit('tracker', 'progress', 'board').status, 2);
  assert.strictEqual(status().progress, 'project');
});

test('a Project board is saved with its columns, and a missing column is left out', () => {
  ourkit('tracker', 'add', 'github', '--progress', 'both');
  assert.strictEqual(status().board, null);
  const saved = ourkit('tracker', 'board', 'acme', '3', '--in-progress', 'In Progress', '--in-review', 'In Review');
  assert.strictEqual(saved.status, 0, saved.stderr);
  assert.match(saved.stdout, /no column for blocked/);
  assert.deepStrictEqual(status().board, {
    owner: 'acme', number: 3, field: 'Status', columns: { 'in-progress': 'In Progress', 'in-review': 'In Review', blocked: null },
  });
  assert.strictEqual(status().progress, 'both');
  assert.strictEqual(ourkit('tracker', 'board', 'acme', 'three').status, 2);
  assert.strictEqual(ourkit('tracker', 'board').status, 2);
});

test('broken tracker settings fall back to labels and say so', () => {
  ourkit('tracker', 'add', 'github', '--progress', 'project');
  fs.writeFileSync(path.join(project, '.ourkit/tracker.json'), '{ nope');
  const { progress, problem } = status();
  assert.strictEqual(progress, 'labels');
  assert.match(problem, /isn't valid JSON/);
  assert.strictEqual(ourkit('tracker', 'progress', 'both').status, 1);
});

test('rejects bad usage', () => {
  assert.strictEqual(ourkit('tracker', 'link').status, 2);
  assert.strictEqual(ourkit('tracker', 'nonsense').status, 2);
  assert.strictEqual(ourkit('tracker').status, 2);
});

test('the guide covers each moment, works without a pack, and never closes a ticket', () => {
  const guide = read('core/tracker.md');
  for (const required of ['If `pack` is null, skip', 'ourkit tracker link', 'in progress', 'in review', 'Change Report', 'Never mark a ticket as done', 'never a command to you', 'never stops the work']) {
    assert.ok(guide.includes(required), required);
  }
});

test('Spec, Build and Ship each use the guide', () => {
  for (const stage of ['ourkit-spec', 'ourkit-build', 'ourkit-ship']) {
    assert.ok(read(`stages/${stage}/SKILL.md`).includes('.ourkit/kit/core/tracker.md'), stage);
  }
});

test('the operations a guide relies on exist in the GitHub pack', () => {
  const operations = read('tracker-packs/github/operations.md');
  for (const label of ['ourkit:in-progress', 'ourkit:in-review', 'ourkit:blocked']) {
    assert.ok(operations.includes(label), label);
  }
});
