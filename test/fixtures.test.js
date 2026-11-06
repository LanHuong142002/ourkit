const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const FIXTURES = path.join(KIT_ROOT, 'fixtures');
const EXPECTED_MARKERS = { node: ['package.json'], python: ['pyproject.toml'], 'api-only': ['go.mod'] };
let project;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-fixture-'));
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('the three named Fixture Projects exist', () => {
  assert.deepStrictEqual(fs.readdirSync(FIXTURES).sort(), Object.keys(EXPECTED_MARKERS).sort());
});

for (const [fixture, markers] of Object.entries(EXPECTED_MARKERS)) {
  test(`the kit installs and works on the ${fixture} Fixture Project`, () => {
    fs.cpSync(path.join(FIXTURES, fixture), project, { recursive: true });
    const before = Object.fromEntries(
      fs.readdirSync(project).map((name) => [name, fs.readFileSync(path.join(project, name), 'utf8')]),
    );

    const installed = spawnSync(process.execPath, [BIN, '--entry', 'brownfield', '--roles', 'full-stack'], { cwd: project, encoding: 'utf8' });
    assert.strictEqual(installed.status, 0, installed.stderr);

    const record = JSON.parse(fs.readFileSync(path.join(project, '.ourkit', 'install.json'), 'utf8'));
    assert.deepStrictEqual(record.detected, markers);
    for (const [name, content] of Object.entries(before)) {
      assert.strictEqual(fs.readFileSync(path.join(project, name), 'utf8'), content, name);
    }

    const vendored = path.join(project, '.ourkit', 'kit', 'bin', 'ourkit.js');
    const check = spawnSync(process.execPath, [vendored, 'check', '--project'], { cwd: project, encoding: 'utf8' });
    assert.strictEqual(check.status, 0, check.stderr);
    const rules = spawnSync(process.execPath, [vendored, 'rules'], { cwd: project, encoding: 'utf8' });
    assert.strictEqual(rules.status, 0, rules.stderr);
    assert.match(rules.stdout, /<!-- Core: /);
    assert.match(rules.stdout, /roles\/frontend\/checklist\.md/);
  });
}
