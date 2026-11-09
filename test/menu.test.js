const { test } = require('node:test');
const assert = require('node:assert');
const { PassThrough } = require('stream');
const { select } = require('../src/menu');

const KEYS = { up: '\x1b[A', down: '\x1b[B', enter: '\r', escape: '\x1b' };
const LABELS = ['Existing project', 'New project', 'Other'];

// Feeds keys to the menu as a terminal would, and returns its answer and everything it drew.
async function choose(keys, initial = 0) {
  const input = new PassThrough();
  const output = new PassThrough();
  let drawn = '';
  output.on('data', (chunk) => { drawn += chunk; });
  const answer = select('Pick one?', LABELS, initial, { input, output });
  for (const key of keys) {
    input.write(key);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { answer: await answer, drawn };
}

test('Enter picks the starting option', async () => {
  assert.strictEqual((await choose([KEYS.enter], 1)).answer, 1);
});

test('the arrows move and wrap around', async () => {
  assert.strictEqual((await choose([KEYS.down, KEYS.down, KEYS.enter])).answer, 2);
  assert.strictEqual((await choose([KEYS.up, KEYS.enter])).answer, 2);
  assert.strictEqual((await choose([KEYS.down, KEYS.down, KEYS.down, KEYS.enter])).answer, 0);
});

test('Escape cancels', async () => {
  assert.strictEqual((await choose([KEYS.escape, KEYS.escape])).answer, null);
});

test('leaves the question and the chosen answer on screen', async () => {
  const { drawn } = await choose([KEYS.down, KEYS.enter]);
  assert.match(drawn, /> New project/);
  assert.match(drawn, /Pick one\? .*New project/);
});
