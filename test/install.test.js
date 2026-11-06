const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const SOURCE = path.join(KIT_ROOT, 'stages', 'ourkit-ping', 'SKILL.md');
const INSTALLED = path.join('.claude', 'skills', 'ourkit-ping', 'SKILL.md');

let project;

const install = (args = []) =>
  spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-test-'));
  fs.cpSync(path.join(KIT_ROOT, 'fixtures', 'node'), project, { recursive: true });
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('copies the Stage into the Host skills folder', () => {
  const result = install();
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(
    fs.readFileSync(path.join(project, INSTALLED), 'utf8'),
    fs.readFileSync(SOURCE, 'utf8'),
  );
});

test('leaves existing project files alone', () => {
  const before = fs.readFileSync(path.join(project, 'package.json'), 'utf8');
  install();
  assert.strictEqual(fs.readFileSync(path.join(project, 'package.json'), 'utf8'), before);
});

test('refuses to overwrite an existing install', () => {
  assert.strictEqual(install().status, 0);
  const edited = 'edited by hand';
  fs.writeFileSync(path.join(project, INSTALLED), edited);

  const second = install();

  assert.strictEqual(second.status, 1);
  assert.match(second.stderr, /already installed/);
  assert.strictEqual(fs.readFileSync(path.join(project, INSTALLED), 'utf8'), edited);
});

test('accepts a target directory argument', () => {
  const target = path.join(project, 'nested');
  fs.mkdirSync(target);
  assert.strictEqual(install([target]).status, 0);
  assert.ok(fs.existsSync(path.join(target, INSTALLED)));
});
