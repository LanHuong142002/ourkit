const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { reportRequired } = require('../src/report');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const REPORT = '## Summary\n\none\ntwo\nthree\nfour\nfive\n\n## Details\n\nMore.\n';
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const writeReport = (content) => {
  const file = path.join(project, ourkit('gate', 'path', 'report').stdout.trim());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const problems = () => JSON.parse(ourkit('gate', 'artifact', 'report').stdout).problems || [];
const log = () => fs.readFileSync(path.join(project, '.ourkit', 'project-log.md'), 'utf8').replace(/\r\n/g, '\n');

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-report-'));
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

for (const [record, expected] of [
  [{ tier: 'feature' }, true],
  [{ tier: 'epic' }, true],
  [{ tier: 'patch' }, false],
  [{ tier: 'feature', flow: 'bug-fix' }, false],
  [{ tier: 'feature', flow: 'bug-fix', sensitiveAreas: ['auth'] }, true],
]) {
  test(`a Change Report for ${JSON.stringify(record)}: ${expected}`, () => {
    assert.strictEqual(reportRequired(record), expected);
  });
}

test('accepts a five-line Summary with details, and Windows line endings', () => {
  writeReport(REPORT);
  assert.deepStrictEqual(problems(), []);
  writeReport(REPORT.replace(/\n/g, '\r\n'));
  assert.deepStrictEqual(problems(), []);
});

for (const [label, content, pattern] of [
  ['too few Summary lines', '## Summary\n\none\n\n## Details\n\nMore.\n', /exactly 5 lines, and it has 1/],
  ['too many Summary lines', '## Summary\n\n1\n2\n3\n4\n5\n6\n\n## Details\n\nMore.\n', /exactly 5 lines, and it has 6/],
  ['no Details', '## Summary\n\n1\n2\n3\n4\n5\n', /"Details" section is missing/],
]) {
  test(`rejects a report with ${label}`, () => {
    writeReport(content);
    assert.match(problems()[0], pattern);
  });
}

test('the Ship Gate requires a Change Report for a Feature', () => {
  const output = JSON.parse(ourkit('gate', 'ship').stdout);
  assert.ok(output.problems.some((problem) => /^Change Report: .*doesn't exist yet/.test(problem)));
});

test('the first log line creates the Project Log, with one line per change', () => {
  assert.strictEqual(ourkit('log', 'add', 'Export reports', 'Users can export a report.', 'https://example.com/pr/1').status, 0);
  ourkit('log', 'add', 'Second', 'Another.', 'https://example.com/pr/2');
  const lines = log().split('\n').filter((line) => /^\| \d{4}-/.test(line));
  assert.strictEqual(lines.length, 2);
  assert.match(lines[0], /^\| \d{4}-\d{2}-\d{2} \| Export reports \| feature \| Users can export a report\. \| https:\/\/example\.com\/pr\/1 \|$/);
  assert.strictEqual(log().match(/# Project Log/g).length, 1);
});

test('a log line stays one table row', () => {
  ourkit('log', 'add', 'A | B', 'Two\nlines', 'link');
  assert.match(log(), /\| A \\\| B \| feature \| Two lines \| link \|/);
});

test('a Patch gets no Project Log line', () => {
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  const result = ourkit('log', 'add', 'Name', 'Summary.', 'link');
  assert.strictEqual(result.status, 1);
  assert.ok(!fs.existsSync(path.join(project, '.ourkit', 'project-log.md')));
});

test('log needs all three values', () => {
  assert.strictEqual(ourkit('log', 'add', 'Name', 'Summary.').status, 2);
  assert.strictEqual(ourkit('log').status, 2);
});

test('the Stage writes the report before the Gate and the log after the PR', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-ship', 'SKILL.md'), 'utf8');
  const order = ['Write the Change Report', 'ourkit gate ship', 'open the PR', 'ourkit log add'].map((text) => stage.indexOf(text));
  assert.ok(order.every((position) => position >= 0), JSON.stringify(order));
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b));
});
