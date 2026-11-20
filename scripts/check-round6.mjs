import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const OUT = '/workspace/screenshots/r13';
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

async function open(width, height, { theme = 'day', path = '/' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme === 'night' ? 'dark' : 'light',
    deviceScaleFactor: 2,
  });
  const p = await context.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
  });
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForSelector('html[data-hydrated="true"]');
  await p.waitForTimeout(1400);
  return p;
}

async function readStory(p, ball, shot) {
  await p.getByRole('button', { name: new RegExp(`^${ball}`) }).first().click({ force: true });
  const panel = p.getByRole('dialog');
  await panel.waitFor({ state: 'visible' });
  await p.waitForTimeout(400);
  await panel.getByRole('button', { name: '品读片刻' }).click();
  await p.waitForTimeout(700);
  const title = (await panel.locator('h3').innerText()).trim();
  const canSwitch = await panel.getByRole('button', { name: '换一篇' }).count();
  const body = await p.locator('[data-story-body]').evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
  }));
  console.log(`${ball} #1 →`, JSON.stringify({ title, canSwitch, ...body }));
  await p.screenshot({ path: `${OUT}/${shot}-1.png` });
  return { panel, title, canSwitch };
}

/* 难过球：两篇，先「反复咀嚼」再「和解式胜利」 */
{
  const p = await open(390, 844);
  const { panel } = await readStory(p, '难过', 'story-sadness');
  await panel.getByRole('button', { name: '换一篇' }).click();
  await p.waitForTimeout(700);
  console.log('难过 #2 →', JSON.stringify((await panel.locator('h3').innerText()).trim()));
  await p.screenshot({ path: `${OUT}/story-sadness-2.png` });
  await panel.getByRole('button', { name: '换一篇' }).click();
  await p.waitForTimeout(700);
  console.log('难过 #3（应回到第 1 篇）→', JSON.stringify((await panel.locator('h3').innerText()).trim()));
  await p.close();
}

/* 痛苦球：同样两篇 */
{
  const p = await open(390, 844);
  await readStory(p, '痛苦', 'story-pain');
  await p.close();
}

/* 分别球：反复咀嚼 + 道谢 */
{
  const p = await open(390, 844);
  const { panel } = await readStory(p, '分别', 'story-parting');
  await panel.getByRole('button', { name: '换一篇' }).click();
  await p.waitForTimeout(700);
  console.log('分别 #2 →', JSON.stringify((await panel.locator('h3').innerText()).trim()));
  await p.screenshot({ path: `${OUT}/story-parting-2.png` });
  await p.locator('[data-story-body]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/story-parting-2-end.png` });
  await p.close();
}

/* 焦虑球：一篇，不该有「换一篇」 */
{
  const p = await open(390, 844);
  await readStory(p, '焦虑', 'story-anxiety');
  await p.close();
}

/* 广场说明：不应再有 tofu */
{
  const p = await open(390, 844, { path: '/square' });
  console.log(
    'notice →',
    JSON.stringify((await p.locator('text=置顶 · 广场说明').locator('..').innerText()).replace(/\n+/g, ' | ')),
  );
  await p.screenshot({ path: `${OUT}/square-notice.png` });
  await p.close();
}

await browser.close();
console.log('console errors:', errors.length ? errors : 'none');
