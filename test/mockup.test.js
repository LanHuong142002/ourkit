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

function setUpEpic(roles) {
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  ourkit('--entry', 'new', '--roles', roles);
  git('add', '-A');
  git('commit', '-q', '-m', 'kit');
  git('switch', '-q', '-c', 'whole-app');
  ourkit('tier', 'set', 'epic', '--reason', 'a whole product');
}

const EPIC = '## F1 Sign in\n\n**Summary:** s\n\n**User Story:** As a u, I want w, so that v\n\n**Context:** c\n\n**Scope Boundary:**\n- In: i\n- Out: o\n\n**Links & References:** Prototype screens: Sign in\n**Blocked by:** none\n';
const split = () => ourkit('gate', 'artifact', 'epic');

test('an Epic has a prototype folder, not a mockup', () => {
  setUpEpic('frontend');
  assert.strictEqual(ourkit('prototype', 'path').stdout.trim(), '.ourkit/prototypes/whole-app/index.html');
  const wrong = ourkit('mockup', 'path');
  assert.strictEqual(wrong.status, 2);
  assert.match(wrong.stderr, /an Epic has a prototype, so use `ourkit prototype`/);
});

test('a Feature has no prototype', () => {
  setUp('frontend');
  const wrong = ourkit('prototype', 'show');
  assert.strictEqual(wrong.status, 2);
  assert.match(wrong.stderr, /only an Epic has a prototype/);
});

test('with the frontend Role, an Epic is not split until its prototype is approved', () => {
  setUpEpic('frontend');
  write(ourkit('gate', 'path', 'epic').stdout.trim(), EPIC);
  assert.match(split().stdout, /needs a prototype/);
  assert.strictEqual(ourkit('prototype', 'need', 'yes').status, 0);
  assert.match(split().stdout, /doesn't exist yet/);
  const index = ourkit('prototype', 'path').stdout.trim();
  write(index, '<a href="board.html">Board</a>');
  write(index.replace('index.html', 'board.html'), '<h1>Board</h1>');
  assert.match(split().stdout, /not approved the prototype/);
  assert.strictEqual(ourkit('prototype', 'approve').status, 0);
  assert.strictEqual(split().status, 0);
  write(index.replace('index.html', 'board.html'), '<h1>Board, changed</h1>');
  assert.match(split().stdout, /prototype changed after the user approved it/, 'any file in the folder counts');
});

test('an Epic with nothing people see records why and splits', () => {
  setUpEpic('frontend');
  write(ourkit('gate', 'path', 'epic').stdout.trim(), EPIC);
  assert.strictEqual(ourkit('prototype', 'need', 'no', '--reason', 'a batch job').status, 0);
  assert.strictEqual(split().status, 0);
});

test('status waits for the user at the prototype, then moves on to the split', () => {
  setUpEpic('frontend');
  const status = () => JSON.parse(ourkit('status').stdout);
  assert.strictEqual(status().current, 'Grill');
  ourkit('prototype', 'need', 'yes');
  write(ourkit('prototype', 'path').stdout.trim(), '<h1>Home</h1>');
  const waiting = status();
  assert.strictEqual(waiting.current, 'Prototype');
  assert.match(waiting.next.text, /approve the prototype/);
  assert.ok(waiting.waiting.some((item) => /look at the prototype/.test(item.text)));
  ourkit('prototype', 'approve');
  assert.strictEqual(status().current, 'Split into Features');
});
