const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runContractCheck } = require('../src/contract-check');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const VALID_SKILL = '---\nname: ourkit-demo\ndescription: A demo Stage.\n---\n\nDo the work.\n';
const VALID_SHELL = { host: 'demo-host', stagesDir: '.demo/skills' };

let kit;

const write = (relative, content) => {
  const file = path.join(kit, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const writeSkill = (content) => write('stages/ourkit-demo/SKILL.md', content);
const writeShell = (shell) => write('hosts/demo-host/shell.json', JSON.stringify(shell));

// Asserts exactly one problem, so a rule that fires wrongly can't go unnoticed.
const assertOneProblem = (contract, messagePattern) => {
  const { problems } = runContractCheck(kit);
  assert.strictEqual(problems.length, 1, JSON.stringify(problems, null, 2));
  assert.strictEqual(problems[0].contract, contract);
  assert.match(problems[0].message, messagePattern);
};

beforeEach(() => {
  kit = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-check-'));
  writeSkill(VALID_SKILL);
  writeShell(VALID_SHELL);
});

afterEach(() => {
  fs.rmSync(kit, { recursive: true, force: true });
});

test('the kit itself satisfies its contracts', () => {
  assert.deepStrictEqual(runContractCheck(KIT_ROOT).problems, []);
});

test('accepts a valid kit', () => {
  assert.deepStrictEqual(runContractCheck(kit).problems, []);
});

test('accepts a SKILL.md with Windows line endings', () => {
  writeSkill(VALID_SKILL.replace(/\n/g, '\r\n'));
  assert.deepStrictEqual(runContractCheck(kit).problems, []);
});

test('requires at least one Stage and one Host Shell', () => {
  fs.rmSync(path.join(kit, 'stages'), { recursive: true });
  assertOneProblem('Stage', /at least one Stage/);
  writeSkill(VALID_SKILL);
  fs.rmSync(path.join(kit, 'hosts'), { recursive: true });
  assertOneProblem('Host Shell', /at least one Host Shell/);
});

const stageCases = [
  ['a missing frontmatter block', 'Do the work.\n', /frontmatter block/],
  ['a missing name', '---\ndescription: A demo Stage.\n---\n\nDo the work.\n', /must set name/],
  ['a missing description', '---\nname: ourkit-demo\n---\n\nDo the work.\n', /must set description/],
  ['a multi-line description', '---\nname: ourkit-demo\ndescription: >\n  A demo.\n---\n\nDo the work.\n', /on one line/],
  ['an overlong description', `---\nname: ourkit-demo\ndescription: ${'x'.repeat(1025)}\n---\n\nDo the work.\n`, /at most 1024/],
  ['empty instructions', '---\nname: ourkit-demo\ndescription: A demo Stage.\n---\n\n', /must have instructions/],
  ['a name that differs from its folder', VALID_SKILL.replace('name: ourkit-demo', 'name: ourkit-other'), /must match its folder/],
];
for (const [label, content, pattern] of stageCases) {
  test(`rejects a Stage with ${label}`, () => {
    writeSkill(content);
    assertOneProblem('Stage', pattern);
  });
}

test('rejects a Stage folder without SKILL.md', () => {
  fs.rmSync(path.join(kit, 'stages/ourkit-demo/SKILL.md'));
  assertOneProblem('Stage', /must contain SKILL.md/);
});

test('rejects a Stage name without the kit prefix', () => {
  fs.rmSync(path.join(kit, 'stages/ourkit-demo'), { recursive: true });
  write('stages/demo/SKILL.md', VALID_SKILL.replace('ourkit-demo', 'demo'));
  assertOneProblem('Stage', /must start with "ourkit-"/);
});

test('rejects a Stage name that breaks the naming rule', () => {
  fs.rmSync(path.join(kit, 'stages/ourkit-demo'), { recursive: true });
  write('stages/ourkit--Demo/SKILL.md', VALID_SKILL.replace('ourkit-demo', 'ourkit--Demo'));
  assertOneProblem('Stage', /lowercase words/);
});

const shellCases = [
  ['a host that differs from its folder', { ...VALID_SHELL, host: 'other' }, /must match its folder/],
  ['a missing stagesDir', { host: 'demo-host' }, /non-empty path/],
  ['an absolute stagesDir', { ...VALID_SHELL, stagesDir: '/etc/skills' }, /inside the project/],
  ['a Windows absolute stagesDir', { ...VALID_SHELL, stagesDir: 'C:\\skills' }, /inside the project/],
  ['a stagesDir that climbs out', { ...VALID_SHELL, stagesDir: '../skills' }, /inside the project/],
  ['a stagesDir that climbs out with backslashes', { ...VALID_SHELL, stagesDir: 'a\\..\\..\\skills' }, /inside the project/],
];
for (const [label, shell, pattern] of shellCases) {
  test(`rejects a Host Shell with ${label}`, () => {
    writeShell(shell);
    assertOneProblem('Host Shell', pattern);
  });
}

test('rejects a Host Shell that is missing or malformed', () => {
  write('hosts/demo-host/shell.json', '{ not json');
  assertOneProblem('Host Shell', /valid JSON/);
  write('hosts/demo-host/shell.json', '[]');
  assertOneProblem('Host Shell', /JSON object/);
  fs.rmSync(path.join(kit, 'hosts/demo-host/shell.json'));
  assertOneProblem('Host Shell', /file is missing/);
});

for (const [location, line] of [
  ['core/rules.md', 'Run `npm test` first.'],
  ['core/rules.md', 'Read package.json for scripts.'],
  ['core/rules.md', 'Use `go test ./...`.'],
  ['core/rules.md', 'Written for Python projects.'],
  ['core/rules.md', 'Run `bundle exec rspec`.'],
  ['core/rules.md', 'Built with Express on the server.'],
  ['stages/ourkit-demo/guide.md', 'Prefer React components.'],
]) {
  test(`rejects "${line}" in ${location}`, () => {
    write(location, `${line}\n`);
    assertOneProblem('Stack neutrality', /Stack Profile/);
  });
}

test('reports the line of a stack assumption', () => {
  write('core/rules.md', 'Fine line.\nRun yarn here.\n');
  const [problem] = runContractCheck(kit).problems;
  assert.strictEqual(problem.file.replace(/\\/g, '/'), 'core/rules.md:2');
});

for (const line of [
  'Express the idea clearly and go on.',
  'Go test the change with the command from the Stack Profile.',
  'React quickly to rust, swift and spring changes.',
  'Bundle the files, then jest about the poetry of the composer.',
]) {
  test(`allows ordinary English: "${line}"`, () => {
    write('core/rules.md', `${line}\n`);
    const { problems } = runContractCheck(kit);
    assert.deepStrictEqual(problems, []);
  });
}

test('ignores stack terms outside Core and Stages', () => {
  write('stack-packs/demo/pack.json', JSON.stringify({ name: 'demo', technologies: ['Demo'] }));
  write('stack-packs/demo/conventions.md', 'Run npm test.\n');
  assert.deepStrictEqual(runContractCheck(kit).problems, []);
});

test('command exits 0 and reports counts on a valid kit', () => {
  const result = spawnSync(process.execPath, [BIN, 'check', kit], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK \(1 Stage\(s\), 1 Host Shell\(s\), 0 Role\(s\), 0 Stack Pack\(s\)\)/);
});

test('command exits 1 and names the file on a broken kit', () => {
  writeSkill('Do the work.\n');
  const result = spawnSync(process.execPath, [BIN, 'check', kit], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /stages\/ourkit-demo\/SKILL\.md: \[Stage\]/);
});

test('command checks the kit itself by default and installs nothing', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-cwd-'));
  try {
    const result = spawnSync(process.execPath, [BIN, 'check'], { cwd, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(fs.readdirSync(cwd), []);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
