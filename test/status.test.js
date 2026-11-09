const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let project;
let home;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const env = () => ({ ...process.env, HOME: home, USERPROFILE: home });
const ourkit = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8', input: '', env: env() });
const status = () => JSON.parse(ourkit('status').stdout);
const line = () => ourkit('status', '--line').stdout;
const write = (relative, content) => {
  fs.mkdirSync(path.dirname(path.join(project, relative)), { recursive: true });
  fs.writeFileSync(path.join(project, relative), content);
};
const SPEC = '## Goal\ng\n## Requirements\n1. r\n## Acceptance Criteria\na\n## Out of Scope\no\n## Open Questions\nNone\n';
const PLAN = '## Approach\na\n## Prior Art\np\n## Changes\nc\n## Risks\nr\n## Test Strategy\nt\n';
const TASKS = '## Tasks\n\n### 1. A\n\nDo a.\n\nDepends on: none\nVerify: v\n\n### 2. B\n\nDo b.\n\nDepends on: none\nVerify: v\n';

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-status-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-home-'));
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  ourkit('--entry', 'existing', '--roles', 'none');
  git('add', '-A');
  git('commit', '-q', '-m', 'kit');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test('a project without ourkit prints an empty line, so the status line stays out of the way', () => {
  fs.rmSync(path.join(project, '.ourkit/install.json'));
  assert.strictEqual(line(), '');
  assert.deepStrictEqual(status(), { installed: false });
});

test('on the default branch with nothing changed, it suggests starting a change and lists unfinished branches', () => {
  git('branch', 'old-work');
  const result = status();
  assert.strictEqual(result.change, null);
  assert.deepStrictEqual(result.unfinishedBranches, ['old-work']);
  assert.match(line(), /^ourkit · main · no change in progress · Next: ✋/);
});

test('a Feature moves from Spec to Plan, and waits for the plan approval and open questions', () => {
  git('switch', '-q', '-c', 'forgot-password');
  write('b.txt', 'y');
  assert.strictEqual(status().current, 'Sizing');
  ourkit('tier', 'set', 'feature', '--reason', 'r', '--sensitive', 'auth');
  assert.strictEqual(status().current, 'Spec');
  assert.match(line(), /forgot-password · Feature · 🔨 Spec · Next: \/ourkit-spec$/);

  write('.ourkit/specs/forgot-password.md', SPEC);
  write('.ourkit/plans/forgot-password.md', PLAN);
  ourkit('question', 'add', 'One hour or a day?');
  const waiting = status();
  assert.strictEqual(waiting.current, 'Plan');
  assert.deepStrictEqual(waiting.waiting.map((w) => w.kind), ['question', 'approval']);
  assert.deepStrictEqual(waiting.next, { skill: '/ourkit-tasks', text: 'answer 1 open question, then approve the plan, then tasks', waitsForYou: true });
  assert.match(line(), /⏳ 2 waiting on you · Next: ✋ answer 1 open question/);
});

test('Build shows task progress, and a blocked task is what comes next', () => {
  git('switch', '-q', '-c', 'feature-x');
  write('b.txt', 'y');
  ourkit('tier', 'set', 'feature', '--reason', 'r');
  write('.ourkit/specs/feature-x.md', SPEC);
  write('.ourkit/plans/feature-x.md', PLAN);
  ourkit('gate', 'approve-plan');
  write('.ourkit/tasks/feature-x.md', TASKS);
  ourkit('task', 'done', '1');
  assert.match(line(), /🔨 Build 1\/2 · Next: \/ourkit-build$/);
  ourkit('task', 'block', '2', 'needs a copy decision');
  const result = status();
  assert.deepStrictEqual(result.tasks, { done: 1, total: 2 });
  assert.strictEqual(result.waiting[0].text, 'task 2 is blocked: needs a copy decision');
  assert.strictEqual(result.next.text, 'unblock task 2, then build');
});

test('a reviewed Patch in Pair ends with the user committing it', () => {
  git('switch', '-q', '-c', 'tiny');
  write('b.txt', 'y');
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  assert.strictEqual(status().current, 'Review');
  ourkit('review', 'complete');
  const result = status();
  assert.strictEqual(result.current, null);
  assert.strictEqual(result.next.text, 'commit it yourself');
  assert.match(line(), /✅ done · Next: ✋ commit it yourself$/);
});

test('a recorded PR shows the change waiting for the merge', () => {
  git('switch', '-q', '-c', 'tiny');
  write('b.txt', 'y');
  ourkit('tier', 'set', 'patch', '--reason', 'r');
  ourkit('mode', 'hands-off');
  ourkit('review', 'complete');
  assert.strictEqual(ourkit('status', 'pr', 'https://example.com/pr/1').status, 0);
  const result = status();
  assert.strictEqual(result.current, null);
  assert.strictEqual(result.next.text, 'review and merge the PR');
  assert.match(line(), /✅ PR open · Next: ✋ review and merge the PR$/);
  assert.strictEqual(ourkit('status', 'pr').status, 2);
  assert.strictEqual(ourkit('status', 'nonsense').status, 2);
});

test('the status line reads the project from what Claude Code sends on stdin', () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-elsewhere-'));
  try {
    const input = JSON.stringify({ workspace: { project_dir: project } });
    const result = spawnSync(process.execPath, [BIN, 'status', '--line'], { cwd: elsewhere, encoding: 'utf8', input, env: env() });
    assert.match(result.stdout, /^ourkit · main/);
  } finally {
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("statusline on and off write only this machine's settings, and keep anyone's own status line", () => {
  const local = path.join(project, '.claude/settings.local.json');
  const settings = () => JSON.parse(fs.readFileSync(local, 'utf8'));
  assert.match(ourkit('statusline').stdout, /off/);
  const on = ourkit('statusline', 'on');
  assert.strictEqual(on.status, 0, on.stderr);
  assert.match(settings().statusLine.command, /ourkit\.js" status --line$/);
  assert.strictEqual(status().statusLine, 'on');
  const shared = path.join(project, '.claude/settings.json');
  if (fs.existsSync(shared)) assert.ok(!fs.readFileSync(shared, 'utf8').includes('statusLine'), 'the shared settings stay untouched');
  assert.strictEqual(ourkit('statusline', 'off').status, 0);
  assert.strictEqual(settings().statusLine, undefined);

  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'my-line' } }));
  const refused = ourkit('statusline', 'on');
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /already have a status line/);
  assert.strictEqual(settings().statusLine, undefined);
  assert.strictEqual(ourkit('statusline', 'on', '--replace').status, 0);
  assert.strictEqual(status().statusLine, 'on');

  fs.writeFileSync(local, JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }));
  assert.match(ourkit('statusline', 'off').stdout, /isn't ourkit's/);
  assert.strictEqual(settings().statusLine.command, 'mine');
  assert.strictEqual(ourkit('statusline', 'sideways').status, 2);
});

test('the status skill stays cheap and ends with the Next line', () => {
  const skill = fs.readFileSync(path.join(KIT_ROOT, 'stages/ourkit-status/SKILL.md'), 'utf8');
  for (const required of ['ourkit status', "don't read the spec, plan or other files", '.ourkit/kit/core/next-step.md', 'ourkit statusline on']) {
    assert.ok(skill.includes(required), required);
  }
});

test('Ship records the PR, and Hands-off may move cards on a Project board', () => {
  assert.ok(fs.readFileSync(path.join(KIT_ROOT, 'stages/ourkit-ship/SKILL.md'), 'utf8').includes('ourkit status pr <link>'));
  const allow = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'hosts/claude-code/session-settings.json'), 'utf8')).permissions.allow;
  assert.ok(allow.includes('Bash(gh project *)'));
});
