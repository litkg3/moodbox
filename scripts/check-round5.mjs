import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const OUT = '/workspace/screenshots/r12';
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
  await p.waitForTimeout(1500);
  return p;
}

/* 1. 首页新标题：桌面 + 移动 */
{
  const p = await open(1440, 900);
  const h1 = p.getByRole('heading', { level: 1 });
  console.log('h1 text:', JSON.stringify((await h1.innerText()).trim()));
  console.log(
    'h1 box:',
    JSON.stringify(await h1.evaluate((el) => el.getBoundingClientRect().toJSON())),
  );
  await p.screenshot({ path: `${OUT}/home-desktop.png` });
  await p.close();
}
{
  const p = await open(390, 844);
  await p.screenshot({ path: `${OUT}/home-mobile.png` });
  await p.close();
}
{
  const p = await open(390, 600);
  await p.screenshot({ path: `${OUT}/home-short.png` });
  await p.close();
}

/* 2. 难过球 / 痛苦球的小故事：四段随笔 */
for (const [id, name] of [
  ['难过', 'sadness'],
  ['痛苦', 'pain'],
]) {
  const p = await open(390, 844);
  await p.getByRole('button', { name: new RegExp(`^${id}`) }).first().click({ force: true });
  await p.getByRole('dialog').waitFor({ state: 'visible' });
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: '看个小故事' }).click();
  await p.waitForTimeout(700);
  const body = await p.locator('[data-story-body]').evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    paragraphs: el.querySelectorAll('p').length,
    text: el.textContent?.slice(0, 40),
  }));
  console.log(name, 'story:', JSON.stringify(body));
  await p.screenshot({ path: `${OUT}/story-${name}.png` });
  // 滚到底，确认结尾那句在
  await p.locator('[data-story-body]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/story-${name}-end.png` });
  await p.close();
}

/* 3. 烦躁球：两句 + 直达入口 */
{
  const p = await open(390, 844);
  await p.getByRole('button', { name: /^烦躁/ }).first().click({ force: true });
  await p.getByRole('dialog').waitFor({ state: 'visible' });
  await p.waitForTimeout(600);
  const hasAction = await p.getByRole('link', { name: '去呼吸放松' }).count();
  const hasWarm = await p.getByRole('button', { name: '再给我一点温暖' }).count();
  console.log('irritation action:', hasAction, 'warmUp:', hasWarm);
  await p.screenshot({ path: `${OUT}/panel-irritation.png` });
  await p.getByRole('button', { name: '再给我一点温暖' }).click();
  await p.waitForTimeout(700);
  console.log('irritation 2nd msg:', JSON.stringify((await p.locator('[aria-live="polite"]').first().innerText()).trim()));
  await p.screenshot({ path: `${OUT}/panel-irritation-2.png` });
  await p.close();
}

/* 4. 树洞广场置顶说明 */
{
  const p = await open(390, 844, { path: '/square' });
  const notice = await p.locator('text=置顶 · 广场说明').locator('..').innerText();
  console.log('notice:', JSON.stringify(notice));
  await p.screenshot({ path: `${OUT}/square-notice.png` });
  await p.close();
}

await browser.close();
console.log('console errors:', errors.length ? errors : 'none');
