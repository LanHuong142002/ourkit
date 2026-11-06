const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseSession } = require('../src/loop');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const FAKE = path.join(KIT_ROOT, 'test-support', 'fake-session.js');
let project;
let logFile;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const loop = (...args) => spawnSync(process.execPath, [BIN, 'loop', ...args], {
  cwd: project,
  encoding: 'utf8',
  env: { ...process.env, OURKIT_LOOP_COMMAND: `"${process.execPath}" "${FAKE}"`, FAKE_SESSION_LOG: logFile },
});
const state = () => JSON.parse(loop('status').stdout);
const sessions = () => fs.readFileSync(logFile, 'utf8').trim().split(/\r?\n/).filter(Boolean);

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-limit-'));
  logFile = path.join(os.tmpdir(), `ourkit-limit-log-${path.basename(project)}.txt`);
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(logFile, { force: true });
});

test('low usage changes nothing', () => {
  assert.strictEqual(loop('run', '--hours', '1', 'usagelow-1', 't2').status, 0);
  assert.deepStrictEqual(sessions(), ['usagelow-1', 't2']);
  assert.strictEqual(state().stopped, 'done');
});

test('near the limit, no new ticket starts, the user is warned, and the finished one counts', () => {
  const result = loop('run', '--hours', '1', 'usagehigh-1', 't2');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /warning: the five_hour usage limit is close/);
  assert.deepStrictEqual(sessions(), ['usagehigh-1']);
  const { stopped, queue, results, limit } = state();
  assert.strictEqual(stopped, 'waiting-for-limit');
  assert.deepStrictEqual(queue, ['t2']);
  assert.strictEqual(results[0].outcome, 'shipped');
  assert.strictEqual(limit.name, 'five_hour');
});

test('the Run Report says when to continue', () => {
  loop('run', '--hours', '1', 'usagehigh-1', 't2');
  const report = fs.readFileSync(path.join(project, '.ourkit/run-report.md'), 'utf8');
  assert.match(report, /\*\*Stopped:\*\* waiting-for-limit\./);
  assert.match(report, /the five_hour limit refreshes at .*Run `ourkit loop run` after that/);
});

test('continuing later picks up the queue', () => {
  loop('run', '--hours', '1', 'usagehigh-1', 't2');
  assert.strictEqual(loop('run').status, 0);
  assert.deepStrictEqual(sessions(), ['usagehigh-1', 't2']);
  assert.strictEqual(state().stopped, 'done');
});

test('with --wait, the run carries on by itself after the limit refreshes', () => {
  const result = loop('run', '--hours', '1', '--wait', 'usagesoon-1', 't2');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /limit has refreshed/);
  assert.deepStrictEqual(sessions(), ['usagesoon-1', 't2']);
  assert.strictEqual(state().stopped, 'done');
});

test('--wait does not sit for a limit that is many hours away', () => {
  const started = Date.now();
  loop('run', '--hours', '1', '--wait', 'usagefar-1', 't2');
  assert.ok(Date.now() - started < 30000);
  assert.strictEqual(state().stopped, 'waiting-for-limit');
  assert.deepStrictEqual(state().queue, ['t2']);
});

test('a session refused at the limit keeps its ticket queued', () => {
  loop('run', '--hours', '1', 'usagerefused-1', 't2');
  const { stopped, queue, results } = state();
  assert.strictEqual(stopped, 'waiting-for-limit');
  assert.deepStrictEqual(queue, ['usagerefused-1', 't2']);
  assert.deepStrictEqual(results, []);
});

test('the last ticket finishing near the limit just ends the run', () => {
  loop('run', '--hours', '1', 'usagehigh-1');
  assert.strictEqual(state().stopped, 'done');
});

test('a Host that reports no usage works as before', () => {
  assert.strictEqual(loop('run', '--hours', '1', 't1', 't2').status, 0);
  assert.strictEqual(state().stopped, 'done');
  assert.strictEqual(state().limit, undefined);
});

test('parses the real shape of the Host\'s stream', () => {
  const resetsAt = 1794015000;
  const stream = [
    JSON.stringify({ type: 'system', subtype: 'init' }),
    JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 0.17, resetsAt, status: 'allowed' }, seven_day: { utilization: 0.92, resetsAt: resetsAt + 5, status: 'allowed' } } } }),
    'some text that is not an event',
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'a\nOURKIT-RESULT: shipped', usage: { input_tokens: 1, output_tokens: 2 } }),
  ].join('\n');
  const parsed = parseSession(stream);
  assert.strictEqual(parsed.outcome, 'shipped');
  assert.strictEqual(parsed.tokens, 3);
  assert.strictEqual(parsed.isError, false);
  assert.deepStrictEqual(parsed.limit, { name: 'seven_day', utilization: 0.92, resetsAt: resetsAt + 5 });
});

test('below the threshold there is no limit to act on', () => {
  const stream = JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.89, resetsAt: 1, status: 'allowed' } } } });
  assert.strictEqual(parseSession(stream).limit, null);
});

test('the Host Shell declares it reports usage, using the stream', () => {
  const { session } = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'hosts/claude-code/shell.json'), 'utf8'));
  assert.strictEqual(session.reportsUsage, true);
  assert.ok(session.args.includes('stream-json'));
  assert.ok(session.args.includes('--verbose'));
});
