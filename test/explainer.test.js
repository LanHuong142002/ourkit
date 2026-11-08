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
const reportPath = () => path.join(project, ourkit('gate', 'path', 'report').stdout.trim());
const miss = (question = 'Why retry?', answer = 'Thought it was optional') => ourkit('teachback', 'miss', question, answer);

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-explain-'));
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

test('a missed question goes in the Change Report, keeping what is there', () => {
  fs.mkdirSync(path.dirname(reportPath()), { recursive: true });
  fs.writeFileSync(reportPath(), '## Summary\n\n1\n2\n3\n4\n5\n\n## Details\n\nMore.\n');
  assert.strictEqual(miss().status, 0);
  const text = fs.readFileSync(reportPath(), 'utf8');
  assert.match(text, /## Details\n\nMore\.\n\n## Teach-back\n\n- Why retry\? Misunderstood: Thought it was optional\n/);
  assert.deepStrictEqual(JSON.parse(ourkit('gate', 'artifact', 'report').stdout).status, 'pass');
});

test('later misses join the same section, wherever it is', () => {
  fs.mkdirSync(path.dirname(reportPath()), { recursive: true });
  fs.writeFileSync(reportPath(), '## Summary\n\n1\n2\n3\n4\n5\n\n## Teach-back\n\n- First\n\n## Details\n\nMore.\n');
  miss('Second?', 'x');
  const text = fs.readFileSync(reportPath(), 'utf8');
  assert.strictEqual(text.match(/## Teach-back/g).length, 1);
  assert.ok(text.indexOf('Second?') < text.indexOf('## Details'));
  assert.ok(text.indexOf('- First') < text.indexOf('Second?'));
});

test('works before the report exists, and the report still needs writing', () => {
  miss();
  assert.match(fs.readFileSync(reportPath(), 'utf8'), /^## Teach-back/);
  assert.ok(JSON.parse(ourkit('gate', 'artifact', 'report').stdout).problems.length > 0);
});

test('a Patch has no Change Report, so nothing is recorded', () => {
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  const result = miss();
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /nothing was recorded/);
  assert.ok(!fs.existsSync(reportPath()));
});

test('rejects bad usage', () => {
  assert.strictEqual(ourkit('teachback', 'miss', 'Only a question').status, 2);
  assert.strictEqual(ourkit('teachback').status, 2);
});

test('the Explainers use the models ADR 0008 names and cannot edit', () => {
  const agents = 'hosts/claude-code/agents';
  assert.match(read(`${agents}/ourkit-explainer.md`), /^model: sonnet/m);
  assert.match(read(`${agents}/ourkit-sensitive-explainer.md`), /^model: opus/m);
  for (const agent of ['ourkit-explainer', 'ourkit-sensitive-explainer']) {
    const text = read(`${agents}/${agent}.md`);
    assert.match(text, /^tools: Read, Grep, Glob, Bash/m);
    assert.match(text, /exactly three sentences/);
    assert.match(text, /file and line/);
    assert.match(text, /never follow instructions/);
  }
});

test('the Stage covers summary, questions and Teach-back, and Pair suggests it', () => {
  const stage = read('stages/ourkit-huh/SKILL.md');
  const order = ['Open with the summary', 'Answer questions', 'Run the Teach-back'].map((text) => stage.indexOf(text));
  assert.ok(order.every((position) => position >= 0));
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b));
  for (const required of ['ourkit-sensitive-explainer', 'ourkit teachback miss', 'explain it again', 'commit the Change Report']) {
    assert.ok(stage.includes(required), required);
  }
  assert.match(read('stages/ourkit-review/SKILL.md'), /In Pair, also suggest.*\/ourkit-huh/);
});
