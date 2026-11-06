// The Gate into Ship: everything that must be true before a PR opens.
const { spawnSync } = require('child_process');
const path = require('path');
const { checkArtifact, parseTasks, readDocument, relativePathFor } = require('./artifacts');
const { actionFor } = require('./gate');
const { reportRequired } = require('./report');
const { reviewGate } = require('./review');
const { summarize } = require('./tasks');

const KIT_EXCLUDES = [':(exclude).ourkit', ':(exclude).claude'];

function uncommitted(projectDir) {
  const result = spawnSync('git', ['status', '--porcelain', '--', '.', ...KIT_EXCLUDES], { cwd: projectDir, encoding: 'utf8' });
  return (result.stdout || '').split('\n').filter(Boolean).length;
}

function shipGate(projectDir, record, change) {
  const problems = [];
  if (change.kind !== 'branch') problems.push('the change must be on its own branch, not the default branch');
  if (uncommitted(projectDir) > 0) problems.push('there is uncommitted work, so commit it first');

  const review = reviewGate(projectDir, record, change);
  if (review.status !== 'pass') problems.push(review.reason);

  if (record.tier !== 'patch') {
    const taskProblems = checkArtifact(projectDir, 'tasks', change.id);
    if (taskProblems.length > 0) {
      problems.push(...taskProblems);
    } else {
      const tasks = parseTasks(readDocument(path.join(projectDir, relativePathFor('tasks', change.id))));
      const { finished, blocked } = summarize(tasks, record.taskStatus || {});
      if (blocked.length > 0) problems.push(`these tasks are blocked: ${blocked.join(', ')}`);
      else if (!finished) problems.push('some tasks are not finished');
    }
  }
  if (reportRequired(record)) {
    problems.push(...checkArtifact(projectDir, 'report', change.id).map((problem) => `Change Report: ${problem}`));
  }
  if (problems.length === 0) return { status: 'pass', severity: 'none', action: 'continue' };
  return { status: 'fail', problems, severity: 'block', action: actionFor('block', record) };
}

module.exports = { shipGate };
