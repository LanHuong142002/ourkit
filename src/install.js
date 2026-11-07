// Installer: asks its questions, copies the kit and records what it did.
// Deterministic by design (ADR 0005): inference is left to Init.
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
const INSTRUCTIONS_START = '<!-- ourkit:start: managed by ourkit, and replaced on upgrade. Anything outside this block is yours. -->';
const INSTRUCTIONS_END = '<!-- ourkit:end -->';

const toRecordPath = (p) => p.replace(/\\/g, '/');

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

function trackerPlan(name) {
  const root = path.join(KIT_ROOT, 'tracker-packs', name);
  return filesUnder(root).map((source) => ({
    source,
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

// Every file the kit puts in a project, as { source, target } with target relative to the project.
function planFiles(projectDir, roles, tracker) {
  const shell = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'hosts', HOST, 'shell.json'), 'utf8'));
  const plan = [];
  const add = (from, toDir) => {
    for (const source of filesUnder(path.join(KIT_ROOT, from))) {
      plan.push({ source, target: path.join(toDir, path.relative(path.join(KIT_ROOT, from), source)) });
    }
  };
  add('core', path.join(KIT_DIR, 'core'));
  add('bin', path.join(KIT_DIR, 'bin'));
  add('src', path.join(KIT_DIR, 'src'));
  // What a Loop Run needs to start a fresh session on this Host.
  for (const file of ['shell.json', 'session-settings.json']) {
    const override = path.join(projectDir, OVERRIDES_DIR, 'host', file);
    plan.push({
      source: fs.existsSync(override) ? override : path.join(KIT_ROOT, 'hosts', HOST, file),
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
        target: path.join(toDir, relative),
      });
    }
  };
  addForHost(path.join(KIT_ROOT, 'stages'), 'stages', shell.stagesDir);
  addForHost(path.join(KIT_ROOT, 'hosts', HOST, 'agents'), 'agents', shell.agentsDir);
  return plan;
}

// The one thing a Host loads in every session. Without it, a plain request never reaches the
// lifecycle, so no Tier, Gate or Sensitive Area floor applies. Only the marked block is the kit's.
function applyInstructions(projectDir) {
  const hostDir = path.join(KIT_ROOT, 'hosts', HOST);
  const { instructionsFile } = JSON.parse(fs.readFileSync(path.join(hostDir, 'shell.json'), 'utf8'));
  if (!instructionsFile) return null;
  const text = fs.readFileSync(path.join(hostDir, 'instructions.md'), 'utf8').replace(/\r\n/g, '\n').trim();
  const block = `${INSTRUCTIONS_START}\n${text}\n${INSTRUCTIONS_END}`;
  const file = path.join(projectDir, instructionsFile);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  // Matched by its opening alone, so a later version can reword the marker.
  const start = existing.indexOf('<!-- ourkit:start');
  const end = existing.indexOf(INSTRUCTIONS_END);
  let updated;
  if (start >= 0 && end > start) updated = existing.slice(0, start) + block + existing.slice(end + INSTRUCTIONS_END.length);
  else if (existing.trim()) updated = `${existing.trimEnd()}\n\n${block}\n`;
  else updated = `${block}\n`;
  fs.writeFileSync(file, updated);
  return instructionsFile;
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
  applyInstructions(projectDir);
  const { version } = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8'));
  const record = { version, host: HOST, entry, roles, detected, files };
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
  console.log('ourkit: commit the changes, then open the agent in this project and run /ourkit-init');
  return 0;
}

module.exports = { INSTALL_RECORD, KIT_ROOT, applyInstructions, copyPlanned, hashFile, install, main, parseRoles, planFiles, trackerPlan };
