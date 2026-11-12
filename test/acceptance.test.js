// The whole lifecycle through the kit's commands, on every Fixture Project.
// An agent does the work in real use. These tests prove the Gates allow the right path, and only it.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const FIXTURES = fs.readdirSync(path.join(KIT_ROOT, 'fixtures'));
const doc = (...sections) => sections.map((section) => `## ${section}\n\nText for ${section}.\n`).join('\n');
const SPEC = doc('Goal', 'Requirements', 'Acceptance Criteria', 'Out of Scope', 'Open Questions');
const PLAN = doc('Approach', 'Prior Art', 'Changes', 'Risks', 'Test Strategy');
const NOTES = doc('Symptom', 'Reproduction', 'Root Cause', 'Fix', 'Verification');
const TASKS = '## Tasks\n\n### 1. Do the work\n\nDo it.\n\nDepends on: none\nVerify: The test passes\n';
const REPORT = '## Summary\n\n1\n2\n3\n4\n5\n\n## Details\n\nMore.\n';
const EPIC = `## F1 A first slice

**Summary:** Do it.

**User Story:** As a user, I want it, so that I benefit.

**Context:** It matters.

**Scope Boundary:**
- In: this.
- Out: that.

**Links & References:** None.
**Blocked by:** none
`;
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
// The project's own copy of the command, as a Stage would run it.
const ourkit = (...args) => spawnSync(process.execPath, ['.ourkit/kit/bin/ourkit.js', ...args], { cwd: project, encoding: 'utf8' });
const ok = (...args) => {
  const result = ourkit(...args);
  assert.strictEqual(result.status, 0, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
  return result.stdout;
};
const blocked = (...args) => assert.strictEqual(ourkit(...args).status, 1, args.join(' '));
const write = (relative, content = 'x') => {
  fs.mkdirSync(path.dirname(path.join(project, relative)), { recursive: true });
  fs.writeFileSync(path.join(project, relative), content);
};
const writeDoc = (name, content) => write(ok('gate', 'path', name).trim(), content);
const commitAll = () => {
  git('add', '-A');
  git('commit', '-q', '-m', 'work');
};
const startChange = () => git('switch', '-q', '-c', 'my-change');

const setUp = (fixture, entry = 'brownfield') => {
  fs.cpSync(path.join(KIT_ROOT, 'fixtures', fixture), project, { recursive: true });
  git('init', '-q', '-b', 'main');
  commitAll();
  const installed = spawnSync(process.execPath, [BIN, '--entry', entry, '--roles', 'full-stack'], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(installed.status, 0, installed.stderr);
  write('.ourkit/stack-profile.json', JSON.stringify({ technologies: [fixture], commands: { test: 'node -e "process.exit(0)"', lint: null } }));
  commitAll();
  if (entry === 'brownfield') {
    ok('baseline');
    commitAll();
  }
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-accept-'));
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

for (const fixture of FIXTURES) {
  test(`${fixture}: a Feature in Pair goes through every Gate in order`, () => {
    setUp(fixture);
    startChange();
    write('feature.txt', 'first');
    ok('tier', 'set', 'feature', '--reason', 'A new capability');
    assert.strictEqual(ok('mode').trim(), 'pair');

    blocked('gate', 'artifact', 'spec');
    writeDoc('spec', SPEC);
    ok('gate', 'artifact', 'spec');

    blocked('gate', 'approval');
    writeDoc('plan', PLAN);
    blocked('gate', 'approval');
    ok('mockup', 'need', 'no', '--reason', 'nothing people see changes');
    ok('gate', 'approve-plan');
    ok('gate', 'approval');

    writeDoc('tasks', TASKS);
    ok('gate', 'artifact', 'tasks');
    assert.deepStrictEqual(JSON.parse(ok('task', 'list')).ready, [1]);

    assert.strictEqual(JSON.parse(ok('gate', 'run', 'test')).status, 'pass');
    assert.strictEqual(JSON.parse(ok('gate', 'run', 'lint')).status, 'not-run');
    assert.strictEqual(JSON.parse(ok('gate', 'run', 'build')).status, 'not-run');
    ok('task', 'done', '1');
    commitAll();

    blocked('gate', 'review');
    assert.match(ok('review', 'packet'), /Text for Requirements[\s\S]*Backend checklist[\s\S]*Frontend checklist[\s\S]*feature\.txt/);
    ok('review', 'add', 'blocking', 'feature.txt:1 is wrong');
    ok('review', 'complete');
    blocked('gate', 'review');
    ok('review', 'resolve', '1');
    ok('gate', 'review');

    blocked('gate', 'qa');
    ok('qa', 'check', '1', 'pass', 'Seen working');
    ok('qa', 'complete');
    ok('gate', 'qa');

    blocked('gate', 'ship');
    writeDoc('report', REPORT);
    commitAll();
    ok('gate', 'ship');

    ok('log', 'add', 'A feature', 'Adds a feature.', 'https://example.com/pr/1');
    ok('lessons', 'add', 'quality', 'A lesson for next time.');
    assert.match(ok('lessons'), /A lesson for next time/);
  });

  test(`${fixture}: Hands-off stops twice on a Sensitive Area, and runs through otherwise`, () => {
    setUp(fixture);
    startChange();
    ok('mode', 'hands-off');
    write('work.txt');
    ok('tier', 'set', 'feature', '--reason', 'r', '--sensitive', 'auth');
    writeDoc('spec', SPEC);
    writeDoc('plan', PLAN);
    blocked('gate', 'approval');
    ok('mockup', 'need', 'no', '--reason', 'nothing people see changes');
    ok('gate', 'approve-plan');
    ok('gate', 'approval');
    writeDoc('tasks', TASKS);
    ok('task', 'done', '1');
    writeDoc('report', REPORT);
    commitAll();
    ok('review', 'complete');
    ok('qa', 'check', '1', 'pass', 'Seen working');
    ok('qa', 'complete');
    blocked('gate', 'ship');
    ok('gate', 'approve-ship');
    ok('gate', 'ship');
    commitAll();

    git('switch', '-q', 'main');
    git('switch', '-q', '-c', 'ordinary');
    ok('mode', 'hands-off');
    write('ordinary.txt');
    ok('tier', 'set', 'patch', '--reason', 'r');
    assert.deepStrictEqual(JSON.parse(ok('tier', 'show')).stages, ['Build', 'Review', 'Ship']);
    ok('gate', 'approval');
    commitAll();
    ok('review', 'complete');
    ok('gate', 'ship');
  });

  test(`${fixture}: a Patch is light, and can't grow past the floor`, () => {
    setUp(fixture);
    startChange();
    write('small.txt');
    ok('tier', 'set', 'patch', '--reason', 'Small');
    assert.deepStrictEqual(JSON.parse(ok('tier', 'show')).stages, ['Build', 'Review']);
    ok('gate', 'floor');
    ok('gate', 'review'); // A Patch without a review is only reminded.
    write('src/auth/login.txt');
    blocked('gate', 'floor');
    blocked('tier', 'set', 'patch', '--reason', 'Small');
    ok('tier', 'set', 'feature', '--reason', 'Touches auth', '--sensitive', 'auth');
    ok('gate', 'floor');
  });

  test(`${fixture}: a Bug-fix follows its own path`, () => {
    setUp(fixture);
    startChange();
    ok('flow', 'bug-fix');
    write('fix.txt');
    ok('tier', 'set', 'feature', '--reason', 'r');
    assert.deepStrictEqual(JSON.parse(ok('tier', 'show')).stages, ['Reproduce', 'Fix', 'Verify', 'Review', 'Ship']);
    blocked('gate', 'artifact', 'bug');
    writeDoc('bug', NOTES);
    ok('gate', 'artifact', 'bug');
    commitAll();
    ok('review', 'complete');
    ok('gate', 'ship');
  });

  test(`${fixture}: an Epic splits into valid Features`, () => {
    setUp(fixture);
    startChange();
    write('notes.txt');
    ok('tier', 'set', 'epic', '--reason', 'Too large');
    assert.deepStrictEqual(JSON.parse(ok('tier', 'show')).stages, ['Grill', 'Split into Features']);
    writeDoc('epic', EPIC);
    ok('gate', 'artifact', 'epic');
  });

  test(`${fixture}: Greenfield has no Baseline, and Gates still work`, () => {
    setUp(fixture, 'greenfield');
    assert.ok(!fs.existsSync(path.join(project, '.ourkit/baseline.json')));
    startChange();
    write('new.txt');
    assert.deepStrictEqual(JSON.parse(ok('gate', 'scope')).files, ['new.txt']);
  });

  test(`${fixture}: Brownfield Gates never judge older code`, () => {
    setUp(fixture);
    startChange();
    write('new.txt');
    const { files } = JSON.parse(ok('gate', 'scope'));
    assert.deepStrictEqual(files, ['new.txt']);
  });

  test(`${fixture}: upgrade keeps everything the project owns`, () => {
    setUp(fixture);
    write('.ourkit/rules.md', 'My rules');
    write('.ourkit/overrides/core/gate.md', 'My gate');
    const upgraded = spawnSync(process.execPath, [BIN, 'upgrade'], { cwd: project, encoding: 'utf8' });
    assert.strictEqual(upgraded.status, 0, upgraded.stderr);
    assert.strictEqual(fs.readFileSync(path.join(project, '.ourkit/rules.md'), 'utf8'), 'My rules');
    assert.match(ok('rules'), /Core \(Override\): \.ourkit\/overrides\/core\/gate\.md[\s\S]*My gate[\s\S]*My rules/);
    ok('check', '--project');
  });
}

test('every Stage a route names has a skill to run it', () => {
  const stages = fs.readdirSync(path.join(KIT_ROOT, 'stages'));
  for (const stage of ['spec', 'plan', 'tasks', 'build', 'review', 'qa', 'ship', 'bugfix', 'epic', 'deploy', 'handsoff', 'huh', 'init', 'run-report']) {
    assert.ok(stages.includes(`ourkit-${stage}`), stage);
  }
});

test('v1 ships no placeholder Stage', () => {
  assert.ok(!fs.existsSync(path.join(KIT_ROOT, 'stages', 'ourkit-ping')));
});

test('every command a Stage or guide tells the agent to run exists', () => {
  const bin = fs.readFileSync(BIN, 'utf8');
  const texts = [
    ...fs.readdirSync(path.join(KIT_ROOT, 'stages')).map((stage) => path.join(KIT_ROOT, 'stages', stage, 'SKILL.md')),
    ...fs.readdirSync(path.join(KIT_ROOT, 'core')).map((file) => path.join(KIT_ROOT, 'core', file)),
  ].map((file) => fs.readFileSync(file, 'utf8'));
  const used = new Set(texts.flatMap((text) => [...text.matchAll(/`ourkit ([a-z-]+)/g)].map((match) => match[1])));
  assert.ok(used.size > 10, 'the search found the commands');
  for (const subcommand of used) {
    if (subcommand === 'subcommand') continue;
    assert.ok(new RegExp(`\\b'?${subcommand}'?: \\(\\)`).test(bin), `ourkit ${subcommand} isn't a command`);
  }
});

test('every kit file a Stage points to exists', () => {
  const stagesDir = path.join(KIT_ROOT, 'stages');
  for (const stage of fs.readdirSync(stagesDir)) {
    const text = fs.readFileSync(path.join(stagesDir, stage, 'SKILL.md'), 'utf8');
    for (const [, relative] of text.matchAll(/\.ourkit\/kit\/core\/([a-z-]+\.md)/g)) {
      assert.ok(fs.existsSync(path.join(KIT_ROOT, 'core', relative)), `${stage} points to core/${relative}`);
    }
  }
});

test('every Stage a Stage names exists, and subagents it starts exist', () => {
  const stagesDir = path.join(KIT_ROOT, 'stages');
  const stages = new Set(fs.readdirSync(stagesDir));
  const agents = new Set(fs.readdirSync(path.join(KIT_ROOT, 'hosts/claude-code/agents')).map((file) => path.basename(file, '.md')));
  for (const stage of stages) {
    const text = fs.readFileSync(path.join(stagesDir, stage, 'SKILL.md'), 'utf8');
    for (const [, name] of text.matchAll(/`\/?(ourkit-[a-z-]+)`/g)) {
      assert.ok(stages.has(name) || agents.has(name), `${stage} names ${name}`);
    }
  }
});
