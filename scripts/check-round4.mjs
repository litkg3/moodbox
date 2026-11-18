import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const errors = [];
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

async function open(width, height, theme = 'day', path = '/') {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme === 'night' ? 'dark' : 'light',
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

/* 1440：导航应与控件同一行 */
{
  const p = await open(1440, 900);
  const info = await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="功能导航"]');
    const theme = document.querySelector('button[aria-label^="切换到"]');
    const header = document.querySelector('header > div:nth-child(2)');
    const labels = nav ? Array.from(nav.querySelectorAll('li')) : [];
    return {
      navItems: labels.length,
      navRect: nav?.getBoundingClientRect().toJSON(),
      themeRect: theme?.getBoundingClientRect().toJSON(),
      headerRows: header ? header.getBoundingClientRect().height : 0,
      labelVisible: nav ? getComputedStyle(nav.querySelector('span')).display : null,
      orbLabelSize: (() => {
        const el = document.querySelector('.orb-label');
        return el ? getComputedStyle(el).fontSize : null;
      })(),
    };
  });
  console.log('1440:', JSON.stringify(info));
  await p.screenshot({ path: '.shots/r4-home-1440.png' });
  await p.context().close();
}

/* 1024：只留图标，仍是一行 */
{
  const p = await open(1024, 800);
  console.log(
    '1024:',
    await p.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="功能导航"]');
      const header = document.querySelector('header > div:nth-child(2)');
      return {
        labelVisible: nav ? getComputedStyle(nav.querySelector('span')).display : null,
        headerHeight: header ? Math.round(header.getBoundingClientRect().height) : 0,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    }),
  );
  await p.screenshot({ path: '.shots/r4-home-1024.png' });
  await p.context().close();
}

/* 390：更多按钮 */
{
  const p = await open(390, 844);
  const info = await p.evaluate(() => {
    const more = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === '更多',
    );
    const style = more ? getComputedStyle(more) : null;
    return {
      moreSize: more ? { w: Math.round(more.getBoundingClientRect().width), h: Math.round(more.getBoundingClientRect().height) } : null,
      moreBg: style?.backgroundImage?.slice(0, 60),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  console.log('390:', JSON.stringify(info));
  await p.screenshot({ path: '.shots/r4-home-390.png' });
  await p.context().close();
}

/* 情绪足迹：底部应有「这一周」 */
{
  const p = await open(1440, 1000, 'day', '/calendar');
  const hasWeekly = await p.getByRole('heading', { name: '这一周' }).isVisible();
  console.log('calendar weekly:', hasWeekly);
  await p.screenshot({ path: '.shots/r4-calendar.png', fullPage: true });

  // 周报页应当 404
  const res = await p.goto(`${BASE}/weekly`, { waitUntil: 'domcontentloaded' });
  console.log('weekly status:', res?.status());
  await p.context().close();
}

/* 卡片：透明度与圆角 */
{
  const p = await open(1440, 900);
  await p.locator('.orb-anchor button').first().click({ force: true });
  await p.waitForTimeout(900);
  const card = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const cs = d ? getComputedStyle(d) : null;
    return {
      radius: cs?.borderTopLeftRadius,
      bg: cs?.backgroundImage?.slice(0, 90),
      padding: cs?.paddingLeft,
    };
  });
  console.log('panel card:', JSON.stringify(card));
  await p.screenshot({ path: '.shots/r4-panel.png' });
  await p.context().close();

  const p2 = await open(1440, 900);
  await p2.getByRole('button', { name: '开心罐' }).click();
  await p2.waitForTimeout(900);
  const jar = await p2.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const cs = d ? getComputedStyle(d) : null;
    return { radius: cs?.borderTopLeftRadius, bg: cs?.backgroundImage?.slice(0, 90) };
  });
  console.log('jar card:', JSON.stringify(jar));
  await p2.screenshot({ path: '.shots/r4-jar.png' });
  await p2.context().close();
}

await browser.close();
console.log(errors.length ? `errors:\n${errors.slice(0, 6).join('\n')}` : 'errors: none');
