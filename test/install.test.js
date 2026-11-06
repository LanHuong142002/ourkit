const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { hashFile, parseRoles } = require('../src/install');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const STAGE_SOURCE = path.join(KIT_ROOT, 'stages', 'ourkit-ping', 'SKILL.md');
const STAGE = path.join('.claude', 'skills', 'ourkit-ping', 'SKILL.md');
const FLAGS = ['--entry', 'brownfield', '--roles', 'backend'];

let project;

const raw = (args, input) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8', input: input ?? '' });
const install = (args = FLAGS) => raw(args);
const record = () => JSON.parse(fs.readFileSync(path.join(project, '.ourkit', 'install.json'), 'utf8'));
const exists = (relative) => fs.existsSync(path.join(project, relative));

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-test-'));
  fs.cpSync(path.join(KIT_ROOT, 'fixtures', 'node'), project, { recursive: true });
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('copies Stages, Core, selected Roles and the command', () => {
  const result = install();
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(fs.readFileSync(path.join(project, STAGE), 'utf8'), fs.readFileSync(STAGE_SOURCE, 'utf8'));
  assert.ok(exists('.ourkit/kit/core/rule-layering.md'));
  assert.ok(exists('.ourkit/kit/roles/backend/checklist.md'));
  assert.ok(exists('.ourkit/kit/bin/ourkit.js'));
  assert.ok(!exists('.ourkit/kit/roles/frontend'));
});

test('installs Full-stack as both Roles', () => {
  assert.strictEqual(install(['--entry', 'brownfield', '--roles', 'full-stack']).status, 0);
  assert.deepStrictEqual(record().roles, ['backend', 'frontend']);
  assert.ok(exists('.ourkit/kit/roles/frontend/guidance.md'));
  assert.ok(exists('.ourkit/kit/roles/backend/guidance.md'));
  assert.ok(!exists('.ourkit/kit/roles/full-stack'));
});

test('allows installing with no Role', () => {
  assert.strictEqual(install(['--entry', 'greenfield', '--roles', 'none']).status, 0);
  assert.deepStrictEqual(record().roles, []);
  assert.ok(!exists('.ourkit/kit/roles'));
});

test('records the entry, Roles, detected files and a hash of every installed file', () => {
  install();
  const { entry, roles, detected, files, host } = record();
  assert.strictEqual(entry, 'brownfield');
  assert.strictEqual(host, 'claude-code');
  assert.deepStrictEqual(roles, ['backend']);
  assert.deepStrictEqual(detected, ['package.json']);
  assert.strictEqual(files['.claude/skills/ourkit-ping/SKILL.md'], hashFile(path.join(project, STAGE)));
  for (const relative of Object.keys(files)) assert.ok(exists(relative), relative);
});

test('hashes ignore line endings', () => {
  const lf = path.join(project, 'lf.txt');
  const crlf = path.join(project, 'crlf.txt');
  fs.writeFileSync(lf, 'a\nb\n');
  fs.writeFileSync(crlf, 'a\r\nb\r\n');
  assert.strictEqual(hashFile(lf), hashFile(crlf));
});

test('detection records presence only and leaves project files alone', () => {
  const before = fs.readFileSync(path.join(project, 'package.json'), 'utf8');
  install();
  assert.strictEqual(fs.readFileSync(path.join(project, 'package.json'), 'utf8'), before);
  assert.ok(!exists('.ourkit/stack-profile.json'));
});

test('applies a Stage Override when installing', () => {
  const override = path.join(project, '.ourkit', 'overrides', 'stages', 'ourkit-ping', 'SKILL.md');
  fs.mkdirSync(path.dirname(override), { recursive: true });
  fs.writeFileSync(override, 'customized');
  assert.strictEqual(install().status, 0);
  assert.strictEqual(fs.readFileSync(path.join(project, STAGE), 'utf8'), 'customized');
});

test('refuses to install twice and points to upgrade', () => {
  assert.strictEqual(install().status, 0);
  fs.writeFileSync(path.join(project, STAGE), 'edited by hand');
  const second = install();
  assert.strictEqual(second.status, 1);
  assert.match(second.stderr, /already installed.*upgrade/);
  assert.strictEqual(fs.readFileSync(path.join(project, STAGE), 'utf8'), 'edited by hand');
});

test('writes nothing when a target file is in the way', () => {
  fs.mkdirSync(path.dirname(path.join(project, STAGE)), { recursive: true });
  fs.writeFileSync(path.join(project, STAGE), 'mine');
  const result = install();
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /in the way/);
  assert.ok(!exists('.ourkit'));
  assert.strictEqual(fs.readFileSync(path.join(project, STAGE), 'utf8'), 'mine');
});

for (const [label, args, pattern] of [
  ['an unknown Role', ['--entry', 'brownfield', '--roles', 'database'], /unknown Role: database/],
  ['an unknown entry', ['--entry', 'sideways', '--roles', 'none'], /entry must be/],
]) {
  test(`rejects ${label} before writing anything`, () => {
    const result = install(args);
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, pattern);
    assert.ok(!exists('.ourkit'));
  });
}

test('accepts a target directory argument', () => {
  const target = path.join(project, 'nested');
  fs.mkdirSync(target);
  assert.strictEqual(install([target, ...FLAGS]).status, 0);
  assert.ok(fs.existsSync(path.join(target, STAGE)));
});

test('rejects a target directory that does not exist', () => {
  assert.strictEqual(install([path.join(project, 'missing'), ...FLAGS]).status, 2);
});

test('asks its questions, suggesting Brownfield when the project has code', () => {
  const result = raw([], '\nfrontend\n');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[brownfield\]/);
  assert.strictEqual(record().entry, 'brownfield');
  assert.deepStrictEqual(record().roles, ['frontend']);
});

test('suggests Greenfield for an empty project', () => {
  const empty = path.join(project, 'empty');
  fs.mkdirSync(empty);
  const result = raw([empty], '\nnone\n');
  assert.match(result.stdout, /\[greenfield\]/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(empty, '.ourkit', 'install.json'), 'utf8')).entry, 'greenfield');
});

test('asks again after an invalid answer', () => {
  const result = raw([], 'sideways\nbrownfield\ndatabase\n\nbackend\n');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /entry must be/);
  assert.match(result.stdout, /unknown Role: database/);
  assert.match(result.stdout, /choose at least one/);
  assert.deepStrictEqual(record().roles, ['backend']);
});

test('installs nothing when input ends early', () => {
  const result = raw([], 'brownfield\n');
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /nothing was installed/);
  assert.ok(!exists('.ourkit'));
});

test('points to Init', () => {
  assert.match(install().stdout, /\/ourkit-init/);
});

test('parses Role answers', () => {
  assert.deepStrictEqual(parseRoles(' Backend , backend '), { roles: ['backend'] });
  assert.deepStrictEqual(parseRoles('none'), { roles: [] });
  assert.ok(parseRoles('x').error);
});

test('the vendored command works from the project and sees the layered rules', () => {
  install();
  fs.writeFileSync(path.join(project, '.ourkit', 'rules.md'), 'Project rule here.\n');
  const vendored = path.join(project, '.ourkit', 'kit', 'bin', 'ourkit.js');
  const rules = spawnSync(process.execPath, [vendored, 'rules'], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(rules.status, 0, rules.stderr);
  assert.match(rules.stdout, /<!-- Core: \.ourkit\/kit\/core\/rule-layering\.md -->/);
  assert.match(rules.stdout, /<!-- Role: \.ourkit\/kit\/roles\/backend\/checklist\.md -->/);
  assert.ok(rules.stdout.trimEnd().endsWith('Project rule here.'));
  const lookup = spawnSync(process.execPath, [vendored, 'command', 'test'], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(lookup.status, 1);
  assert.match(lookup.stderr, /no \.ourkit\/stack-profile\.json/);
});
