const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readLessons } = require('../src/lessons');

const KIT_ROOT = path.join(__dirname, '..');
const BIN = path.join(KIT_ROOT, 'bin', 'ourkit.js');
let project;

const lessons = (...args) => spawnSync(process.execPath, [BIN, 'lessons', ...args], { cwd: project, encoding: 'utf8' });

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-lessons-'));
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

test('reading with no Lessons prints nothing', () => {
  const result = lessons();
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
});

test('saves Lessons in order, with their kind', () => {
  lessons('add', 'cost', 'Review cost the most on large diffs.');
  lessons('add', 'quality', 'Reviewers keep catching missing error paths.');
  assert.deepStrictEqual(lessons().stdout.trim().split(/\r?\n/), [
    '- [cost] Review cost the most on large diffs.',
    '- [quality] Reviewers keep catching missing error paths.',
  ]);
});

test('keeps at most 30, dropping the oldest', () => {
  for (let i = 1; i <= 32; i += 1) lessons('add', 'cost', `Lesson ${i}`);
  const kept = readLessons(project);
  assert.strictEqual(kept.length, 30);
  assert.strictEqual(kept[0], '- [cost] Lesson 3');
  assert.strictEqual(kept[29], '- [cost] Lesson 32');
});

test('a repeated lesson moves to newest instead of being duplicated', () => {
  lessons('add', 'cost', 'First');
  lessons('add', 'cost', 'Second');
  lessons('add', 'cost', 'First');
  assert.deepStrictEqual(readLessons(project), ['- [cost] Second', '- [cost] First']);
});

test('a lesson stays on one line', () => {
  lessons('add', 'quality', 'Two\nlines');
  assert.deepStrictEqual(readLessons(project), ['- [quality] Two lines']);
});

test('rejects an unknown kind or an empty lesson', () => {
  assert.strictEqual(lessons('add', 'style', 'x').status, 2);
  assert.strictEqual(lessons('add', 'cost').status, 2);
  assert.strictEqual(lessons('other').status, 2);
});

test('Plan reads Lessons, and Ship writes them after the Change Report', () => {
  const read = (stage) => fs.readFileSync(path.join(KIT_ROOT, 'stages', stage, 'SKILL.md'), 'utf8');
  assert.ok(read('ourkit-plan').includes('Run `ourkit lessons`'));
  const ship = read('ourkit-ship');
  assert.ok(ship.indexOf('ourkit lessons add') > ship.indexOf('Write the Change Report'));
});
