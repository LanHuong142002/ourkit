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
if (item.includes('dirtymain')) {
  fs.writeFileSync('left-behind.txt', 'x');
  respond(`${SUMMARY}\nOURKIT-RESULT: blocked`);
  process.exit(0);
}

const branch = `ticket-${item}`;
git('switch', '-q', '-c', branch);
fs.mkdirSync('.ourkit', { recursive: true });

// Each session sees what earlier ones carried over, and adds to it.
const lessons = fs.existsSync('.ourkit/lessons.md') ? fs.readFileSync('.ourkit/lessons.md', 'utf8') : '# Lessons\n\n';
fs.writeFileSync('.ourkit/lessons.md', `${lessons}- [cost] Learned from ${item}\n`);

if (item.includes('stopped')) {
  fs.writeFileSync('half-done.txt', 'keep me');
  respond(`${SUMMARY}\nOURKIT-RESULT: stopped`);
  process.exit(0);
}
fs.writeFileSync(`work-${item}.txt`, 'done');
git('add', '-A');
git('commit', '-q', '-m', `work on ${item}`);
respond(`${SUMMARY}\nOURKIT-RESULT: ${item.includes('blocked') ? 'blocked' : 'shipped'}`);
