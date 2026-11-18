import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const errors = [];

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

async function page(width, height, theme = 'day', reducedMotion = 'no-preference') {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme === 'night' ? 'dark' : 'light',
    reducedMotion,
  });
  const p = await context.newPage();
  p.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('time-machine') && !text.includes('404')) {
        errors.push(`[console] ${text}`);
      }
    }
  });
  p.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  return p;
}

async function ready(p, url) {
  await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForSelector('html[data-hydrated="true"]');
  await p.waitForTimeout(1800);
}

async function shot(name, p, full = false) {
  await p.screenshot({ path: `.shots/${name}.png`, fullPage: full });
  console.log('·', name);
}

// 1. 首页：白日 / 星空
{
  const p = await page(1440, 900, 'day');
  await ready(p, '/');
  await shot('day-home', p);
  const info = await p.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    orbs: document.querySelectorAll('.orb-surface').length,
    dock: !!document.querySelector('nav[aria-label="功能导航"]'),
    dockVisible: (() => {
      const el = document.querySelector('nav[aria-label="功能导航"]');
      if (!el) return false;
      return getComputedStyle(el).display !== 'none';
    })(),
    railVisible: (() => {
      const el = document.querySelector('.mb-scroll-x');
      if (!el) return false;
      return el.getBoundingClientRect().height > 0 && getComputedStyle(el.closest('div')).display !== 'none';
    })(),
  }));
  console.log('桌面首页:', JSON.stringify(info));
  await p.context().close();
}

{
  const p = await page(1440, 900, 'night');
  await ready(p, '/');
  await shot('night-home', p);
  console.log('星空数据:', await p.evaluate(() => document.documentElement.dataset.theme));
  await p.context().close();
}

// 2. 移动端
for (const theme of ['day', 'night']) {
  const p = await page(390, 844, theme);
  await ready(p, '/');
  await shot(`home-mobile-${theme}`, p);
  const bottom = await p.evaluate(() => {
    const dock = document.querySelector('nav[aria-label="功能导航"]');
    return {
      dockDisplay: dock ? getComputedStyle(dock).display : 'none',
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    };
  });
  console.log(`移动端 ${theme}:`, JSON.stringify(bottom));
  await p.context().close();
}

// 3. 情绪面板 + 捏爆
{
  const p = await page(1440, 900, 'night');
  await ready(p, '/');
  // 球一直在漂浮，"稳定"检查永远不会通过，所以直接强制点击
  await p.locator('.orb-anchor button').first().click({ force: true });
  await p.waitForTimeout(900);
  await shot('panel-night', p);
  const hasBurst = await p.getByRole('button', { name: /捏爆它/ }).count();
  console.log('面板「捏爆它」按钮:', hasBurst);
  await p.getByRole('button', { name: /捏爆它/ }).click();
  await p.waitForTimeout(260);
  await shot('burst-mid', p);
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({
    orbs: document.querySelectorAll('.orb-surface').length,
    stored: !!document.body.innerText.match(/颗球已经散去/),
  }));
  console.log('捏爆后:', JSON.stringify(after));
  await shot('burst-after', p);
  await p.context().close();
}

// 4. 新页面
const pages = [
  ['square', '/square'],
  ['calendar', '/calendar'],
  ['breathe', '/breathe'],
  ['quiz', '/quiz'],
];
for (const theme of ['day', 'night']) {
  for (const [name, url] of pages) {
    const p = await page(1440, 1000, theme);
    await ready(p, url);
    await shot(`${name}-${theme}`, p);
    await p.context().close();
  }
}

console.log('\n--- errors ---');
console.log(errors.length ? [...new Set(errors)].join('\n') : 'none');
await browser.close();
