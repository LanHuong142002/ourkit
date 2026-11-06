const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runContractCheck } = require('../src/contract-check');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const AGENT = '---\nname: ourkit-demo\ndescription: Demo.\nmodel: mid\n---\n\nDo it.\n';
const SHELL = { host: 'h', stagesDir: '.h/skills', agentsDir: '.h/agents', models: { strong: 'top', balanced: 'mid', cheap: 'low' } };
let root;

const write = (relative, content) => {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
};
const writeShell = (shell) => write('hosts/h/shell.json', JSON.stringify(shell));
const writeAgent = (content) => write('hosts/h/agents/ourkit-demo.md', content);
const messages = () => runContractCheck(root).problems.map((problem) => problem.message);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-models-'));
  write('stages/ourkit-demo/SKILL.md', '---\nname: ourkit-demo\ndescription: D.\n---\n\nDo.\n');
  writeShell(SHELL);
  writeAgent(AGENT);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('accepts a Host Shell with subagents and models', () => {
  assert.deepStrictEqual(messages(), []);
});

test('a Host Shell without subagents needs no models', () => {
  fs.rmSync(path.join(root, 'hosts/h/agents'), { recursive: true });
  writeShell({ host: 'h', stagesDir: '.h/skills' });
  assert.deepStrictEqual(messages(), []);
});

test('the real Host Shell maps strengths to the models ADR 0008 names', () => {
  const shell = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'hosts/claude-code/shell.json'), 'utf8'));
  assert.deepStrictEqual(shell.models, { strong: 'opus', balanced: 'sonnet', cheap: 'haiku' });
  const modelOf = (agent) => fs.readFileSync(path.join(KIT_ROOT, 'hosts/claude-code/agents', `${agent}.md`), 'utf8').match(/^model: (\w+)/m)[1];
  assert.strictEqual(modelOf('ourkit-implementer'), 'sonnet');
  assert.strictEqual(modelOf('ourkit-runner'), 'haiku');
});

for (const [label, shell, pattern] of [
  ['a missing strength', { ...SHELL, models: { strong: 'top', balanced: 'mid' } }, /map "cheap"/],
  ['no agentsDir', { ...SHELL, agentsDir: undefined }, /agentsDir must be/],
  ['an agentsDir outside the project', { ...SHELL, agentsDir: '../agents' }, /agentsDir must be/],
]) {
  test(`rejects a Host Shell with ${label}`, () => {
    writeShell(shell);
    assert.ok(messages().some((message) => pattern.test(message)), JSON.stringify(messages()));
  });
}

for (const [label, content, pattern] of [
  ['no frontmatter', 'Do it.\n', /frontmatter block/],
  ['a model the Host Shell does not map', AGENT.replace('model: mid', 'model: other'), /model must be one of/],
  ['no model', AGENT.replace('model: mid\n', ''), /model must be one of/],
  ['no description', AGENT.replace('description: Demo.\n', ''), /must set description/],
  ['a mismatched name', AGENT.replace('name: ourkit-demo', 'name: ourkit-other'), /must match its file/],
  ['no instructions', AGENT.replace('Do it.\n', ''), /must have instructions/],
]) {
  test(`rejects a subagent with ${label}`, () => {
    writeAgent(content);
    assert.ok(messages().some((message) => pattern.test(message)), JSON.stringify(messages()));
  });
}

test('Core names only strengths, never a model', () => {
  const core = fs.readFileSync(path.join(KIT_ROOT, 'core/models.md'), 'utf8');
  for (const model of ['opus', 'sonnet', 'haiku']) assert.ok(!core.toLowerCase().includes(model), model);
});

test('the Installer places subagents where the Host reads them, and upgrade protects edits', () => {
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(run('--entry', 'greenfield', '--roles', 'none').status, 0);
  const agent = path.join(project, '.claude/agents/ourkit-runner.md');
  assert.ok(fs.existsSync(agent));

  fs.writeFileSync(agent, 'my edit');
  assert.strictEqual(run('upgrade', '--move-edits').status, 0);
  assert.strictEqual(fs.readFileSync(path.join(project, '.ourkit/overrides/agents/ourkit-runner.md'), 'utf8'), 'my edit');
  assert.strictEqual(fs.readFileSync(agent, 'utf8'), 'my edit');
  const check = run('check', '--project');
  assert.strictEqual(check.status, 0, check.stderr);
});
