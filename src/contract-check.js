// Contract Check: verifies that the kit's extension points satisfy their contracts.
// Role, Stack Pack and Tracker Pack contracts arrive in #5, #6 and #32.
const fs = require('fs');
const path = require('path');

const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
const STAGE_PREFIX = 'ourkit-';

// ADR 0002: Core never assumes a stack. A list can't catch everything, so this
// stops the common slips and doesn't replace review.
const STACK_COMMANDS = [
  'npm', 'npx', 'yarn', 'pnpm', 'pip', 'pip3', 'pipenv', 'uvx', 'pytest', 'tox',
  'cargo', 'gradle', 'gradlew', 'mvn', 'dotnet', 'vitest',
  'package.json', 'node_modules', 'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod',
  'pom.xml', 'Gemfile',
];
// Commands that are ordinary English words count only in their full, lowercase form.
const STACK_COMMAND_PHRASES = [
  'go test', 'go run', 'go build', 'bundle exec', 'bundle install', 'poetry run', 'poetry install',
  'composer install', 'composer require', 'rake test', 'jest --', 'uv run', 'uv sync',
];
const STACK_NAMES = [
  'JavaScript', 'TypeScript', 'Node.js', 'Python', 'Ruby', 'Java', 'PHP', 'Golang', 'Kotlin',
  'Next.js', 'Vue', 'Angular', 'Svelte', 'Django', 'Flask', 'FastAPI', 'Rails', 'Laravel', 'NestJS',
];
// Names that are also English words count only mid-sentence, because a capital at the
// start of a sentence says nothing. "React is required" at the start of a line is missed.
const AMBIGUOUS_STACK_NAMES = ['Node', 'Rust', 'Swift', 'React', 'Express', 'Spring'];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (term, flags) => new RegExp(`(?<![\\w.-])${escapeRegExp(term)}(?![\\w-])`, flags);
const midSentence = (term) => new RegExp(`(?<=[a-z0-9,;:] )${escapeRegExp(term)}(?![\\w-])`);
const STACK_TERMS = [
  ...STACK_COMMANDS.map((term) => ({ term, pattern: wholeWord(term, 'i') })),
  ...STACK_COMMAND_PHRASES.map((term) => ({ term, pattern: wholeWord(term, '') })),
  ...STACK_NAMES.map((term) => ({ term, pattern: wholeWord(term, '') })),
  ...AMBIGUOUS_STACK_NAMES.map((term) => ({ term, pattern: midSentence(term) })),
];

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function subfolders(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

// Returns null when the file has no frontmatter block.
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (field) fields[field[1]] = field[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return { fields, body: text.slice(match[0].length) };
}

function checkStage(root, stage) {
  const problems = [];
  const report = (file, message) => problems.push({ file, contract: 'Stage', message });
  const folder = path.join('stages', stage);
  const skillPath = path.join(folder, 'SKILL.md');
  const absolute = path.join(root, skillPath);

  if (!fs.existsSync(absolute)) {
    report(folder, 'must contain SKILL.md');
    return problems;
  }
  const parsed = parseFrontmatter(readText(absolute));
  if (!parsed) {
    report(skillPath, 'must start with a frontmatter block');
    return problems;
  }
  const { name, description } = parsed.fields;
  if (!name) {
    report(skillPath, 'frontmatter must set name');
  } else {
    if (name !== stage) report(skillPath, `name "${name}" must match its folder "${stage}"`);
    if (!SKILL_NAME.test(name) || name.length > SKILL_NAME_MAX) {
      report(skillPath, `name "${name}" must be lowercase words joined by single hyphens, at most ${SKILL_NAME_MAX} characters`);
    }
    if (!name.startsWith(STAGE_PREFIX)) report(skillPath, `name "${name}" must start with "${STAGE_PREFIX}"`);
  }
  if (!description) {
    report(skillPath, 'frontmatter must set description');
  } else if (/^[|>]/.test(description)) {
    report(skillPath, 'description must be on one line');
  } else if (description.length > DESCRIPTION_MAX) {
    report(skillPath, `description must be at most ${DESCRIPTION_MAX} characters`);
  }
  if (!parsed.body.trim()) report(skillPath, 'must have instructions after the frontmatter');
  return problems;
}

function checkHostShell(root, host) {
  const shellPath = path.join('hosts', host, 'shell.json');
  const report = (message) => ({ file: shellPath, contract: 'Host Shell', message });
  const absolute = path.join(root, shellPath);

  if (!fs.existsSync(absolute)) return [report('file is missing')];
  let shell;
  try {
    shell = JSON.parse(readText(absolute));
  } catch (error) {
    return [report(`must be valid JSON: ${error.message}`)];
  }
  if (shell === null || typeof shell !== 'object' || Array.isArray(shell)) {
    return [report('must be a JSON object')];
  }
  const problems = [];
  if (shell.host !== host) problems.push(report(`host must match its folder "${host}"`));
  const { stagesDir } = shell;
  if (typeof stagesDir !== 'string' || !stagesDir.trim()) {
    problems.push(report('stagesDir must be a non-empty path'));
  } else if (
    path.isAbsolute(stagesDir) ||
    path.win32.isAbsolute(stagesDir) ||
    stagesDir.split(/[\\/]/).includes('..')
  ) {
    problems.push(report(`stagesDir "${stagesDir}" must stay inside the project`));
  }
  return problems;
}

function checkStackNeutral(root) {
  const problems = [];
  for (const dir of ['core', 'stages']) {
    for (const file of filesUnder(path.join(root, dir))) {
      const text = readText(file);
      if (text.includes('\0')) continue; // binary resource
      const relative = path.relative(root, file);
      text.split('\n').forEach((line, index) => {
        for (const { term, pattern } of STACK_TERMS) {
          if (pattern.test(line)) {
            problems.push({
              file: `${relative}:${index + 1}`,
              contract: 'Stack neutrality',
              message: `mentions "${term}"; read it from the Stack Profile or move it to a Stack Pack (ADR 0002)`,
            });
          }
        }
      });
    }
  }
  return problems;
}

function runContractCheck(root) {
  const stages = subfolders(path.join(root, 'stages'));
  const hosts = subfolders(path.join(root, 'hosts'));
  const problems = [];
  if (stages.length === 0) problems.push({ file: 'stages', contract: 'Stage', message: 'must contain at least one Stage' });
  if (hosts.length === 0) problems.push({ file: 'hosts', contract: 'Host Shell', message: 'must contain at least one Host Shell' });
  for (const stage of stages) problems.push(...checkStage(root, stage));
  for (const host of hosts) problems.push(...checkHostShell(root, host));
  problems.push(...checkStackNeutral(root));
  return { problems, stages: stages.length, hosts: hosts.length };
}

// Returns the process exit code.
function main(rootArg) {
  const root = path.resolve(rootArg || path.join(__dirname, '..'));
  const { problems, stages, hosts } = runContractCheck(root);
  for (const { file, contract, message } of problems) {
    console.error(`${file.replace(/\\/g, '/')}: [${contract}] ${message}`);
  }
  if (problems.length > 0) {
    console.error(`ourkit check: ${problems.length} problem(s)`);
    return 1;
  }
  console.log(`ourkit check: OK (${stages} Stage(s), ${hosts} Host Shell(s))`);
  return 0;
}

module.exports = { main, runContractCheck };
