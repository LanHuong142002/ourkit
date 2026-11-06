// Loop Run: Hands-off across many tickets. This code is the coordinator, not an agent, so the
// Budget can't be talked past and a ticket's context costs nothing once it ends (ADRs 0009, 0011).
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOOP_PATH = path.join('.ourkit', 'loop.json');
const SHELL_PATH = path.join('.ourkit', 'kit', 'host', 'shell.json');
const CARRIED = [path.join('.ourkit', 'lessons.md'), path.join('.ourkit', 'project-log.md')];
const SUMMARY_LINES = 5;
const OUTCOMES = ['shipped', 'stopped', 'blocked', 'rejected'];

const promptFor = (item) => `/ourkit-handsoff ${item}

You are one ticket in a Loop Run, with no one watching, so never wait for a reply. Run each shell command on its own, without chaining commands or changing directory, because permissions are checked per command and a refused command can't be retried by anyone. When you stop or finish, end your final message with exactly ${SUMMARY_LINES} lines summarizing what happened, then one last line:
OURKIT-RESULT: shipped, stopped, blocked or rejected
Use shipped if a PR is open, stopped if it's waiting for the user's approval or answers, blocked if you can't make progress, and rejected if the ticket failed intake.`;

function git(projectDir, args) {
  const result = spawnSync('git', args, { cwd: projectDir, encoding: 'utf8' });
  return { ok: result.status === 0, output: (result.stdout || '').trim() };
}

function defaultBranch(projectDir) {
  const remote = git(projectDir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (remote.ok) return remote.output.replace(/^origin\//, '');
  return ['main', 'master'].find((name) => git(projectDir, ['rev-parse', '--verify', '--quiet', name]).ok) || null;
}

function readLoop(projectDir) {
  const file = path.join(projectDir, LOOP_PATH);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

// The run's state must survive moving between branches, so git must never track it. This
// writes to .git/info/exclude, which stays on this machine and doesn't change the repo.
function keepStateOutOfGit(projectDir) {
  const excludeFile = git(projectDir, ['rev-parse', '--git-path', 'info/exclude']);
  if (!excludeFile.ok) return;
  const file = path.resolve(projectDir, excludeFile.output);
  const entry = LOOP_PATH.replace(/\\/g, '/');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (existing.split(/\r?\n/).includes(entry)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${entry}\n`);
}

function writeLoop(projectDir, loop) {
  const file = path.join(projectDir, LOOP_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(loop, null, 2)}\n`);
}

function sessionCommand(projectDir) {
  if (process.env.OURKIT_LOOP_COMMAND) return { command: process.env.OURKIT_LOOP_COMMAND, args: [] };
  const file = path.join(projectDir, SHELL_PATH);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).session : null;
}

// The Budget is checked in here, between tickets, and it also caps how long the next session may run.
function budgetLeft(loop) {
  const { hours, tokens } = loop.budget;
  if (hours !== undefined && loop.usedMs >= hours * 3600 * 1000) return false;
  if (tokens !== undefined && loop.usedTokens >= tokens) return false;
  return true;
}

function sessionTimeout(loop) {
  if (loop.budget.hours === undefined) return undefined;
  return Math.max(1000, loop.budget.hours * 3600 * 1000 - loop.usedMs);
}

function parseSession(stdout) {
  let result = stdout;
  let tokens = 0;
  let isError = false;
  try {
    const parsed = JSON.parse(stdout);
    result = String(parsed.result ?? '');
    isError = parsed.is_error === true;
    const usage = parsed.usage || {};
    tokens = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens'].reduce((sum, key) => sum + (usage[key] || 0), 0);
  } catch {
    isError = true;
  }
  const lines = result.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const resultIndex = lines.findLastIndex((line) => /^OURKIT-RESULT:/.test(line));
  const named = resultIndex >= 0 ? lines[resultIndex].replace(/^OURKIT-RESULT:\s*/, '').trim() : '';
  const before = resultIndex >= 0 ? lines.slice(0, resultIndex) : lines;
  return {
    tokens,
    isError,
    outcome: OUTCOMES.includes(named) ? named : 'unknown',
    summary: before.slice(-SUMMARY_LINES).join('\n'),
  };
}

// ADR 0011: only Lessons and the Project Log carry over, and they travel by file, not by context.
// They're on the ticket's branch, so they're read before leaving it and restored on the way back.
function returnToDefault(projectDir, main) {
  const branch = git(projectDir, ['branch', '--show-current']).output;
  const carried = CARRIED.map((relative) => {
    const file = path.join(projectDir, relative);
    return { file, content: fs.existsSync(file) ? fs.readFileSync(file) : null };
  });
  if (git(projectDir, ['status', '--porcelain']).output) {
    // Carried files are expected to be uncommitted on the default branch, since they're put there on purpose.
    const excludingCarried = git(projectDir, ['status', '--porcelain', '--', '.', ...CARRIED.map((file) => `:(exclude)${file.replace(/\\/g, '/')}`)]).output;
    if (branch === main && excludingCarried) {
      const files = excludingCarried.split('\n').map((line) => line.slice(3)).join(', ');
      return { error: `the session left uncommitted work on ${main}: ${files}` };
    }
  }
  if (branch !== main && git(projectDir, ['status', '--porcelain']).output) {
    // A stopped ticket has work worth keeping, so it's saved on that ticket's own branch.
    git(projectDir, ['add', '-A']);
    if (!git(projectDir, ['-c', 'user.name=ourkit', '-c', 'user.email=ourkit@localhost', 'commit', '-q', '-m', 'chore: save work from a stopped Loop Run session']).ok) {
      return { error: `couldn't save the session's work on ${branch}` };
    }
  }
  if (branch !== main && !git(projectDir, ['switch', '-q', main]).ok) {
    return { error: `couldn't return to ${main}` };
  }
  for (const { file, content } of carried) {
    if (content !== null) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
  return {};
}

// On timeout the whole process tree must go. Killing only the shell would leave an agent
// running unattended and past its Budget, which is exactly what the Budget exists to prevent.
function killTree(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function runSession(session, projectDir, input, timeout) {
  return new Promise((resolve) => {
    const child = spawn(session.command, session.args, {
      cwd: projectDir,
      shell: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = timeout === undefined ? null : setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeout);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.on('error', () => {
      if (timer) clearTimeout(timer);
      resolve({ status: 1, stdout, stderr, timedOut });
    });
    child.on('close', (status) => {
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut });
    });
  });
}

async function runLoop(projectDir, loop) {
  const main = defaultBranch(projectDir);
  const session = sessionCommand(projectDir);
  const stop = (reason) => {
    loop.stopped = reason;
    writeLoop(projectDir, loop);
    return loop;
  };
  if (!main) return stop('no-default-branch');
  if (!session) return stop('no-session-command');

  loop.stopped = null;
  while (loop.queue.length > 0) {
    if (!budgetLeft(loop)) return stop('budget');
    const item = loop.queue[0];
    const started = Date.now();
    const result = await runSession(session, projectDir, promptFor(item), sessionTimeout(loop));
    loop.usedMs += Date.now() - started;
    const parsed = parseSession(result.stdout);
    loop.usedTokens += parsed.tokens;

    const back = returnToDefault(projectDir, main);
    if (back.error) {
      loop.results.push({ item, outcome: 'unknown', summary: back.error });
      loop.queue.shift();
      return stop('dirty-tree');
    }
    if (result.timedOut) return stop('budget');
    // The ticket stays queued, because a failed session may only mean a limit was reached.
    if (result.status !== 0 || parsed.isError) {
      loop.lastError = parsed.summary.slice(0, 500) || result.stderr.slice(0, 500);
      return stop('session-failed');
    }
    loop.results.push({ item, outcome: parsed.outcome, summary: parsed.summary });
    loop.queue.shift();
    writeLoop(projectDir, loop);
  }
  const anyShipped = loop.results.some(({ outcome }) => outcome === 'shipped');
  return stop(anyShipped ? 'done' : 'all-blocked');
}

function parseStart(args) {
  const options = { items: [] };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--hours' || args[i] === '--tokens') options[args[i].slice(2)] = Number(args[(i += 1)]);
    else options.items.push(args[i]);
  }
  return options;
}

const USAGE = 'usage: ourkit loop <status | run [--hours <n>] [--tokens <n>] <ticket-or-request>...>';

async function main(args) {
  const [action, ...rest] = args;
  const projectDir = process.cwd();
  if (action === 'status') {
    console.log(JSON.stringify(readLoop(projectDir), null, 2));
    return 0;
  }
  if (action !== 'run') {
    console.error(USAGE);
    return 2;
  }
  const { hours, tokens, items } = parseStart(rest);
  for (const value of [hours, tokens]) {
    if (value !== undefined && !(value > 0)) {
      console.error('ourkit: a Budget must be a number above zero');
      return 2;
    }
  }
  let loop = readLoop(projectDir);
  if (items.length > 0) {
    if (hours === undefined && tokens === undefined) {
      console.error('ourkit: a Loop Run needs a Budget before it starts; use --hours or --tokens (ADR 0009)');
      return 2;
    }
    if (loop && loop.queue.length > 0) {
      console.error('ourkit: a Loop Run still has tickets queued; run `ourkit loop run` to continue it, or delete .ourkit/loop.json to drop it');
      return 1;
    }
    const budget = { ...(hours !== undefined ? { hours } : {}), ...(tokens !== undefined ? { tokens } : {}) };
    loop = { budget, usedMs: 0, usedTokens: 0, queue: items, results: [], stopped: null };
  } else if (!loop || loop.queue.length === 0) {
    console.error(USAGE);
    return 2;
  }
  const main_ = defaultBranch(projectDir);
  if (main_ && git(projectDir, ['branch', '--show-current']).output !== main_) {
    console.error(`ourkit: start a Loop Run from ${main_}, because each ticket branches from it`);
    return 1;
  }
  keepStateOutOfGit(projectDir);
  const dirty = git(projectDir, ['status', '--porcelain', '--', '.', ...CARRIED.map((file) => `:(exclude)${file.replace(/\\/g, '/')}`)]).output;
  if (dirty) {
    console.error('ourkit: commit or stash your work first, because a Loop Run moves between branches');
    return 1;
  }
  writeLoop(projectDir, loop);
  const finished = await runLoop(projectDir, loop);
  console.log(JSON.stringify({ stopped: finished.stopped, finished: finished.results.length, queued: finished.queue.length, usedTokens: finished.usedTokens }, null, 2));
  return finished.stopped === 'done' || finished.stopped === 'all-blocked' || finished.stopped === 'budget' ? 0 : 1;
}

module.exports = { LOOP_PATH, budgetLeft, main, parseSession, readLoop };
