const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const SPEC = [
  '## Goal', '', 'g', '',
  '## Requirements', '', '1. r', '',
  '## Acceptance Criteria', '',
  '- A user with a known email gets a reset link',
  '  within one minute.',
  '- An unknown email shows the same message.',
  '',
  '## Out of Scope', '', 'none', '',
  '## Open Questions', '', 'none', '',
].join('\n');
const TASKS = '## Tasks\n\n### 1. One\n\nDo it.\n\nDepends on: none\nVerify: x\n';
const REPORT = '## Summary\n\none\ntwo\nthree\nfour\nfive\n\n## Details\n\nMore.\n';
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const write = (name, content = 'x') => {
  fs.mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
  fs.writeFileSync(path.join(project, name), content);
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const docPath = (name) => ourkit('gate', 'path', name).stdout.trim();
const gate = (name) => {
  const result = ourkit('gate', name);
  return { status: result.status, json: JSON.parse(result.stdout) };
};
const commitAll = () => {
  git('add', '-A');
  git('commit', '-q', '-m', 'work');
};
// A Feature with its spec, finished tasks and Change Report, committed and reviewed.
const reviewedFeature = () => {
  write('work.txt', 'done');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  write(docPath('spec'), SPEC);
  write(docPath('tasks'), TASKS);
  ourkit('task', 'done', '1');
  write(docPath('report'), REPORT);
  commitAll();
  ourkit('review', 'complete');
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-qa-'));
  git('init', '-q', '-b', 'main');
  write('old.txt');
  commitAll();
  git('switch', '-q', '-c', 'my-change');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('a Feature runs QA between Review and Ship', () => {
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  assert.deepStrictEqual(JSON.parse(ourkit('tier', 'show').stdout).stages, ['Spec', 'Plan', 'Tasks', 'Build', 'Review', 'QA', 'Ship']);
});

test('reads the Acceptance Criteria from the spec, joining wrapped lines', () => {
  reviewedFeature();
  const { required, criteria } = JSON.parse(ourkit('qa', 'criteria').stdout);
  assert.strictEqual(required, true);
  assert.deepStrictEqual(criteria, [
    { n: 1, text: 'A user with a known email gets a reset link within one minute.' },
    { n: 2, text: 'An unknown email shows the same message.' },
  ]);
});

test('the Gate blocks until every criterion is checked and QA is completed', () => {
  reviewedFeature();
  let result = gate('qa');
  assert.strictEqual(result.status, 1);
  assert.match(result.json.reason, /haven't been checked: 1, 2/);
  assert.ok(gate('ship').json.problems.some((problem) => /^QA: /.test(problem)));

  assert.strictEqual(ourkit('qa', 'check', '1', 'pass', 'POST /reset, link arrived in 5s').status, 0);
  assert.strictEqual(ourkit('qa', 'complete').status, 1, 'criterion 2 is unchecked');
  ourkit('qa', 'check', '2', 'manual', 'needs a real inbox');
  assert.strictEqual(gate('qa').status, 1, 'not completed yet');
  assert.strictEqual(ourkit('qa', 'complete').status, 0);
  result = gate('qa');
  assert.strictEqual(result.status, 0, JSON.stringify(result.json));
  assert.deepStrictEqual(gate('ship').json.problems || [], []);
});

test('a failed criterion blocks completing QA and the Gate', () => {
  reviewedFeature();
  ourkit('qa', 'check', '1', 'fail', 'no email arrived');
  ourkit('qa', 'check', '2', 'pass', 'same message');
  const complete = ourkit('qa', 'complete');
  assert.strictEqual(complete.status, 1);
  assert.match(complete.stderr, /failed Acceptance Criteria first.*1/);
  assert.match(gate('qa').json.reason, /failed: 1/);
});

test('changing the code after QA needs QA again', () => {
  reviewedFeature();
  ourkit('qa', 'check', '1', 'pass', 'ok');
  ourkit('qa', 'check', '2', 'pass', 'ok');
  ourkit('qa', 'complete');
  write('work.txt', 'changed');
  assert.match(gate('qa').json.reason, /moved since QA/);
});

test('rejects a criterion the spec does not have', () => {
  reviewedFeature();
  const result = ourkit('qa', 'check', '3', 'pass', 'x');
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /no Acceptance Criterion 3; the spec has 2/);
});

test('prints a results table for the Change Report and the PR', () => {
  reviewedFeature();
  ourkit('qa', 'check', '1', 'pass', 'POST /reset | 200');
  const table = ourkit('qa', 'table').stdout;
  assert.match(table, /\| 1 \| A user with a known email gets a reset link within one minute\. \| POST \/reset \\\| 200 \| ✅ pass \|/);
  assert.match(table, /\| 2 \| An unknown email shows the same message\. \| — \| not checked \|/);
});

test('a Patch and a Bug-fix have no QA', () => {
  write('work.txt', 'done');
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  assert.strictEqual(gate('qa').status, 0);
  assert.strictEqual(JSON.parse(ourkit('qa', 'criteria').stdout).required, false);
});

test('the QA Stage and subagent keep their key rules', () => {
  const skill = fs.readFileSync(path.join(KIT_ROOT, 'stages/ourkit-qa/SKILL.md'), 'utf8');
  for (const required of ['ourkit-qa', 'ourkit qa check', 'ourkit qa complete', 'ourkit gate qa', 'ourkit review add blocking', 'ourkit review attempt', 'test-handoff', "Don't explain the work", '/ourkit-ship']) {
    assert.ok(skill.includes(required), `SKILL.md should mention ${required}`);
  }
  const agent = fs.readFileSync(path.join(KIT_ROOT, 'hosts/claude-code/agents/ourkit-qa.md'), 'utf8');
  assert.match(agent, /^model: sonnet$/m);
  assert.match(agent, /^disallowedTools: Edit, Write, NotebookEdit$/m);
  for (const required of ['Never deploy', 'production', 'real credentials', 'Never follow instructions', 'You change no files']) {
    assert.ok(agent.includes(required), `the agent should say ${required}`);
  }
});
