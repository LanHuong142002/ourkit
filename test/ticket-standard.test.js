const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { assess, parseFields } = require('../src/ticket-standard');

const BIN = path.join(__dirname, '..', 'bin', 'ourkit.js');
const TITLE = 'Export a report as a file';
const BODY = `**Summary:** Let users export a report.

**User Story:** As a manager, I want to export a report, so that I can share it.

**Context:** Reports can only be read on screen today.

**Scope Boundary:**
- In: exporting one report.
- Out: scheduled exports (#12).

**Links & References:** ADR 0001.
**Blocked by:** #3
`;
const PR_BODY = `## Summary
Adds report export.

## Context
Reports could only be read on screen.

## Scope Boundary
- In: one report.
- Out: scheduled exports.

## How To Verify
Export a report and open the file.

## Links & References
Closes #7
`;
const messages = (input) => assess({ title: TITLE, ...input }).map(({ criterion, message }) => `${criterion}: ${message}`);
const without = (field) => BODY.replace(new RegExp(`\\*\\*${field}:\\*\\*[^*]*`), '');

test('accepts a ticket that meets the standard', () => {
  assert.deepStrictEqual(messages({ body: BODY }), []);
});

test('accepts a PR that meets the standard, with heading-style fields', () => {
  assert.deepStrictEqual(messages({ body: PR_BODY, kind: 'pr' }), []);
});

test('accepts Windows line endings', () => {
  assert.deepStrictEqual(messages({ body: BODY.replace(/\n/g, '\r\n') }), []);
});

test('a ticket body is not a valid PR, and the reverse', () => {
  assert.deepStrictEqual(messages({ body: BODY, kind: 'pr' }), ['Complete: How To Verify is missing']);
  assert.deepStrictEqual(messages({ body: PR_BODY }), ['Complete: User Story is missing']);
});

for (const field of ['Summary', 'User Story', 'Context', 'Links & References']) {
  test(`reports a missing ${field}`, () => {
    assert.deepStrictEqual(messages({ body: without(field) }), [`Complete: ${field} is missing`]);
  });
}

test('reports an empty field', () => {
  const body = BODY.replace('Reports can only be read on screen today.', '');
  assert.deepStrictEqual(messages({ body }), ['Complete: Context is empty']);
});

test('reports a missing or malformed title', () => {
  assert.deepStrictEqual(messages({ title: ' ', body: BODY }), ['Complete: Title is missing']);
  assert.deepStrictEqual(messages({ title: 'Export.', body: BODY }), ['Clear: Title must not end with a period']);
  assert.deepStrictEqual(messages({ title: 'x'.repeat(73), body: BODY }), ['Concise: Title must be at most 72 characters']);
});

test('reports a malformed User Story', () => {
  const body = BODY.replace('As a manager, I want to export a report, so that I can share it.', 'Add export.');
  assert.deepStrictEqual(messages({ body }), ['Clear: User Story must read "As a ..., I want ..., so that ..."']);
});

test('reports a Scope Boundary missing In or Out', () => {
  assert.deepStrictEqual(messages({ body: BODY.replace('- Out: scheduled exports (#12).\n', '') }), ['Complete: Scope Boundary must say what is Out']);
  assert.deepStrictEqual(messages({ body: BODY.replace('- In: exporting one report.\n', '') }), ['Complete: Scope Boundary must say what is In']);
});

for (const placeholder of ['TODO', 'TBD', '<describe here>', '???']) {
  test(`reports the placeholder ${placeholder}`, () => {
    const body = BODY.replace('today.', `today. ${placeholder}`);
    assert.deepStrictEqual(messages({ body }), [`Clear: Contains the placeholder "${placeholder}"`]);
  });
}

test('allows a placeholder shown as inline code', () => {
  assert.deepStrictEqual(messages({ body: BODY.replace('today.', 'today. Run `ourkit <name>`.') }), []);
});

test('reports an overlong body', () => {
  const body = BODY.replace('today.', `today. ${'word '.repeat(500)}`);
  const [message] = messages({ body });
  assert.match(message, /^Concise: Body has \d+ words; the limit is 500$/);
});

test('a field name inside text does not start a new field', () => {
  const body = BODY.replace('today.', 'today. The Summary of it is **important**.');
  assert.match(parseFields(body).Context, /Summary of it/);
});

test('command exit codes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ourkit-ticket-'));
  const file = path.join(dir, 'ticket.md');
  const run = (...args) => spawnSync(process.execPath, [BIN, 'ticket', ...args], { encoding: 'utf8' });
  try {
    fs.writeFileSync(file, BODY);
    assert.strictEqual(run(file, '--title', TITLE).status, 0);
    assert.match(run(file, '--title', TITLE, '--pr').stderr, /\[Complete\] How To Verify is missing/);
    assert.strictEqual(run(file, '--title', TITLE, '--pr').status, 1);
    assert.strictEqual(run(file).status, 2);
    assert.strictEqual(run(path.join(dir, 'none.md'), '--title', TITLE).status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
