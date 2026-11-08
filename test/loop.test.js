const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { budgetLeft, parseSession } = require('../src/loop');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
// Outside test/, because the test runner would otherwise run it as a test.
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
const state = () => JSON.parse(loop('status').stdout);
const sessions = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split(/\r?\n/).filter(Boolean) : []);
const onBranch = (branch, file) => spawnSync('git', ['cat-file', '-e', `${branch}:${file}`], { cwd: project }).status === 0;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-loop-'));
  logFile = path.join(os.tmpdir(), `ourkit-loop-log-${path.basename(project)}.txt`);
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(logFile, { force: true });
});

test('a Loop Run will not start without a Budget', () => {
  const result = loop('run', 't1');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /needs a Budget.*ADR 0009/);
  assert.deepStrictEqual(sessions(), []);
  assert.strictEqual(state(), null);
});

test('rejects a Budget that is not a positive number', () => {
  assert.strictEqual(loop('run', '--hours', '0', 't1').status, 2);
  assert.strictEqual(loop('run', '--tokens', 'lots', 't1').status, 2);
});

test('runs each ticket in its own session, and each on its own branch', () => {
  const result = loop('run', '--hours', '1', 't1', 't2');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.deepStrictEqual(sessions(), ['t1', 't2']);
  assert.strictEqual(state().stopped, 'done');
  assert.deepStrictEqual(state().queue, []);
  assert.strictEqual(git('branch', '--show-current'), 'main');
  assert.ok(onBranch('ticket-t1', 'work-t1.txt'));
  assert.ok(!onBranch('ticket-t2', 'work-t1.txt'), 'each ticket branches from main');
});

test('keeps a five-line summary and the outcome of each ticket', () => {
  loop('run', '--hours', '1', 't1');
  const [result] = state().results;
  assert.strictEqual(result.outcome, 'shipped');
  assert.strictEqual(result.summary.split('\n').length, 5);
  assert.ok(result.summary.startsWith('two about t1'));
  assert.ok(result.summary.endsWith('six about t1'));
});

test('only Lessons carry from one ticket to the next', () => {
  loop('run', '--hours', '1', 't1', 't2');
  const lessons = git('show', 'ticket-t2:.ourkit/lessons.md');
  assert.match(lessons, /Learned from t1/);
  assert.match(lessons, /Learned from t2/);
  assert.ok(!onBranch('ticket-t2', 'work-t1.txt'));
});

test('stops at the token Budget, counting input, output and cache writes only', () => {
  const result = loop('run', '--tokens', '200', 't1', 't2', 't3');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.deepStrictEqual(sessions(), ['t1', 't2']);
  const { stopped, queue, usedTokens } = state();
  assert.strictEqual(stopped, 'budget');
  assert.deepStrictEqual(queue, ['t3']);
  assert.strictEqual(usedTokens, 300);
});

test('stops a session that runs past the hours Budget, killing it rather than waiting', () => {
  const started = Date.now();
  const result = loop('run', '--hours', '0.0005', 'hang', 't2');
  assert.ok(Date.now() - started < 30000, 'the 60-second session must not be waited for');
  assert.strictEqual(state().stopped, 'budget');
  assert.deepStrictEqual(sessions(), ['hang']);
  assert.ok(result.status === 0, result.stderr);
});

test('a stopped ticket does not end the run, and its work is saved on its branch', () => {
  loop('run', '--hours', '1', 'stopped-1', 't2');
  assert.deepStrictEqual(sessions(), ['stopped-1', 't2']);
  assert.strictEqual(state().results[0].outcome, 'stopped');
  assert.ok(onBranch('ticket-stopped-1', 'half-done.txt'));
  assert.ok(!onBranch('ticket-t2', 'half-done.txt'));
  assert.strictEqual(state().stopped, 'done');
});

test('ends as all-blocked when nothing shipped', () => {
  loop('run', '--hours', '1', 'blocked-1', 'stopped-2');
  assert.strictEqual(state().stopped, 'all-blocked');
});

for (const failure of ['crash', 'error']) {
  test(`a session that fails (${failure}) stops the run and keeps the ticket queued`, () => {
    const result = loop('run', '--hours', '1', failure, 't2');
    assert.strictEqual(result.status, 1);
    const { stopped, queue, results } = state();
    assert.strictEqual(stopped, 'session-failed');
    assert.deepStrictEqual(queue, [failure, 't2']);
    assert.deepStrictEqual(results, []);
    assert.deepStrictEqual(sessions(), [failure]);
  });
}

test('continuing a run picks up the queue with the same Budget', () => {
  loop('run', '--tokens', '100', 't1', 't2');
  assert.strictEqual(state().stopped, 'budget');
  const continued = spawnSync(process.execPath, ['-e', `
    const fs = require('fs');
    const loop = JSON.parse(fs.readFileSync('.ourkit/loop.json', 'utf8'));
    loop.budget.tokens = 1000;
    fs.writeFileSync('.ourkit/loop.json', JSON.stringify(loop));
  `], { cwd: project });
  assert.strictEqual(continued.status, 0);
  assert.strictEqual(loop('run').status, 0);
  assert.deepStrictEqual(sessions(), ['t1', 't2']);
  assert.strictEqual(state().stopped, 'done');
});

test('stops when a session leaves uncommitted work on the default branch', () => {
  const result = loop('run', '--hours', '1', 'dirtymain', 't2');
  assert.strictEqual(result.status, 1);
  assert.strictEqual(state().stopped, 'dirty-tree');
  assert.deepStrictEqual(sessions(), ['dirtymain']);
  const [stopped] = state().results;
  assert.strictEqual(stopped.outcome, 'blocked', 'the session said how it ended');
  assert.match(stopped.summary, /left uncommitted work/);
  assert.match(stopped.summary, /six about dirtymain/);
});

test('a setup step recorded on the default branch does not stop the run, and stays for the user', () => {
  const result = loop('run', '--hours', '1', 'needssetup', 't2');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.deepStrictEqual(sessions(), ['needssetup', 't2']);
  assert.match(fs.readFileSync(path.join(project, '.ourkit', 'pending.json'), 'utf8'), /Install a tool/);
});

test('a result line that is missing counts as unknown, never as shipped', () => {
  loop('run', '--hours', '1', 'noresult');
  assert.strictEqual(state().results[0].outcome, 'unknown');
  assert.strictEqual(state().stopped, 'all-blocked');
});

test('refuses to start from another branch, with dirty work, or over a queue', () => {
  git('switch', '-q', '-c', 'elsewhere');
  assert.match(loop('run', '--hours', '1', 't1').stderr, /start a Loop Run from main/);
  git('switch', '-q', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'edited');
  assert.match(loop('run', '--hours', '1', 't1').stderr, /commit or stash/);
  git('checkout', '-q', '--', 'a.txt');
  assert.deepStrictEqual(sessions(), []);

  loop('run', '--tokens', '100', 't1', 't2');
  const again = loop('run', '--hours', '1', 't9');
  assert.strictEqual(again.status, 1);
  assert.match(again.stderr, /still has tickets queued/);
});

test('the run\'s state stays out of git on every branch', () => {
  loop('run', '--hours', '1', 'stopped-1', 't2');
  assert.ok(!onBranch('ticket-stopped-1', '.ourkit/loop.json'));
  assert.ok(!onBranch('ticket-t2', '.ourkit/loop.json'));
  assert.strictEqual(git('ls-files', '.ourkit/loop.json'), '');
  assert.strictEqual(state().results.length, 2);
});

test('needs tickets when there is nothing to continue', () => {
  assert.strictEqual(loop('run').status, 2);
  assert.strictEqual(loop('nonsense').status, 2);
});

test('parses a session result', () => {
  const parsed = parseSession(JSON.stringify({
    result: 'a\nb\nOURKIT-RESULT: stopped',
    usage: { input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: 100 },
  }));
  assert.strictEqual(parsed.outcome, 'stopped');
  assert.strictEqual(parsed.tokens, 6);
  assert.strictEqual(parsed.summary, 'a\nb');
  assert.strictEqual(parseSession('not json').isError, true);
  assert.strictEqual(parseSession(JSON.stringify({ result: 'OURKIT-RESULT: anything' })).outcome, 'unknown');
});

test('the Budget ends at whichever limit runs out first', () => {
  const base = { usedMs: 0, usedTokens: 0 };
  assert.strictEqual(budgetLeft({ ...base, budget: { hours: 1 } }), true);
  assert.strictEqual(budgetLeft({ ...base, usedMs: 3600000, budget: { hours: 1 } }), false);
  assert.strictEqual(budgetLeft({ ...base, usedTokens: 10, budget: { tokens: 10 } }), false);
  assert.strictEqual(budgetLeft({ ...base, usedTokens: 10, budget: { hours: 1, tokens: 10 } }), false);
});

test('session permissions deny merging and are installed with the kit', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'hosts/claude-code/session-settings.json'), 'utf8'));
  for (const denied of ['Bash(git merge*)', 'Bash(gh pr merge*)', 'Bash(git push --force*)', 'Bash(gh issue close*)']) {
    assert.ok(settings.permissions.deny.includes(denied), denied);
  }
  const target = path.join(project, 'installed');
  fs.mkdirSync(target);
  assert.strictEqual(spawnSync(process.execPath, [BIN, target, '--entry', 'greenfield', '--roles', 'none']).status, 0);
  assert.ok(fs.existsSync(path.join(target, '.ourkit/kit/host/session-settings.json')));
  assert.ok(fs.existsSync(path.join(target, '.ourkit/kit/host/shell.json')));
});

test('an Override of the session permissions takes effect on upgrade', () => {
  const target = path.join(project, 'installed');
  fs.mkdirSync(target);
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: target, encoding: 'utf8' });
  run('--entry', 'greenfield', '--roles', 'none');
  const override = path.join(target, '.ourkit/overrides/host/session-settings.json');
  fs.mkdirSync(path.dirname(override), { recursive: true });
  fs.writeFileSync(override, '{"permissions":{"allow":["Bash(make *)"]}}');
  const upgraded = run('upgrade');
  assert.strictEqual(upgraded.status, 0, upgraded.stderr);
  assert.match(fs.readFileSync(path.join(target, '.ourkit/kit/host/session-settings.json'), 'utf8'), /make/);
  assert.strictEqual(run('check', '--project').status, 0);
  assert.strictEqual(run('upgrade').status, 0, 'a second upgrade sees no hand edit');
});

test('session permissions cover every form of pushing to the default branch', () => {
  const { deny } = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'hosts/claude-code/session-settings.json'), 'utf8')).permissions;
  for (const rule of ['git push -u origin main*', 'git push -u origin master*', 'git push *:main*', 'git push *:master*', 'gh api *merge*']) {
    assert.ok(deny.includes(`Bash(${rule})`), rule);
  }
});

test('ourkit --help lists the commands instead of treating the flag as a folder', () => {
  const result = spawnSync(process.execPath, [BIN, '--help'], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /usage:/);
  assert.match(result.stdout, /\bloop\b/);
  assert.ok(!fs.existsSync(path.join(project, '.ourkit')));
});

test('a blocking finding gets at most two fix attempts', () => {
  const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
  git('switch', '-q', '-c', 'my-change');
  ourkit('review', 'add', 'blocking', 'wrong');
  assert.strictEqual(ourkit('review', 'attempt', '1').status, 0);
  assert.strictEqual(ourkit('review', 'attempt', '1').status, 0);
  const third = ourkit('review', 'attempt', '1');
  assert.strictEqual(third.status, 1);
  assert.match(third.stderr, /ADR 0009/);
  assert.strictEqual(ourkit('review', 'attempt', '9').status, 1);
});

test('a run killed mid-session saves the ticket\'s work, and the next run carries on from its branch', () => {
  loop('run', '--hours', '1', 'stopped-1');
  // What a killed run leaves behind: the session's branch checked out, its work uncommitted, the ticket still queued.
  git('switch', '-q', '-c', 'ticket-t1');
  fs.writeFileSync(path.join(project, 'half-done.txt'), 'keep me');
  const file = path.join(project, '.ourkit', 'loop.json');
  fs.writeFileSync(file, JSON.stringify({ ...state(), queue: ['t1'], running: 't1', stopped: null }));

  const result = loop('run');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /stopped during t1, so its work is saved on ticket-t1/);
  assert.deepStrictEqual(sessions(), ['stopped-1', 't1', 'resumed ticket-t1']);
  assert.ok(onBranch('ticket-t1', 'half-done.txt'), 'the killed session\'s work was kept');
  assert.ok(onBranch('ticket-t1', 'work-t1.txt'), 'the next session finished on the same branch');
  assert.strictEqual(git('branch', '--show-current'), 'main');
  assert.strictEqual(state().running, undefined);
  assert.strictEqual(state().resume, undefined);
});

test('a ticket kept queued after its session fails carries on from its branch next time', () => {
  loop('run', '--hours', '1', 'flaky', 't2');
  const queued = state();
  assert.strictEqual(queued.stopped, 'waiting-for-limit');
  assert.deepStrictEqual(queued.queue, ['flaky', 't2']);
  assert.deepStrictEqual(queued.resume, { item: 'flaky', branch: 'ticket-flaky' });
  assert.strictEqual(queued.running, undefined, 'a session that ended is not left marked as running');

  assert.strictEqual(loop('run').status, 0);
  assert.deepStrictEqual(sessions(), ['flaky', 'flaky', 'resumed ticket-flaky', 't2']);
  assert.ok(onBranch('ticket-flaky', 'half-done.txt'));
  assert.ok(onBranch('ticket-flaky', 'work-flaky.txt'));
  assert.ok(!onBranch('ticket-t2', 'half-done.txt'));
});
