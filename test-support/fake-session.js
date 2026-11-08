// Stands in for an agent session in Loop Run tests. It reads its prompt, then acts on the
// marker words in it: the prompt is the only thing a real session would get from the loop.
const fs = require('fs');
const { spawnSync } = require('child_process');

const prompt = fs.readFileSync(0, 'utf8');
const item = prompt.split('\n')[0].replace('/ourkit-handsoff ', '').trim();
const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });

fs.appendFileSync(process.env.FAKE_SESSION_LOG, `${item}\n`);
const respond = (result, extra = {}) => {
  console.log(JSON.stringify({ result, is_error: false, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 9999 }, ...extra }));
};
const SUMMARY = ['one', 'two', 'three', 'four', 'five', 'six'].map((word) => `${word} about ${item}`).join('\n');

// Reports plan usage the way the Host's stream does, around an ordinary finished ticket.
const rateEvent = (utilization, resetsAt, status = 'allowed') => console.log(JSON.stringify({
  type: 'rate_limit_event',
  rate_limit_info: { status, resetsAt, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization, resetsAt, status }, seven_day: { utilization: 0.1, resetsAt: resetsAt + 999999, status: 'allowed' } } },
}));
const inSeconds = (seconds) => Math.floor(Date.now() / 1000) + seconds;
if (item.includes('usagelow')) rateEvent(0.2, inSeconds(3600));
if (item.includes('usagehigh')) rateEvent(0.95, inSeconds(3600));
if (item.includes('usagesoon')) rateEvent(0.95, inSeconds(-59));
if (item.includes('usagefar')) rateEvent(0.95, inSeconds(9 * 3600));
if (item.includes('usagerefused')) {
  rateEvent(1, inSeconds(3600), 'rejected');
  console.log(JSON.stringify({ type: 'result', result: 'You have hit your limit', is_error: true, usage: {} }));
  process.exit(1);
}

if (item.includes('crash')) {
  console.error('limit reached');
  process.exit(1);
}
if (item.includes('error')) {
  respond('You have hit your limit', { is_error: true });
  process.exit(0);
}
if (item.includes('hang')) {
  const until = Date.now() + 60000;
  while (Date.now() < until) { /* waits to be stopped by the Budget */ }
  process.exit(0);
}
if (item.includes('noresult')) {
  respond('I did some work but never said how it ended.');
  process.exit(0);
}
if (item.includes('needssetup')) {
  fs.mkdirSync('.ourkit', { recursive: true });
  fs.writeFileSync('.ourkit/pending.json', '[{"id":1,"text":"Install a tool"}]\n');
  respond(`${SUMMARY}\nOURKIT-RESULT: blocked`);
  process.exit(0);
}
if (item.includes('dirtymain')) {
  fs.writeFileSync('left-behind.txt', 'x');
  respond(`${SUMMARY}\nOURKIT-RESULT: blocked`);
  process.exit(0);
}

const resumed = prompt.match(/saved on the branch `([^`]+)`/);
const branch = resumed ? resumed[1] : `ticket-${item}`;
if (resumed) fs.appendFileSync(process.env.FAKE_SESSION_LOG, `resumed ${branch}
`);
if (!resumed) git('switch', '-q', '-c', branch);
// Fails at the plan's limit partway through, the first time only.
if (item.includes('flaky') && !resumed) {
  fs.writeFileSync('half-done.txt', 'keep me');
  rateEvent(1, inSeconds(3600), 'rejected');
  console.log(JSON.stringify({ type: 'result', result: 'You have hit your limit', is_error: true, usage: {} }));
  process.exit(1);
}
fs.mkdirSync('.ourkit', { recursive: true });

// Each session sees what earlier ones carried over, and adds to it.
const lessons = fs.existsSync('.ourkit/lessons.md') ? fs.readFileSync('.ourkit/lessons.md', 'utf8') : '# Lessons\n\n';
fs.writeFileSync('.ourkit/lessons.md', `${lessons}- [cost] Learned from ${item}\n`);

// The records a real session keeps, for the Run Report to gather from this branch.
fs.mkdirSync('.ourkit/changes', { recursive: true });
fs.writeFileSync(`.ourkit/changes/${branch}.json`, JSON.stringify({
  decisions: [{ id: 1, decision: `Decided on ${item}`, why: 'It was simplest' }],
  questions: [
    { id: 1, question: `Open question on ${item}?`, answer: null },
    { id: 2, question: `Answered question on ${item}?`, answer: 'Yes' },
  ],
  testHandoff: [{ what: `Check ${item}`, steps: '1. Open it. 2. Look.' }],
  review: { findings: [
    { id: 1, severity: 'non-blocking', text: `A nicety on ${item}`, resolved: false },
    { id: 2, severity: 'blocking', text: `A fixed bug on ${item}`, resolved: true },
  ] },
}));

if (item.includes('stopped')) {
  fs.writeFileSync('half-done.txt', 'keep me');
  respond(`${SUMMARY}\nOURKIT-RESULT: stopped`);
  process.exit(0);
}
fs.writeFileSync(`work-${item}.txt`, 'done');
git('add', '-A');
git('commit', '-q', '-m', `work on ${item}`);
respond(`${SUMMARY}\nOURKIT-RESULT: ${item.includes('blocked') ? 'blocked' : 'shipped'}`);
