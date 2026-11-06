const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
const stage = fs.readFileSync(path.join(KIT_ROOT, 'stages', 'ourkit-deploy', 'SKILL.md'), 'utf8');

test('the Stage forbids production deploys in every situation', () => {
  for (const required of ['Never deploy to production', 'in any Mode', 'even in a Loop Run', 'ADR 0010', 'treat it as production']) {
    assert.ok(stage.includes(required), required);
  }
});

test('the Stage reads both commands from the Stack Profile and never guesses', () => {
  for (const required of ['ourkit command deploy', 'ourkit command smoke', 'Never guess']) {
    assert.ok(stage.includes(required), required);
  }
});

test('the Stage says it is a frame, and what waits for Release 2', () => {
  assert.ok(stage.includes('This is a frame in v1'));
  assert.ok(stage.includes('Release 2'));
  assert.ok(stage.includes('## Not in v1'));
});

test('the commands it needs resolve, and a Gate still refuses to deploy', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-deploy-'));
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: project, encoding: 'utf8' });
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: project });
  try {
    fs.mkdirSync(path.join(project, '.ourkit'));
    fs.writeFileSync(path.join(project, '.ourkit', 'stack-profile.json'), JSON.stringify({ technologies: [], commands: { deploy: 'release staging', smoke: null } }));
    assert.strictEqual(run('command', 'deploy').stdout.trim(), 'release staging');
    assert.strictEqual(run('command', 'smoke').status, 1);

    git('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(project, 'a.txt'), 'x');
    run('tier', 'set', 'feature', '--reason', 'r');
    assert.strictEqual(run('gate', 'run', 'deploy').status, 2);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
