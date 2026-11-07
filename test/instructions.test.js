const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { applyInstructions } = require('../src/install');

const BIN = path.join(__dirname, '..', 'bin', 'ourkit.js');
let project;
const file = () => path.join(project, 'CLAUDE.md');
const read = () => fs.readFileSync(file(), 'utf8');
const count = (text, part) => text.split(part).length - 1;
const installed = () => assert.strictEqual(spawnSync(process.execPath, [BIN, project, '--entry', 'brownfield', '--roles', 'none'], { encoding: 'utf8' }).status, 0);

beforeEach(() => { project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-instructions-')); });
afterEach(() => { fs.rmSync(project, { recursive: true, force: true }); });

test('the Installer points every session at the lifecycle', () => {
  installed();
  assert.match(read(), /propose a Tier/);
  assert.match(read(), /ourkit:start/);
  assert.match(read(), /ourkit:end/);
});

test('an existing file keeps its own text', () => {
  fs.writeFileSync(file(), '# Our rules\n\nUse tabs.\n');
  installed();
  assert.ok(read().startsWith('# Our rules\n\nUse tabs.\n'));
  assert.match(read(), /propose a Tier/);
});

test('upgrade replaces only the kit\'s block, wherever it is', () => {
  fs.writeFileSync(file(), '# Before\n\n<!-- ourkit:start: old -->\nold text\n<!-- ourkit:end -->\n\n# After\n');
  applyInstructions(project);
  const text = read();
  assert.ok(!text.includes('old text'));
  assert.ok(text.startsWith('# Before\n\n'));
  assert.ok(text.endsWith('\n\n# After\n'));
});

test('applying it twice changes nothing', () => {
  installed();
  const once = read();
  assert.strictEqual(spawnSync(process.execPath, [BIN, 'upgrade', project], { encoding: 'utf8' }).status, 0);
  assert.strictEqual(read(), once);
  assert.strictEqual(count(read(), 'ourkit:end'), 1);
});
