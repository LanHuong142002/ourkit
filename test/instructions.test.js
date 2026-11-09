const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { hashFile, removeLegacyInstructions } = require('../src/install');

const BIN = path.join(__dirname, '..', 'bin', 'ourkit.js');
const RULES = path.join('.claude', 'rules', 'ourkit.md');
let project;
const abs = (relative) => path.join(project, relative);
const read = (relative) => fs.readFileSync(abs(relative), 'utf8');
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
const installed = () => assert.strictEqual(run(project, '--entry', 'brownfield', '--roles', 'none').status, 0);
const legacyBlock = '<!-- ourkit:start: old -->\n# ourkit\n\nold text\n<!-- ourkit:end -->';

// Makes the project look as if an older version installed it, before the rules file existed.
const asOldInstall = () => {
  fs.rmSync(abs(RULES));
  const record = JSON.parse(read('.ourkit/install.json'));
  delete record.files['.claude/rules/ourkit.md'];
  record.version = '0.0.0-old';
  fs.writeFileSync(abs('.ourkit/install.json'), JSON.stringify(record));
};

beforeEach(() => { project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-instructions-')); });
afterEach(() => { fs.rmSync(project, { recursive: true, force: true }); });

test('the Installer points every session at the lifecycle through a rules file', () => {
  installed();
  assert.match(read(RULES), /propose a Tier/);
  assert.ok(!fs.existsSync(abs('CLAUDE.md')));
});

test('the project\'s CLAUDE.md is left alone', () => {
  fs.writeFileSync(abs('CLAUDE.md'), '# Our rules\n\nUse tabs.\n');
  installed();
  assert.strictEqual(read('CLAUDE.md'), '# Our rules\n\nUse tabs.\n');
});

test('a rules Override replaces the kit\'s rules file', () => {
  fs.mkdirSync(abs('.ourkit/overrides/rules'), { recursive: true });
  fs.writeFileSync(abs('.ourkit/overrides/rules/ourkit.md'), 'our own routing\n');
  installed();
  assert.strictEqual(read(RULES), 'our own routing\n');
});

test('upgrade moves the old block out of CLAUDE.md and keeps the project\'s text', () => {
  installed();
  asOldInstall();
  fs.writeFileSync(abs('CLAUDE.md'), `# Before\n\n${legacyBlock}\n\n# After\n`);
  const result = run('upgrade');
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(read('CLAUDE.md'), '# Before\n\n# After\n');
  assert.match(read(RULES), /propose a Tier/);
  assert.match(result.stdout, /moved the kit's block out of CLAUDE\.md/);
  assert.strictEqual(JSON.parse(read('.ourkit/install.json')).files['.claude/rules/ourkit.md'], hashFile(abs(RULES)));
});

test('upgrade deletes a CLAUDE.md that held only the old block', () => {
  installed();
  asOldInstall();
  fs.writeFileSync(abs('CLAUDE.md'), `${legacyBlock}\r\n`);
  assert.strictEqual(run('upgrade').status, 0);
  assert.ok(!fs.existsSync(abs('CLAUDE.md')));
});

test('a CLAUDE.md with no block is not touched', () => {
  fs.writeFileSync(abs('CLAUDE.md'), '# Ours\n');
  assert.strictEqual(removeLegacyInstructions(project), false);
  assert.strictEqual(read('CLAUDE.md'), '# Ours\n');
});
