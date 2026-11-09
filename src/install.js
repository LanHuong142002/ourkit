// Installer: asks its questions, copies the kit and records what it did.
// Deterministic by design (ADR 0005): inference is left to Init. What it copies stays out of
// git, and `sync` rebuilds it from the install record (ADR 0014).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { OVERRIDES_DIR } = require('./overrides');

const KIT_ROOT = path.join(__dirname, '..');
const KIT_DIR = path.join('.ourkit', 'kit');
const INSTALL_RECORD = path.join('.ourkit', 'install.json');
const HOST = 'claude-code';
const ENTRIES = ['greenfield', 'brownfield'];
// Files whose presence hints at a stack. Only presence is recorded; Init does the understanding.
const STACK_MARKERS = [
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile', 'go.mod', 'Cargo.toml', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'Makefile', 'Dockerfile',
];
const NOT_PROJECT_CODE = ['.git', '.ourkit', '.claude'];
// Read when needed: the copy of the kit inside a project has no package.json.
const kitVersion = () => JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8')).version;
const REPO = 'github:LanHuong142002/ourkit';
// Before ADR 0014 the routing lived in a marked block in this file, which `upgrade` now removes.
const LEGACY_INSTRUCTIONS_FILE = 'CLAUDE.md';
const LEGACY_INSTRUCTIONS_START = '<!-- ourkit:start';
const LEGACY_INSTRUCTIONS_END = '<!-- ourkit:end -->';
const GITIGNORE_START = '# ourkit:start: managed by ourkit. `ourkit sync` rebuilds these files, so git never needs them.';
const GITIGNORE_END = '# ourkit:end';

const toRecordPath = (p) => p.replace(/\\/g, '/');
// Pinned to the project's version, so every machine rebuilds the same kit.
const syncCommand = (version) => `npx ${REPO}#v${version} sync`;

// Line endings are normalized because git can change them per machine, which must not
// look like a hand edit to `upgrade`.
function hashFile(file) {
  const content = fs.readFileSync(file).toString('latin1').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(content, 'latin1').digest('hex');
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function availableRoles() {
  return fs.readdirSync(path.join(KIT_ROOT, 'roles')).sort();
}

// Returns the Roles selected by a comma-separated answer, or an error message.
function parseRoles(answer) {
  const names = answer.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
  const expanded = names.flatMap((name) => {
    if (name === 'none') return [];
    return name === 'full-stack' || name === 'fullstack' ? ['frontend', 'backend'] : [name];
  });
  const unknown = expanded.filter((name) => !availableRoles().includes(name));
  if (unknown.length > 0) return { error: `unknown Role: ${unknown.join(', ')}` };
  return { roles: [...new Set(expanded)].sort() };
}

function parseEntry(answer) {
  const entry = answer.trim().toLowerCase();
  return ENTRIES.includes(entry) ? { entry } : { error: `entry must be ${ENTRIES.join(' or ')}` };
}

function hasProjectCode(projectDir) {
  return fs.readdirSync(projectDir).some((name) => !NOT_PROJECT_CODE.includes(name));
}

function readShell() {
  return JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'hosts', HOST, 'shell.json'), 'utf8'));
}

function trackerPlan(name) {
  const root = path.join(KIT_ROOT, 'tracker-packs', name);
  return filesUnder(root).map((source) => ({
    source,
    original: source,
    target: path.join(KIT_DIR, 'tracker-packs', name, path.relative(root, source)),
  }));
}

// Copies files into the project, returning their hashes for the install record.
function copyPlanned(projectDir, plan) {
  const files = {};
  for (const { source, target } of plan) {
    const destination = path.join(projectDir, target);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    files[toRecordPath(target)] = hashFile(destination);
  }
  return files;
}

// Every file the kit puts in a project, as { source, original, target } with target relative to the
// project. `source` is what gets copied, an Override when there is one; `original` is the kit's own file.
function planFiles(projectDir, roles, tracker) {
  const shell = readShell();
  const plan = [];
  const add = (from, toDir) => {
    for (const source of filesUnder(path.join(KIT_ROOT, from))) {
      plan.push({ source, original: source, target: path.join(toDir, path.relative(path.join(KIT_ROOT, from), source)) });
    }
  };
  add('core', path.join(KIT_DIR, 'core'));
  add('bin', path.join(KIT_DIR, 'bin'));
  add('src', path.join(KIT_DIR, 'src'));
  // What a Loop Run needs to start a fresh session on this Host.
  for (const file of ['shell.json', 'session-settings.json']) {
    const override = path.join(projectDir, OVERRIDES_DIR, 'host', file);
    const original = path.join(KIT_ROOT, 'hosts', HOST, file);
    plan.push({
      source: fs.existsSync(override) ? override : original,
      original,
      target: path.join(KIT_DIR, 'host', file),
    });
  }
  for (const role of roles) add(path.join('roles', role), path.join(KIT_DIR, 'roles', role));
  if (tracker) plan.push(...trackerPlan(tracker));
  // The Host reads these directly from its own folders, so their Overrides are applied here.
  const addForHost = (root, overrideFolder, toDir) => {
    for (const source of filesUnder(root)) {
      const relative = path.relative(root, source);
      const override = path.join(projectDir, OVERRIDES_DIR, overrideFolder, relative);
      plan.push({
        source: fs.existsSync(override) ? override : source,
        original: source,
        target: path.join(toDir, relative),
      });
    }
  };
  addForHost(path.join(KIT_ROOT, 'stages'), 'stages', shell.stagesDir);
  addForHost(path.join(KIT_ROOT, 'hosts', HOST, 'agents'), 'agents', shell.agentsDir);
  // The Host loads these in every session. Without them a plain request never reaches the
  // lifecycle, so no Tier, Gate or Sensitive Area floor applies (ADR 0013).
  addForHost(path.join(KIT_ROOT, 'hosts', HOST, 'rules'), 'rules', shell.rulesDir);
  return plan;
}

// What git should leave out: everything the kit copies, plus a Loop Run's own state.
function ignoredPaths() {
  const shell = readShell();
  const hostEntries = (dir, sourceDir) => fs.readdirSync(path.join(KIT_ROOT, sourceDir), { withFileTypes: true })
    .map((entry) => `${toRecordPath(path.join(dir, entry.name))}${entry.isDirectory() ? '/' : ''}`)
    .sort();
  return [
    `${toRecordPath(KIT_DIR)}/`,
    '.ourkit/loop.json',
    '.ourkit/run-report.md',
    ...hostEntries(shell.stagesDir, 'stages'),
    ...hostEntries(shell.agentsDir, path.join('hosts', HOST, 'agents')),
    ...hostEntries(shell.rulesDir, path.join('hosts', HOST, 'rules')),
  ];
}

// Keeps one marked block in .gitignore. Only the block is the kit's; the rest of the file is the project's.
function applyGitignore(projectDir) {
  const block = [GITIGNORE_START, ...ignoredPaths(), GITIGNORE_END].join('\n');
  const file = path.join(projectDir, '.gitignore');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  const start = existing.indexOf('# ourkit:start');
  const end = start >= 0 ? existing.indexOf(GITIGNORE_END, start) : -1;
  let updated;
  if (end > start) updated = existing.slice(0, start) + block + existing.slice(end + GITIGNORE_END.length);
  else if (existing.trim()) updated = `${existing.trimEnd()}\n\n${block}\n`;
  else updated = `${block}\n`;
  if (updated !== existing) fs.writeFileSync(file, updated);
}

// Removes the marked block older versions kept in CLAUDE.md, and the file too if nothing else is in it.
// Returns whether anything was removed.
function removeLegacyInstructions(projectDir) {
  const file = path.join(projectDir, LEGACY_INSTRUCTIONS_FILE);
  if (!fs.existsSync(file)) return false;
  const existing = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const start = existing.indexOf(LEGACY_INSTRUCTIONS_START);
  const end = start >= 0 ? existing.indexOf(LEGACY_INSTRUCTIONS_END, start) : -1;
  if (end < 0) return false;
  const before = existing.slice(0, start).trimEnd();
  const after = existing.slice(end + LEGACY_INSTRUCTIONS_END.length).trim();
  const rest = [before, after].filter(Boolean).join('\n\n');
  if (rest) fs.writeFileSync(file, `${rest}\n`);
  else fs.rmSync(file);
  return true;
}

function install(projectDir, { entry, roles }) {
  if (fs.existsSync(path.join(projectDir, INSTALL_RECORD))) {
    return { error: `ourkit is already installed in ${projectDir}; use upgrade to update it` };
  }
  const plan = planFiles(projectDir, roles);
  const existing = plan.filter(({ target }) => fs.existsSync(path.join(projectDir, target)));
  if (existing.length > 0) {
    const names = existing.map(({ target }) => toRecordPath(target)).join(', ');
    return { error: `ourkit is already installed in ${projectDir}, or these files are in the way: ${names}` };
  }
  const detected = STACK_MARKERS.filter((name) => fs.existsSync(path.join(projectDir, name)));
  const files = copyPlanned(projectDir, plan);
  applyGitignore(projectDir);
  const record = { version: kitVersion(), host: HOST, entry, roles, detected, files };
  fs.writeFileSync(path.join(projectDir, INSTALL_RECORD), `${JSON.stringify(record, null, 2)}\n`);
  return { record };
}

function parseArgs(args) {
  const options = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--entry' || args[i] === '--roles') options[args[i].slice(2)] = args[(i += 1)] ?? '';
    else rest.push(args[i]);
  }
  return { options, projectArg: rest[0] };
}

// Keeps asking until the answer is valid. Returns null when input ends.
async function ask(lines, prompt, parse) {
  for (;;) {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) return null;
    const parsed = parse(value);
    if (!parsed.error) return parsed;
    console.log(parsed.error);
  }
}

async function main(args) {
  const { options, projectArg } = parseArgs(args);
  const projectDir = path.resolve(projectArg || process.cwd());
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    console.error(`ourkit: no folder at ${projectDir}`);
    return 2;
  }
  let entryResult = options.entry === undefined ? null : parseEntry(options.entry);
  let rolesResult = options.roles === undefined ? null : parseRoles(options.roles);
  for (const result of [entryResult, rolesResult]) {
    if (result && result.error) {
      console.error(`ourkit: ${result.error}`);
      return 2;
    }
  }
  if (!entryResult || !rolesResult) {
    const rl = readline.createInterface({ input: process.stdin });
    const lines = rl[Symbol.asyncIterator]();
    const suggested = hasProjectCode(projectDir) ? 'brownfield' : 'greenfield';
    if (!entryResult) {
      entryResult = await ask(lines, `Greenfield (no code yet) or Brownfield (has code)? [${suggested}] `, (answer) =>
        parseEntry(answer.trim() || suggested));
    }
    if (entryResult && !rolesResult) {
      rolesResult = await ask(lines, `Roles? ${availableRoles().join(', ')}, full-stack or none, separated by commas: `, (answer) =>
        (answer.trim() ? parseRoles(answer) : { error: 'choose at least one option, or none' }));
    }
    rl.close();
    if (!entryResult || !rolesResult) {
      console.error('ourkit: input ended before every question was answered; nothing was installed');
      return 2;
    }
  }
  const { error, record } = install(projectDir, { entry: entryResult.entry, roles: rolesResult.roles });
  if (error) {
    console.error(`ourkit: ${error}`);
    return 1;
  }
  console.log(`ourkit: installed ${Object.keys(record.files).length} files (${record.entry}; Roles: ${record.roles.join(', ') || 'none'})`);
  if (record.detected.length > 0) console.log(`ourkit: found ${record.detected.join(', ')}`);
  console.log('ourkit: commit .gitignore and .ourkit/install.json; the files the kit copied stay out of git');
  console.log(`ourkit: after cloning, a teammate runs: ${syncCommand(record.version)}`);
  console.log('ourkit: now open the agent in this project and run /ourkit-init');
  return 0;
}

module.exports = {
  INSTALL_RECORD, KIT_ROOT, applyGitignore, copyPlanned, hashFile, ignoredPaths, install, main,
  kitVersion, parseRoles, planFiles, removeLegacyInstructions, syncCommand, trackerPlan,
};
