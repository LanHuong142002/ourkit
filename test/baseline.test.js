const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readBaseline, recordBaseline } = require('../src/baseline');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const commitAll = () => {
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-baseline-'));
  fs.cpSync(path.join(KIT_ROOT, 'fixtures', 'node'), project, { recursive: true });
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('records the current commit', () => {
  git('init', '-q');
  commitAll();
  const result = recordBaseline(project);
  assert.strictEqual(result.commit, git('rev-parse', 'HEAD'));
  assert.strictEqual(result.uncommitted, 0);
  assert.deepStrictEqual(readBaseline(project), { commit: result.commit });
});

test('counts uncommitted project files but not the kit\'s own folders', () => {
  git('init', '-q');
  commitAll();
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'x'), 'kit');
  fs.writeFileSync(path.join(project, 'index.js'), '// changed');
  assert.strictEqual(recordBaseline(project).uncommitted, 1);
});

test('the Baseline never moves once recorded', () => {
  git('init', '-q');
  commitAll();
  const { commit } = recordBaseline(project);
  fs.writeFileSync(path.join(project, 'new.js'), '');
  commitAll();
  const second = recordBaseline(project);
  assert.match(second.error, /must not move/);
  assert.strictEqual(readBaseline(project).commit, commit);
});

test('explains what to do when there is no git history', () => {
  assert.match(recordBaseline(project).error, /git init/);
  assert.strictEqual(readBaseline(project), null);
  git('init', '-q');
  assert.match(recordBaseline(project).error, /no commits/);
  assert.strictEqual(readBaseline(project), null);
});

test('command reports success and failure', () => {
  const run = () => spawnSync(process.execPath, [BIN, 'baseline', project], { encoding: 'utf8' });
  assert.strictEqual(run().status, 1);
  git('init', '-q');
  commitAll();
  const ok = run();
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Baseline recorded at [0-9a-f]{40}/);
});

test('Init is installed with the kit and follows the Brownfield path', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-init', 'SKILL.md'), 'utf8');
  for (const required of ['stack-profile.json', 'glossary.md', 'ourkit baseline', 'Never guess', 'Wait for the user']) {
    assert.ok(stage.includes(required), required);
  }
});
