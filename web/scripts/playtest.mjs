// Headless play-through of the core loop: read the problem, solve it on the gem
// pad, MINE, and assert the gem is mined, the collection increments, and the next
// problem appears. Runs several rounds (correct + one deliberate wrong) so the
// adaptive-branch advance and the retry path are both exercised.
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://127.0.0.1:5188';

function solve(prompt) {
  const m = prompt.replace(/−/g, '-').match(/(\d+)\s*([+\-x×÷*/])\s*(\d+)/);
  if (!m) throw new Error(`unparseable prompt: "${prompt}"`);
  const a = +m[1], b = +m[3];
  switch (m[2]) {
    case '+': return a + b;
    case '-': return a - b;
    case 'x': case '×': case '*': return a * b;
    case '÷': case '/': return a / b;
    default: throw new Error(`unknown op ${m[2]}`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.pad .key-mine');
await page.waitForTimeout(3000); // let GLB assets parse so the loop isn't janked

const key = (label) => page.locator('.pad .key', { hasText: new RegExp(`^${label}`) }).first();
const tapNumber = async (n) => { for (const ch of String(n)) await key(ch).click(); };
const problemText = () => page.locator('#problem').textContent();
const collection = async () => +(await page.locator('#collection-count').textContent());

const log = [];
async function round(i, { wrongFirst } = {}) {
  const prompt = (await problemText()).trim();
  const answer = solve(prompt);
  const before = await collection();

  if (wrongFirst) {
    await tapNumber(answer === 0 ? 1 : 0); // a guaranteed-wrong guess
    await key('MINE').click();
    await page.waitForTimeout(450);
    const stillSame = (await problemText()).trim() === prompt;
    // Note: we only assert the problem HELD. The gem counter is server-authoritative
    // and animated, so its exact value mid-round depends on profile state (e.g. a
    // big balance still rolling) — not a signal of the wrong-answer behavior.
    log.push(`round ${i}: wrong guess on "${prompt}" → held=${stillSame}`);
    if (!stillSame) throw new Error(`wrong-path failed (problem advanced) on "${prompt}"`);
  }

  await tapNumber(answer);
  await page.waitForTimeout(80);
  const shown = (await page.locator('#answer').textContent()).trim();
  if (shown !== String(answer)) throw new Error(`answer display "${shown}" != ${answer}`);

  await key('MINE').click();
  // Poll for the reward gem to land in the counter (animation ~0.9s; allow slack).
  let after = before;
  for (let w = 0; w < 30 && after !== before + 1; w++) { await page.waitForTimeout(100); after = await collection(); }
  await page.waitForTimeout(300); // let advance() swap in the next problem
  const nextPrompt = (await problemText()).trim();
  log.push(`round ${i}: "${prompt}"=${answer} → collection ${before}->${after}, next "${nextPrompt}"`);
  if (after !== before + 1) throw new Error(`collection did not increment on "${prompt}"`);
  if (!nextPrompt || nextPrompt === '…') throw new Error('no next problem after mine');
}

try {
  await round(1);
  await round(2, { wrongFirst: true });
  await round(3);
  await round(4);
  console.log(log.join('\n'));
  console.log(`\nconsoleErrors: ${JSON.stringify(errors)}`);
  console.log('PLAYTEST: PASS');
} catch (e) {
  console.log(log.join('\n'));
  console.log(`consoleErrors: ${JSON.stringify(errors)}`);
  console.error('PLAYTEST: FAIL —', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
