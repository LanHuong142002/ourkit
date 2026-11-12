const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const PLAN = '## Approach\na\n## Prior Art\np\n## Changes\nc\n## Risks\nr\n## Test Strategy\nt\n';
const SPEC = '## Goal\ng\n## Requirements\n1. r\n## Acceptance Criteria\na\n## Out of Scope\no\n## Open Questions\nNone\n';
let project;
let home;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const env = () => ({ ...process.env, HOME: home, USERPROFILE: home });
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8', input: '', env: env() });
const write = (relative, content) => {
  fs.mkdirSync(path.dirname(path.join(project, relative)), { recursive: true });
  fs.writeFileSync(path.join(project, relative), content);
};
const writeMockup = (content) => write(ourkit('mockup', 'path').stdout.trim(), content);
const approval = () => {
  const result = ourkit('gate', 'approval');
  return { status: result.status, json: JSON.parse(result.stdout) };
};

function setUp(roles) {
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  ourkit('--entry', 'existing', '--roles', roles);
  git('add', '-A');
  git('commit', '-q', '-m', 'kit');
  git('switch', '-q', '-c', 'sign-in-page');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  write(ourkit('gate', 'path', 'spec').stdout.trim(), SPEC);
  write(ourkit('gate', 'path', 'plan').stdout.trim(), PLAN);
}

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-mockup-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-home-'));
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test('with the frontend Role, the plan cannot be approved until the mockup question is decided', () => {
  setUp('frontend');
  const refused = ourkit('gate', 'approve-plan');
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /needs a mockup/);
  assert.strictEqual(ourkit('mockup', 'need', 'no').status, 2, 'saying no needs a reason');
  assert.strictEqual(ourkit('mockup', 'need', 'no', '--reason', 'only changes an API').status, 0);
  assert.strictEqual(ourkit('gate', 'approve-plan').status, 0);
  assert.strictEqual(approval().status, 0);
});

test('a plan approved before mockups existed keeps Build going after an upgrade', () => {
  setUp('frontend');
  const record = path.join(project, '.ourkit', 'changes', 'sign-in-page.json');
  const { hashFile } = require('../src/install');
  const data = JSON.parse(fs.readFileSync(record, 'utf8'));
  data.planApproval = hashFile(path.join(project, ourkit('gate', 'path', 'plan').stdout.trim()));
  fs.writeFileSync(record, JSON.stringify(data));
  assert.strictEqual(approval().status, 0);
});

test('without the frontend Role, nothing about mockups is required', () => {
  setUp('none');
  assert.strictEqual(ourkit('gate', 'approve-plan').status, 0);
  assert.strictEqual(approval().status, 0);
});

test('a needed mockup must exist and be approved before the plan', () => {
  setUp('frontend');
  ourkit('mockup', 'need', 'yes');
  assert.match(ourkit('gate', 'approve-plan').stderr, /doesn't exist yet/);
  assert.strictEqual(ourkit('mockup', 'approve').status, 1);
  writeMockup('<html><body>Sign in</body></html>');
  assert.match(ourkit('gate', 'approve-plan').stderr, /not approved the mockup/);
  assert.strictEqual(ourkit('mockup', 'approve').status, 0);
  assert.strictEqual(ourkit('gate', 'approve-plan').status, 0);
  assert.strictEqual(approval().status, 0);
});

test('changing the mockup after approval holds Build until it is approved again', () => {
  setUp('frontend');
  ourkit('mockup', 'need', 'yes');
  writeMockup('<html><body>Sign in</body></html>');
  ourkit('mockup', 'approve');
  ourkit('gate', 'approve-plan');
  writeMockup('<html><body>Sign in, with a forgot password link</body></html>');
  const { status, json } = approval();
  assert.strictEqual(status, 1);
  assert.match(json.reason, /mockup changed after/);
  ourkit('mockup', 'approve');
  assert.strictEqual(approval().status, 0);
});

test('status shows the mockup waiting for the user before the plan', () => {
  setUp('frontend');
  ourkit('mockup', 'need', 'yes');
  writeMockup('<html><body>Sign in</body></html>');
  const status = JSON.parse(ourkit('status').stdout);
  assert.strictEqual(status.current, 'Plan');
  assert.strictEqual(status.mockup, '.ourkit/mockups/sign-in-page.html');
  assert.match(status.waiting.map((w) => w.text).join('\n'), /look at the mockup/);
  assert.doesNotMatch(status.waiting.map((w) => w.text).join('\n'), /approve the plan/);
  assert.match(status.next.text, /approve the mockup/);
  assert.strictEqual(status.next.waitsForYou, true);
  ourkit('mockup', 'approve');
  const after = JSON.parse(ourkit('status').stdout);
  assert.match(after.next.text, /approve the plan/);
});

test('the Plan skill makes the mockup before the plan, and later Stages check against it', () => {
  const read = (relative) => fs.readFileSync(path.join(KIT_ROOT, relative), 'utf8');
  const plan = read('stages/ourkit-plan/SKILL.md');
  assert.match(plan, /ourkit mockup need/);
  assert.match(plan, /ourkit mockup approve/);
  assert.ok(plan.indexOf('ourkit mockup approve') < plan.indexOf('Write the plan'), 'the mockup is agreed before the plan is written');
  assert.match(read('stages/ourkit-build/SKILL.md'), /mockup/i);
  assert.match(read('stages/ourkit-qa/SKILL.md'), /mockup/i);
  assert.match(read('roles/frontend/checklist.md'), /mockup/i);
  assert.match(read('README.md'), /ourkit mockup|mockup/i);
});
