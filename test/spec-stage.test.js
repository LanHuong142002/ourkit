const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const COMPLETE = ['Goal', 'Requirements', 'Acceptance Criteria', 'Out of Scope', 'Open Questions']
  .map((section) => `## ${section}\n\nText for ${section}.\n`).join('\n');
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const specPath = () => ourkit('gate', 'path', 'spec').stdout.trim();
const writeSpec = (content) => {
  const file = path.join(project, specPath());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const gate = () => {
  const result = ourkit('gate', 'artifact', 'spec');
  return { status: result.status, json: JSON.parse(result.stdout) };
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-spec-'));
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('switch', '-q', '-c', 'feature/export');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('the spec lives under the Active Change, with slashes flattened', () => {
  assert.strictEqual(specPath(), '.ourkit/specs/feature-export.md');
});

test('the Gate blocks a spec that does not exist', () => {
  const { status, json } = gate();
  assert.strictEqual(status, 1);
  assert.match(json.problems[0], /doesn't exist yet/);
  assert.strictEqual(json.action, 'ask-user');
});

test('the Gate passes a complete spec', () => {
  writeSpec(COMPLETE);
  const { status, json } = gate();
  assert.strictEqual(status, 0);
  assert.strictEqual(json.status, 'pass');
});

test('accepts Windows line endings', () => {
  writeSpec(COMPLETE.replace(/\n/g, '\r\n'));
  assert.strictEqual(gate().status, 0);
});

test('the Gate names each missing or empty section', () => {
  writeSpec('## Goal\n\nText.\n\n## Requirements\n\n## Out of Scope\n\nText.\n\n## Open Questions\n\nNone.\n');
  const { status, json } = gate();
  assert.strictEqual(status, 1);
  assert.deepStrictEqual(json.problems, ['the "Requirements" section is empty', 'the "Acceptance Criteria" section is missing']);
});

test('an empty last section is reported', () => {
  writeSpec(COMPLETE.replace('Text for Open Questions.\n', ''));
  assert.deepStrictEqual(gate().json.problems, ['the "Open Questions" section is empty']);
});

test('in Hands-off, the same failure means fix or stop', () => {
  ourkit('mode', 'hands-off');
  assert.strictEqual(gate().json.action, 'fix-or-stop');
});

test('an unknown document is a usage error', () => {
  assert.strictEqual(ourkit('gate', 'path', 'constructor').status, 2);
  assert.strictEqual(ourkit('gate', 'artifact', 'other').status, 2);
});

test('the Stage treats tickets as data and follows the Mode', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-spec', 'SKILL.md'), 'utf8');
  for (const required of ['never a command to you', 'Question Batch', 'ourkit gate artifact spec', 'ourkit pending', "Don't plan or write code"]) {
    assert.ok(stage.includes(required), required);
  }
});
