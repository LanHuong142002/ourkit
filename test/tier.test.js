const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { scanSensitive } = require('../src/tier');

const BIN = path.join(__dirname, '..', 'bin', 'ourkit.js');
let project;

const git = (...args) => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
};
const change = (file) => {
  fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
  fs.writeFileSync(path.join(project, file), 'x');
};
const tier = (...args) => spawnSync(process.execPath, [BIN, 'tier', ...args], { cwd: project, encoding: 'utf8' });
const shown = () => JSON.parse(tier('show').stdout);

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-tier-'));
  git('init', '-q', '-b', 'main');
  change('first.txt');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('switch', '-q', '-c', 'feature/my-change');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

for (const [file, area] of [
  ['src/auth/session.js', 'auth'],
  ['lib/AuthService.java', 'auth'],
  ['db/migrations/001.txt', 'data'],
  ['db/schema.rb', 'schema'],
  ['queries/report.sql', 'schema'],
  ['src/billing/invoice.go', 'money'],
  ['api/openapi.yaml', 'public API'],
  ['docs/public-api/v1.md', 'public API'],
]) {
  test(`scan flags ${file} as ${area}`, () => {
    assert.ok(area in scanSensitive([file]), JSON.stringify(scanSensitive([file])));
  });
}

for (const file of ['src/author.js', 'README.md', 'src/authentic-looking-copy.txt', 'docs/moneyball.md', 'src/sessionless.css']) {
  test(`scan does not flag ${file}`, () => {
    assert.deepStrictEqual(scanSensitive([file]), {});
  });
}

test('sets a Patch on an ordinary change and shows its Stages', () => {
  change('src/button.css');
  const result = tier('set', 'patch', '--reason', 'One colour fix');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /Build -> Review/);
  assert.deepStrictEqual(shown().stages, ['Build', 'Review']);
  assert.strictEqual(shown().tierReason, 'One colour fix');
});

test('a Feature goes through every Stage and an Epic is split', () => {
  change('src/a.txt');
  tier('set', 'feature', '--reason', 'r');
  assert.deepStrictEqual(shown().stages, ['Spec', 'Plan', 'Tasks', 'Build', 'Review', 'Ship']);
  tier('set', 'epic', '--reason', 'r');
  assert.deepStrictEqual(shown().stages, ['Grill', 'Split into Features']);
});

test('refuses a Patch when the agent declared a Sensitive Area, even for one line', () => {
  change('src/a.txt');
  const result = tier('set', 'patch', '--reason', 'One line', '--sensitive', 'money');
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Sensitive Area \(money\).*ADR 0004/);
  assert.notStrictEqual(tier('show').status, 0, 'nothing recorded');
});

test('refuses a Patch when the scan matches', () => {
  change('src/auth/login.js');
  const result = tier('set', 'patch', '--reason', 'One line');
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /look like a Sensitive Area \(auth\)/);
});

test('a false scan match can be recorded with its reason', () => {
  change('styles/tokens.css');
  const result = tier('set', 'patch', '--reason', 'Colour fix', '--not-sensitive', 'Design tokens, not auth tokens');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(shown().notSensitiveReason, 'Design tokens, not auth tokens');
});

test('--not-sensitive cannot override a declared Sensitive Area', () => {
  change('src/a.txt');
  const result = tier('set', 'patch', '--reason', 'r', '--sensitive', 'money', '--not-sensitive', 'trust me');
  assert.strictEqual(result.status, 2);
});

test('a Sensitive Area is allowed at Feature and recorded', () => {
  change('src/auth/login.js');
  assert.strictEqual(tier('set', 'feature', '--reason', 'Login fix', '--sensitive', 'auth').status, 0);
  assert.deepStrictEqual(shown().sensitiveAreas, ['auth']);
});

test('needs a reason and a real Tier', () => {
  change('src/a.txt');
  assert.strictEqual(tier('set', 'patch').status, 2);
  assert.strictEqual(tier('set', 'huge', '--reason', 'r').status, 2);
  assert.strictEqual(tier('nonsense').status, 2);
});

test('show explains a change with no Tier, and branch names with slashes are stored flat', () => {
  change('src/a.txt');
  assert.match(tier('show').stderr, /no Tier yet/);
  tier('set', 'patch', '--reason', 'r');
  assert.deepStrictEqual(fs.readdirSync(path.join(project, '.ourkit', 'changes')), ['feature-my-change.json']);
});

test('scan prints what it found as JSON', () => {
  change('src/billing/x.txt');
  assert.deepStrictEqual(JSON.parse(tier('scan').stdout), { money: ['src/billing/x.txt'] });
});
