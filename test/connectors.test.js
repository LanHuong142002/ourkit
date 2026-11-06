const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { checkConnectors, readPending } = require('../src/connectors');
const { runProjectCheck } = require('../src/contract-check');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
// Built by joining, so that this test file doesn't itself look like it holds a token.
const FAKE_TOKEN = ['ghp', '_', 'a'.repeat(36)].join('');
let project;

const writeConfig = (config) => fs.writeFileSync(path.join(project, '.mcp.json'), typeof config === 'string' ? config : JSON.stringify(config));
const pending = (...args) => spawnSync(process.execPath, [BIN, 'pending', ...args], { cwd: project, encoding: 'utf8' });
const server = (fields) => ({ mcpServers: { demo: { command: 'demo-server', ...fields } } });

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-connector-'));
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('a project with no Connectors passes', () => {
  assert.deepStrictEqual(checkConnectors(project), []);
});

test('accepts variable references in env and headers', () => {
  writeConfig(server({ env: { TOKEN: '${DEMO_TOKEN}' }, headers: { Authorization: 'Bearer ${DEMO_TOKEN}' } }));
  assert.deepStrictEqual(checkConnectors(project), []);
});

test('accepts ordinary values outside env and headers', () => {
  writeConfig(server({ args: ['--port', '8080'], url: 'https://example.com/mcp' }));
  assert.deepStrictEqual(checkConnectors(project), []);
});

for (const [label, fields] of [
  ['a literal env value', { env: { TOKEN: 'plain-secret' } }],
  ['a literal header', { headers: { Authorization: 'Bearer plain-secret' } }],
  ['a token in args', { args: ['--token', FAKE_TOKEN] }],
  ['a token in a URL', { url: `https://example.com/mcp?key=${FAKE_TOKEN}` }],
]) {
  test(`reports ${label} without printing it`, () => {
    writeConfig(server(fields));
    const problems = checkConnectors(project);
    assert.strictEqual(problems.length, 1, JSON.stringify(problems));
    assert.strictEqual(problems[0].contract, 'Connector');
    assert.ok(!problems[0].message.includes('plain-secret'));
    assert.ok(!problems[0].message.includes(FAKE_TOKEN));
  });
}

test('reports malformed JSON', () => {
  writeConfig('{ nope');
  assert.match(checkConnectors(project)[0].message, /valid JSON/);
});

test('check --project includes Connectors', () => {
  writeConfig(server({ env: { TOKEN: 'plain-secret' } }));
  assert.strictEqual(runProjectCheck(project).problems[0].contract, 'Connector');
  const result = spawnSync(process.execPath, [BIN, 'check', '--project', project], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('plain-secret'));
});

test('pending prints nothing when no work is waiting', () => {
  const result = pending();
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
});

test('pending saves items and raises them in exactly one line', () => {
  pending('add', 'Sign in to GitHub');
  pending('add', 'Create a\nVercel token');
  const { stdout } = pending();
  assert.strictEqual(stdout.trim().split('\n').length, 1);
  assert.match(stdout, /2 setup item\(s\) waiting: 1\. Sign in to GitHub; 2\. Create a Vercel token/);
});

test('finishing every item clears the file, and ids stay unique', () => {
  pending('add', 'One');
  pending('add', 'Two');
  assert.strictEqual(pending('done', '1').status, 0);
  pending('add', 'Three');
  assert.deepStrictEqual(readPending(project).map(({ id }) => id), [2, 3]);
  pending('done', '2');
  pending('done', '3');
  assert.ok(!fs.existsSync(path.join(project, '.ourkit', 'pending.json')));
  assert.strictEqual(pending().stdout, '');
});

test('pending rejects a bad id and bad usage', () => {
  assert.strictEqual(pending('done', '9').status, 1);
  assert.strictEqual(pending('add').status, 2);
  assert.strictEqual(pending('other').status, 2);
});

test('Init covers Connectors and starts by raising waiting work', () => {
  const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-init', 'SKILL.md'), 'utf8');
  for (const required of ['## Connectors', 'Never write a token', 'ourkit pending add', 'Run `ourkit pending` first', 'ourkit check --project']) {
    assert.ok(stage.includes(required), required);
  }
});
