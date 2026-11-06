const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { activeChange } = require('../src/active-change');

const BIN = path.join(__dirname, '..', 'bin', 'ourkit.js');
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const write = (name, content = 'x') => {
  fs.mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
  fs.writeFileSync(path.join(project, name), content);
};
const commit = (name) => {
  write(name);
  git('add', '-A');
  git('commit', '-q', '-m', name);
};
const initMain = () => {
  git('init', '-q', '-b', 'main');
  commit('first.txt');
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-active-'));
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('a feature branch is the change since it left the default branch', () => {
  initMain();
  const base = git('rev-parse', 'HEAD');
  git('switch', '-q', '-c', 'my-feature');
  commit('a.txt');
  commit('b.txt');
  const change = activeChange(project);
  assert.strictEqual(change.kind, 'branch');
  assert.strictEqual(change.id, 'my-feature');
  assert.strictEqual(change.base, base);
  assert.deepStrictEqual(change.files, ['a.txt', 'b.txt']);
});

test('a branch includes uncommitted and untracked work', () => {
  initMain();
  git('switch', '-q', '-c', 'my-feature');
  write('first.txt', 'edited');
  write('new.txt');
  assert.deepStrictEqual(activeChange(project).files, ['first.txt', 'new.txt']);
});

test('later commits on the default branch do not count toward a branch', () => {
  initMain();
  git('switch', '-q', '-c', 'my-feature');
  commit('mine.txt');
  git('switch', '-q', 'main');
  commit('theirs.txt');
  git('switch', '-q', 'my-feature');
  assert.deepStrictEqual(activeChange(project).files, ['mine.txt']);
});

test('with no branch, the change is uncommitted work plus the latest commit', () => {
  initMain();
  commit('latest.txt');
  write('uncommitted.txt');
  const change = activeChange(project);
  assert.strictEqual(change.kind, 'worktree');
  assert.deepStrictEqual(change.files, ['latest.txt', 'uncommitted.txt']);
  assert.ok(!change.files.includes('first.txt'));
});

test('the first commit is the change when it has no parent', () => {
  initMain();
  assert.deepStrictEqual(activeChange(project).files, ['first.txt']);
});

test('a repository with no commits uses its untracked work', () => {
  git('init', '-q', '-b', 'main');
  write('draft.txt');
  const change = activeChange(project);
  assert.deepStrictEqual(change.files, ['draft.txt']);
  assert.strictEqual(change.id, 'worktree-initial');
});

test('kit folders are not part of the change', () => {
  initMain();
  git('switch', '-q', '-c', 'my-feature');
  write('.ourkit/kit/core/a.md');
  write('.claude/skills/x/SKILL.md');
  write('real.txt');
  assert.deepStrictEqual(activeChange(project).files, ['real.txt']);
});

test('respects ignored files', () => {
  initMain();
  git('switch', '-q', '-c', 'my-feature');
  write('.gitignore', 'ignored.txt\n');
  write('ignored.txt');
  assert.deepStrictEqual(activeChange(project).files, ['.gitignore']);
});

test('reports file names with non-ASCII characters plainly', () => {
  initMain();
  git('switch', '-q', '-c', 'my-feature');
  commit('báo-cáo.txt');
  assert.deepStrictEqual(activeChange(project).files, ['báo-cáo.txt']);
});

test('explains when there is no Active Change', () => {
  assert.match(activeChange(project).error, /not a git repository/);
  git('init', '-q', '-b', 'main');
  assert.match(activeChange(project).error, /nothing has changed/);
});

test('command prints JSON, or a reason with exit 1', () => {
  const run = () => spawnSync(process.execPath, [BIN, 'active-change', project], { encoding: 'utf8' });
  assert.strictEqual(run().status, 1);
  assert.match(run().stderr, /no Active Change/);
  initMain();
  const ok = run();
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.strictEqual(JSON.parse(ok.stdout).kind, 'worktree');
});
