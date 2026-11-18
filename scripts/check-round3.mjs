import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const errors = [];
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

async function open(width, height, theme = 'day') {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: theme === 'night' ? 'dark' : 'light',
  });
  const p = await context.newPage();
  p.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text());
  });
  p.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForSelector('html[data-hydrated="true"]');
  await p.waitForTimeout(1500);
  return p;
}

/* 1. 桌面：导航条 + 球数 */
{
  const p = await open(1440, 900);
  const info = await p.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="功能导航"]');
    return {
      orbs: document.querySelectorAll('.orb-surface').length,
      navItems: nav ? nav.querySelectorAll('a,button').length : 0,
      navVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
      dockGone: !document.querySelector('.mb-dock'),
      squareBtn: !!Array.from(document.querySelectorAll('a')).find((a) =>
        a.textContent?.includes('树洞广场'),
      ),
      blessing: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim(),
    };
  });
  console.log('桌面:', JSON.stringify(info));
  await p.screenshot({ path: '.shots/r3-home-desktop.png' });

  // 点一颗球看面板
  await p.locator('.orb-anchor button').first().click({ force: true });
  await p.waitForTimeout(900);
  const panel = await p.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const texts = dialog ? Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent?.trim()) : [];
    return {
      hasDialog: !!dialog,
      buttons: texts.filter((t) => t && t.length > 0),
      centered: dialog
        ? getComputedStyle(dialog.querySelector('p[aria-live="polite"]')).textAlign
        : null,
      color: dialog
        ? getComputedStyle(dialog.querySelector('p[aria-live="polite"]')).color
        : null,
      cardBg: dialog ? getComputedStyle(dialog.firstElementChild).backgroundColor : null,
    };
  });
  console.log('面板:', JSON.stringify(panel));
  await p.screenshot({ path: '.shots/r3-panel-desktop.png' });

  // 看个小故事
  const storyBtn = p.getByRole('button', { name: '看个小故事' });
  await storyBtn.click();
  await p.waitForTimeout(900);
  console.log('故事标题:', await p.locator('[role="dialog"] h3').first().textContent());
  await p.screenshot({ path: '.shots/r3-story-desktop.png' });
  await p.getByRole('button', { name: '回到刚才' }).click();
  await p.waitForTimeout(500);

  // 捏爆 + 等自动飞回
  const before = await p.locator('.orb-surface').count();
  await p.getByRole('button', { name: '捏爆它' }).click();
  await p.waitForTimeout(2200);
  const afterBurst = await p.locator('.orb-surface').count();
  await p.waitForTimeout(6500);
  const afterReturn = await p.locator('.orb-surface').count();
  console.log('捏爆:', JSON.stringify({ before, afterBurst, afterReturn }));

  await p.context().close();
}

/* 2. 开心罐 + 心事信箱卡片 */
{
  const p = await open(1440, 900);
  await p.getByRole('button', { name: '开心罐' }).click();
  await p.waitForTimeout(1000);
  console.log('罐子:', await p.locator('[role="dialog"]').first().isVisible());
  await p.screenshot({ path: '.shots/r3-jar.png' });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);

  await p.getByRole('button', { name: '心事信箱' }).click();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: '.shots/r3-letters.png' });
  await p.keyboard.press('Escape');
  await p.context().close();
}

/* 3. 移动端：只有主页 / 更多 */
{
  const p = await open(390, 844);
  const info = await p.evaluate(() => {
    const header = document.querySelector('header');
    const labels = header
      ? Array.from(header.querySelectorAll('a, button'))
          .map((el) => el.textContent?.trim())
          .filter((t) => t && t.length < 8)
      : [];
    return {
      labels,
      navBarVisible: (() => {
        const nav = document.querySelector('nav[aria-label="功能导航"]');
        return nav ? getComputedStyle(nav).display !== 'none' : false;
      })(),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  console.log('移动端:', JSON.stringify(info));
  await p.screenshot({ path: '.shots/r3-home-mobile.png' });

  await p.getByRole('button', { name: '更多' }).click();
  await p.waitForTimeout(700);
  console.log('更多项数:', await p.locator('[role="menu"] li').count());
  await p.screenshot({ path: '.shots/r3-more-menu.png' });
  await p.context().close();
}

/* 4. 夜间面板 */
{
  const p = await open(1440, 900, 'night');
  await p.locator('.orb-anchor button').first().click({ force: true });
  await p.waitForTimeout(900);
  await p.screenshot({ path: '.shots/r3-panel-night.png' });
  await p.context().close();
}

await browser.close();
console.log(errors.length ? `errors:\n${errors.slice(0, 8).join('\n')}` : 'errors: none');
