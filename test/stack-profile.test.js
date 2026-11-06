const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { InvalidStackProfile, lookupCommand } = require('../src/stack-profile');

const BIN = path.join(__dirname, '..', 'bin', 'ourkit.js');
let project;

const writeRaw = (content) => {
  fs.mkdirSync(path.join(project, '.ourkit'), { recursive: true });
  fs.writeFileSync(path.join(project, '.ourkit', 'stack-profile.json'), content);
};
const writeProfile = (profile) => writeRaw(JSON.stringify(profile));
const run = (...args) => spawnSync(process.execPath, [BIN, 'command', ...args], { encoding: 'utf8' });

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-profile-'));
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('finds a declared command', () => {
  writeProfile({ technologies: ['x'], commands: { test: 'make test' } });
  assert.deepStrictEqual(lookupCommand(project, 'test'), { found: true, command: 'make test' });
});

test('finds optional deploy and smoke commands', () => {
  writeProfile({ technologies: [], commands: { deploy: 'd', smoke: 's' } });
  assert.strictEqual(lookupCommand(project, 'deploy').command, 'd');
  assert.strictEqual(lookupCommand(project, 'smoke').command, 's');
});

test('reports each kind of missing command without failing', () => {
  assert.deepStrictEqual(lookupCommand(project, 'test'), { found: false, reason: 'no-profile' });
  writeProfile({ technologies: [], commands: { lint: null } });
  assert.deepStrictEqual(lookupCommand(project, 'test'), { found: false, reason: 'not-declared' });
  assert.deepStrictEqual(lookupCommand(project, 'lint'), { found: false, reason: 'none' });
});

test('reads a file saved with a byte order mark', () => {
  writeRaw(`﻿${JSON.stringify({ technologies: [], commands: { test: 't' } })}`);
  assert.strictEqual(lookupCommand(project, 'test').command, 't');
});

for (const [label, content, pattern] of [
  ['malformed JSON', '{ nope', /valid JSON/],
  ['a non-object', '[]', /JSON object/],
  ['missing technologies', '{"commands":{}}', /technologies/],
  ['missing commands', '{"technologies":[]}', /commands must be an object/],
  ['an unknown command name', '{"technologies":[],"commands":{"tset":"x"}}', /unknown command "tset"/],
  ['an empty command', '{"technologies":[],"commands":{"test":"  "}}', /non-empty string/],
  ['a non-string command', '{"technologies":[],"commands":{"test":1}}', /non-empty string/],
]) {
  test(`rejects a Stack Profile with ${label}`, () => {
    writeRaw(content);
    assert.throws(() => lookupCommand(project, 'test'), (error) => {
      assert.ok(error instanceof InvalidStackProfile);
      assert.match(error.message, pattern);
      return true;
    });
  });
}

test('rejects an unknown lookup name', () => {
  assert.throws(() => lookupCommand(project, 'tset'), InvalidStackProfile);
});

test('command prints a found command and exits 0', () => {
  writeProfile({ technologies: [], commands: { test: 'make test' } });
  const result = run('test', project);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.stdout.trim(), 'make test');
});

test('command explains a missing command and exits 1', () => {
  const result = run('test', project);
  assert.strictEqual(result.status, 1);
  assert.strictEqual(result.stdout, '');
  assert.match(result.stderr, /no "test" command: the project has no \.ourkit\/stack-profile\.json/);
});

test('command exits 2 on an invalid profile, an unknown name or no name', () => {
  assert.strictEqual(run('tset', project).status, 2);
  assert.match(run().stderr, /usage: ourkit command/);
  assert.strictEqual(run().status, 2);
  writeRaw('{ nope');
  assert.strictEqual(run('test', project).status, 2);
});
