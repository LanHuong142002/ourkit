const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decide } = require('../src/gate');

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
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const gate = (...args) => {
  const result = ourkit('gate', ...args);
  return { status: result.status, stderr: result.stderr, json: result.stdout ? JSON.parse(result.stdout) : null };
};
const profile = (commands) => write('.ourkit/stack-profile.json', JSON.stringify({ technologies: [], commands }));
const PASS = 'node -e "process.exit(0)"';
const FAIL = 'node -e "console.log(\'broke here\');process.exit(3)"';

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-gate-'));
  git('init', '-q', '-b', 'main');
  commit('old.txt');
  git('switch', '-q', '-c', 'my-change');
  write('new.txt');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

for (const [record, status, severity, action] of [
  [{ tier: 'feature' }, 'fail', 'block', 'ask-user'],
  [{ tier: 'feature', mode: 'hands-off' }, 'fail', 'block', 'fix-or-stop'],
  [{ tier: 'epic' }, 'fail', 'block', 'ask-user'],
  [{ tier: 'patch' }, 'fail', 'remind', 'mention'],
  [{ tier: 'patch', mode: 'hands-off' }, 'fail', 'remind', 'log-decision'],
  [{ tier: 'patch', sensitiveAreas: ['auth'] }, 'fail', 'block', 'ask-user'],
  [{ tier: 'feature' }, 'not-run', 'remind', 'mention'],
  [{ tier: 'feature', mode: 'hands-off' }, 'not-run', 'remind', 'log-decision'],
  [{ tier: 'feature' }, 'pass', 'none', 'continue'],
]) {
  test(`${JSON.stringify(record)} with ${status} is ${severity}, ${action}`, () => {
    assert.deepStrictEqual(decide(record, status), { severity, action });
  });
}

test('a failing command blocks a Feature and shows the end of its output', () => {
  profile({ test: FAIL });
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  const { status, json } = gate('run', 'test');
  assert.strictEqual(status, 1);
  assert.strictEqual(json.status, 'fail');
  assert.strictEqual(json.action, 'ask-user');
  assert.match(json.output, /broke here/);
});

test('a passing command shows its output too, so a report can quote real results', () => {
  profile({ test: 'node -e "console.log(\'tests 3, pass 3\')"' });
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  const { status, json } = gate('run', 'test');
  assert.strictEqual(status, 0);
  assert.strictEqual(json.status, 'pass');
  assert.match(json.output, /tests 3, pass 3/);
});

test('a failing command only reminds on a Patch', () => {
  profile({ lint: FAIL });
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  const { status, json } = gate('run', 'lint');
  assert.strictEqual(status, 0);
  assert.strictEqual(json.status, 'fail');
  assert.strictEqual(json.severity, 'remind');
});

test('a passing command continues', () => {
  profile({ build: PASS });
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  const { status, json } = gate('run', 'build');
  assert.strictEqual(status, 0);
  assert.strictEqual(json.action, 'continue');
});

for (const [label, arrange, reason] of [
  ['no Stack Profile', () => {}, 'no-profile'],
  ['an undeclared command', () => profile({}), 'not-declared'],
  ['a command the project has none of', () => profile({ test: null }), 'none'],
]) {
  test(`${label} is reported as not run, never as passed`, () => {
    arrange();
    ourkit('tier', 'set', 'feature', '--reason', 'r');
    const { status, json } = gate('run', 'test');
    assert.strictEqual(status, 0);
    assert.strictEqual(json.status, 'not-run');
    assert.strictEqual(json.reason, reason);
    assert.strictEqual(json.severity, 'remind');
  });
}

test('an invalid Stack Profile stops the Gate', () => {
  write('.ourkit/stack-profile.json', '{ nope');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  const result = ourkit('gate', 'run', 'test');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /valid JSON/);
});

test('a Gate needs a Tier first', () => {
  profile({ test: PASS });
  const result = ourkit('gate', 'run', 'test');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /set a Tier first/);
});

for (const name of ['deploy', 'run', 'smoke']) {
  test(`a Gate refuses to run ${name}`, () => {
    profile({ [name]: PASS });
    ourkit('tier', 'set', 'feature', '--reason', 'r');
    assert.strictEqual(ourkit('gate', 'run', name).status, 2);
  });
}

test('with no Baseline, as in Greenfield, scope is the whole change', () => {
  const { json } = gate('scope');
  assert.strictEqual(json.baselined, false);
  assert.deepStrictEqual(json.files, ['new.txt']);
});

test('a branch started after the Baseline keeps its own base', () => {
  fs.rmSync(path.join(project, 'new.txt'));
  git('switch', '-q', 'main');
  write('.ourkit/baseline.json', JSON.stringify({ commit: git('rev-parse', 'HEAD') }));
  git('switch', '-q', '-c', 'later');
  commit('later.txt');
  const { json } = gate('scope');
  assert.deepStrictEqual(json.files, ['later.txt']);
});

test('a branch started before the Baseline never judges pre-Baseline work', () => {
  commit('before-baseline.txt');
  write('.ourkit/baseline.json', JSON.stringify({ commit: git('rev-parse', 'HEAD') }));
  commit('after-baseline.txt');
  const { json } = gate('scope');
  assert.strictEqual(json.baselined, true);
  assert.ok(json.files.includes('after-baseline.txt'));
  assert.ok(!json.files.includes('before-baseline.txt'));
  assert.strictEqual(json.base, JSON.parse(fs.readFileSync(path.join(project, '.ourkit/baseline.json'), 'utf8')).commit);
});

test('with a Baseline at the first commit and no branch, old code stays out of scope', () => {
  git('switch', '-q', 'main');
  write('.ourkit/baseline.json', JSON.stringify({ commit: git('rev-parse', 'HEAD') }));
  const { json } = gate('scope');
  assert.strictEqual(json.baselined, true);
  assert.deepStrictEqual(json.files, ['new.txt']);
});

test('the floor catches a Patch that grew into a Sensitive Area', () => {
  ourkit('tier', 'set', 'patch', '--reason', 'small');
  assert.strictEqual(gate('floor').status, 0);
  write('src/auth/login.txt');
  const { status, json } = gate('floor');
  assert.strictEqual(status, 1);
  assert.match(json.reason, /can't stay a Patch/);
  assert.strictEqual(json.severity, 'block');
});

test('the floor passes a Feature touching a Sensitive Area', () => {
  write('src/auth/login.txt');
  ourkit('tier', 'set', 'feature', '--reason', 'r', '--sensitive', 'auth');
  assert.strictEqual(gate('floor').status, 0);
});
