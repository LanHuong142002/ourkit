const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ignoredPaths } = require('../src/install');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const STAGE = '.claude/skills/ourkit-init/SKILL.md';
const STAGE_SOURCE = path.join(KIT_ROOT, 'stages', 'ourkit-init', 'SKILL.md');
const STAGE_OVERRIDE = '.ourkit/overrides/stages/ourkit-init/SKILL.md';
let project;

const abs = (relative) => path.join(project, relative);
const read = (relative) => fs.readFileSync(abs(relative), 'utf8');
const write = (relative, content) => {
  fs.mkdirSync(path.dirname(abs(relative)), { recursive: true });
  fs.writeFileSync(abs(relative), content);
};
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const sync = () => run('sync');
const git = (...args) => spawnSync('git', args, { cwd: project, encoding: 'utf8' });

// What a fresh clone has: only what git keeps.
const asFreshClone = () => {
  for (const entry of ignoredPaths()) fs.rmSync(abs(entry), { recursive: true, force: true });
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-sync-'));
  fs.cpSync(path.join(KIT_ROOT, 'fixtures', 'node'), project, { recursive: true });
  const result = run('--entry', 'brownfield', '--roles', 'backend');
  assert.strictEqual(result.status, 0, result.stderr);
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('the Installer keeps every file it copied out of git, and only those', () => {
  const ignored = ignoredPaths();
  assert.ok(ignored.includes('.ourkit/kit/'));
  assert.ok(ignored.includes('.claude/rules/ourkit.md'));
  assert.ok(ignored.includes('.claude/agents/ourkit-implementer.md'));
  assert.ok(ignored.includes('.claude/skills/ourkit-init/'));
  git('init', '-q');
  const untracked = git('ls-files', '--others', '--exclude-standard').stdout.split('\n').filter(Boolean);
  assert.ok(untracked.includes('.gitignore'));
  assert.ok(untracked.includes('.ourkit/install.json'));
  assert.ok(!untracked.some((file) => file.startsWith('.ourkit/kit/') || file.startsWith('.claude/')), untracked.join(', '));
});

test('keeps the project\'s own .gitignore lines and never repeats its block', () => {
  write('.gitignore', 'node_modules/\r\n');
  assert.strictEqual(sync().status, 0);
  assert.strictEqual(sync().status, 0);
  const text = read('.gitignore');
  assert.ok(text.startsWith('node_modules/\n\n# ourkit:start'));
  assert.strictEqual(text.split('# ourkit:end').length, 2);
});

test('rebuilds a fresh clone exactly as installed, leaving the record unchanged', () => {
  const record = read('.ourkit/install.json');
  const stage = read(STAGE);
  asFreshClone();
  const result = sync();
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /synced \d+ files/);
  assert.strictEqual(read(STAGE), stage);
  assert.ok(fs.existsSync(abs('.ourkit/kit/bin/ourkit.js')));
  assert.ok(fs.existsSync(abs('.ourkit/kit/roles/backend/checklist.md')));
  assert.ok(fs.existsSync(abs('.claude/rules/ourkit.md')));
  assert.strictEqual(read('.ourkit/install.json'), record);
});

test('picks up an Override, and a teammate\'s older copy is not taken for a hand edit', () => {
  write(STAGE_OVERRIDE, 'customized');
  assert.strictEqual(sync().status, 0);
  assert.strictEqual(read(STAGE), 'customized');
  // A teammate pulls the Override and the new record, but still has the kit's original copy.
  fs.copyFileSync(STAGE_SOURCE, abs(STAGE));
  const result = sync();
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(read(STAGE), 'customized');
});

test('refuses to overwrite a hand edit, and changes nothing', () => {
  write(STAGE, 'edited by hand');
  fs.rmSync(abs('.ourkit/kit/core'), { recursive: true });
  const result = sync();
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /edited by hand: \.claude\/skills\/ourkit-init\/SKILL\.md/);
  assert.match(result.stderr, /\.ourkit\/overrides/);
  assert.strictEqual(read(STAGE), 'edited by hand');
  assert.ok(!fs.existsSync(abs('.ourkit/kit/core')));
});

test('refuses another version and names the command for the project\'s own', () => {
  const record = JSON.parse(read('.ourkit/install.json'));
  record.version = '9.9.9';
  write('.ourkit/install.json', JSON.stringify(record));
  asFreshClone();
  const result = sync();
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /uses ourkit 9\.9\.9/);
  assert.match(result.stderr, /npx github:LanHuong142002\/ourkit#v9\.9\.9 sync/);
  assert.ok(!fs.existsSync(abs(STAGE)));
});

test('reports a project with no install', () => {
  fs.rmSync(abs('.ourkit'), { recursive: true });
  const result = sync();
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /not installed/);
});

test('the Installer tells teammates how to sync', () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-sync-'));
  try {
    const result = spawnSync(process.execPath, [BIN, other, '--entry', 'greenfield', '--roles', 'none'], { encoding: 'utf8' });
    assert.match(result.stdout, /#v\d+\.\d+\.\d+ sync/);
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }
});
