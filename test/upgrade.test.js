const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { hashFile } = require('../src/install');
const { overridePathFor } = require('../src/upgrade');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const CORE = '.ourkit/kit/core/rule-layering.md';
const CORE_OVERRIDE = '.ourkit/overrides/core/rule-layering.md';
const STAGE = '.claude/skills/ourkit-init/SKILL.md';
const STAGE_OVERRIDE = '.ourkit/overrides/stages/ourkit-init/SKILL.md';
let project;

const abs = (relative) => path.join(project, relative);
const read = (relative) => fs.readFileSync(abs(relative), 'utf8');
const write = (relative, content) => {
  fs.mkdirSync(path.dirname(abs(relative)), { recursive: true });
  fs.writeFileSync(abs(relative), content);
};
const record = () => JSON.parse(read('.ourkit/install.json'));
const writeRecord = (value) => write('.ourkit/install.json', JSON.stringify(value));
const upgrade = (args = [], input = '') =>
  spawnSync(process.execPath, [BIN, 'upgrade', ...args], { cwd: project, encoding: 'utf8', input });

// Makes a file look as if an older kit version installed it, so it isn't a hand edit.
const asOldVersion = (relative, content) => {
  write(relative, content);
  const current = record();
  current.files[relative] = hashFile(abs(relative));
  current.version = '0.0.0-old';
  writeRecord(current);
};

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-upgrade-'));
  fs.cpSync(path.join(KIT_ROOT, 'fixtures', 'node'), project, { recursive: true });
  const result = spawnSync(process.execPath, [BIN, '--entry', 'brownfield', '--roles', 'backend'], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('replaces unedited kit files and updates the record', () => {
  const kitContent = read(CORE);
  asOldVersion(CORE, 'old content');
  const result = upgrade();
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(read(CORE), kitContent);
  assert.strictEqual(record().version, JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8')).version);
  assert.strictEqual(record().files[CORE], hashFile(abs(CORE)));
  assert.match(result.stdout, /upgraded 0\.0\.0-old to/);
});

test('adds new kit files and removes ones the kit no longer has', () => {
  const current = record();
  fs.rmSync(abs(CORE));
  delete current.files[CORE];
  writeRecord(current);
  asOldVersion('.ourkit/kit/core/retired/old.md', 'gone soon');
  assert.strictEqual(upgrade().status, 0);
  assert.ok(fs.existsSync(abs(CORE)));
  assert.ok(!fs.existsSync(abs('.ourkit/kit/core/retired')));
  assert.ok(!('.ourkit/kit/core/retired/old.md' in record().files));
});

test('restores a kit file that was deleted', () => {
  fs.rmSync(abs(CORE));
  assert.strictEqual(upgrade().status, 0);
  assert.ok(fs.existsSync(abs(CORE)));
});

test('line ending changes are not treated as hand edits', () => {
  // Flip whichever line ending the checkout has, since git may have changed it.
  const content = read(CORE);
  write(CORE, content.includes('\r\n') ? content.replace(/\r\n/g, '\n') : content.replace(/\n/g, '\r\n'));
  assert.strictEqual(upgrade().status, 0);
  assert.ok(!fs.existsSync(abs(CORE_OVERRIDE)));
});

test('leaves Overrides, Project Rules, Project Roles and Stack Packs alone', () => {
  write(CORE_OVERRIDE, 'override');
  write('.ourkit/rules.md', 'rules');
  write('.ourkit/roles/r/guidance.md', 'role');
  write('.ourkit/kit/stack-packs/p/conventions.md', 'pack');
  write('.ourkit/stack-profile.json', '{}');
  assert.strictEqual(upgrade().status, 0);
  assert.strictEqual(read(CORE_OVERRIDE), 'override');
  assert.strictEqual(read('.ourkit/rules.md'), 'rules');
  assert.strictEqual(read('.ourkit/roles/r/guidance.md'), 'role');
  assert.strictEqual(read('.ourkit/kit/stack-packs/p/conventions.md'), 'pack');
  assert.strictEqual(read('.ourkit/stack-profile.json'), '{}');
});

test('keeps the entry and Roles', () => {
  upgrade();
  assert.strictEqual(record().entry, 'brownfield');
  assert.deepStrictEqual(record().roles, ['backend']);
});

test('offers to move a hand edit, and moves it when accepted', () => {
  const kitContent = read(CORE);
  write(CORE, 'my edit');
  const result = upgrade([], 'y\n');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /edited by hand/);
  assert.strictEqual(read(CORE_OVERRIDE), 'my edit');
  assert.strictEqual(read(CORE), kitContent);
});

for (const [label, input] of [['declined', 'n\n'], ['unanswered', '']]) {
  test(`changes nothing when the move is ${label}`, () => {
    asOldVersion(STAGE, 'old stage');
    write(CORE, 'my edit');
    const before = read('.ourkit/install.json');
    const result = upgrade([], input);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /nothing was changed/);
    assert.strictEqual(read(CORE), 'my edit');
    assert.strictEqual(read(STAGE), 'old stage');
    assert.strictEqual(read('.ourkit/install.json'), before);
    assert.ok(!fs.existsSync(abs(CORE_OVERRIDE)));
  });
}

test('--move-edits moves without asking', () => {
  write(CORE, 'my edit');
  assert.strictEqual(upgrade(['--move-edits']).status, 0);
  assert.strictEqual(read(CORE_OVERRIDE), 'my edit');
});

test('--discard-edits drops the edit', () => {
  const kitContent = read(CORE);
  write(CORE, 'my edit');
  assert.strictEqual(upgrade(['--discard-edits']).status, 0);
  assert.strictEqual(read(CORE), kitContent);
  assert.ok(!fs.existsSync(abs(CORE_OVERRIDE)));
});

test('a moved Stage edit stays in effect after the upgrade', () => {
  write(STAGE, 'my stage');
  assert.strictEqual(upgrade(['--move-edits']).status, 0);
  assert.strictEqual(read(STAGE_OVERRIDE), 'my stage');
  assert.strictEqual(read(STAGE), 'my stage');
  assert.strictEqual(upgrade().status, 0, 'a second upgrade sees no hand edit');
  assert.strictEqual(read(STAGE), 'my stage');
});

test('refuses when a hand edit already has an Override, and changes nothing', () => {
  write(CORE, 'my edit');
  write(CORE_OVERRIDE, 'older override');
  const result = upgrade(['--move-edits']);
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /merge them by hand/);
  assert.strictEqual(read(CORE), 'my edit');
  assert.strictEqual(read(CORE_OVERRIDE), 'older override');
});

test('edits to the kit\'s own code stop the upgrade until discarded', () => {
  const code = '.ourkit/kit/src/rules.js';
  const original = read(code);
  write(code, '// my edit');
  const refused = upgrade(['--move-edits']);
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /can't customize/);
  assert.strictEqual(read(code), '// my edit');
  assert.strictEqual(upgrade(['--discard-edits']).status, 0);
  assert.strictEqual(read(code), original);
});

test('refuses when a new kit file would overwrite a user file', () => {
  const current = record();
  delete current.files[CORE];
  writeRecord(current);
  write(CORE, 'not from the kit');
  const result = upgrade();
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /in the way/);
  assert.strictEqual(read(CORE), 'not from the kit');
});

test('warns about an Override left with no kit file', () => {
  write('.ourkit/overrides/core/renamed.md', 'stale');
  const result = upgrade();
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /renamed\.md no longer matches/);
});

test('reports a project with no install', () => {
  fs.rmSync(abs('.ourkit/install.json'));
  const result = upgrade();
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /not installed/);
});

test('maps kit files to Override paths', () => {
  const normalize = (p) => p && p.replace(/\\/g, '/');
  assert.strictEqual(normalize(overridePathFor(CORE)), CORE_OVERRIDE);
  assert.strictEqual(normalize(overridePathFor(STAGE)), STAGE_OVERRIDE);
  assert.strictEqual(normalize(overridePathFor('.claude/rules/ourkit.md')), '.ourkit/overrides/rules/ourkit.md');
  assert.strictEqual(overridePathFor('.ourkit/kit/bin/ourkit.js'), null);
});

test('points to untracking kit files that an older version had committed', () => {
  assert.strictEqual(spawnSync('git', ['init', '-q'], { cwd: project }).status, 0);
  assert.strictEqual(spawnSync('git', ['add', '-f', CORE], { cwd: project }).status, 0);
  asOldVersion(CORE, 'old content');
  const result = upgrade();
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /git rm -r --cached/);
});

test('says nothing about untracking when git tracks no kit file', () => {
  assert.strictEqual(spawnSync('git', ['init', '-q'], { cwd: project }).status, 0);
  asOldVersion(CORE, 'old content');
  assert.doesNotMatch(upgrade().stdout, /git rm/);
});
