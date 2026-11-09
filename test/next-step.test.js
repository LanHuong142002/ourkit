const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const KIT_ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(KIT_ROOT, relative), 'utf8');

test('every skill ends by telling the user what comes next', () => {
  for (const stage of fs.readdirSync(path.join(KIT_ROOT, 'stages'))) {
    assert.ok(read(`stages/${stage}/SKILL.md`).includes('.ourkit/kit/core/next-step.md'), stage);
  }
});

test('the Next line names the skill, what it does, and whether it waits for the user', () => {
  const guide = read('core/next-step.md');
  for (const required of ['**Next:**', 'Name the skill', 'waiting for the user', 'what unblocks it', 'Subagents don\'t write it']) {
    assert.ok(guide.includes(required), required);
  }
});
