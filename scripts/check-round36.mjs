/**
 * 第三十六轮目检：情绪足迹里恢复的「这些天出现过的情绪」。
 *
 * npm run dev -- -p 3107
 * BASE_URL=http://127.0.0.1:3107 node scripts/check-round36.mjs
 *
 * 每档视口都走一遍真实链路：先在主页记两次情绪，再进情绪足迹，
 * 量这块的宽度/行高，确认横条没有把次数挤出卡片、文字没有折成一条竖线。
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const OUT = '/workspace/screenshots/r36';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const errors = [];

const cases = [
  { width: 1440, height: 900, name: 'pc-1440' },
  { width: 1280, height: 800, name: 'pc-1280' },
  { width: 768, height: 900, name: 'tablet-768' },
  { width: 390, height: 844, name: 'mobile-390' },
];

async function recordEmotion(page, label) {
  await page.getByRole('button', { name: new RegExp(`^${label}：`) }).first().focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '记录此刻的情绪' }).click();
  await page.getByText('已收进今天的情绪里').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

await mkdir(OUT, { recursive: true });

for (const item of cases) {
  const context = await browser.newContext({
    viewport: { width: item.width, height: item.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${item.name}: ${error.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-hydrated="true"]');
  await page.waitForTimeout(1200);

  await recordEmotion(page, '开心');
  await recordEmotion(page, '焦虑');

  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-hydrated="true"]');
  await page.waitForTimeout(1200);

  const measured = await page.evaluate(() => {
    const section = document.querySelector('section[aria-labelledby="weekly-emotions-title"]');
    if (!section) return null;
    const rows = [...section.querySelectorAll('li')];
    const box = section.getBoundingClientRect();
    const firstCount = rows[0]?.lastElementChild;
    return {
      width: Math.round(box.width),
      rows: rows.length,
      labels: rows.map((row) => row.firstElementChild?.textContent?.trim()),
      counts: rows.map((row) => row.lastElementChild?.textContent?.trim()),
      // 行内不许溢出：进度条 + 名字 + 次数加起来不该超过卡片内容宽度
      rowOverflow: rows.some((row) => row.scrollWidth > row.clientWidth + 1),
      countBox: firstCount ? Math.round(firstCount.getBoundingClientRect().width) : null,
      // 空状态那段话（有记录时不该出现）
      empty: section.textContent?.includes('还没有记录'),
    };
  });

  console.log(`[${item.name}]`, JSON.stringify(measured));

  if (!measured) errors.push(`${item.name}: 找不到情绪构成模块`);
  else {
    if (measured.rows !== 2) errors.push(`${item.name}: 行数 ${measured.rows}（应为 2）`);
    if (measured.rowOverflow) errors.push(`${item.name}: 行内容横向溢出`);
    if (measured.empty) errors.push(`${item.name}: 有记录却出现空状态文案`);
  }

  await page.screenshot({ path: `${OUT}/${item.name}.png`, fullPage: true });
  const section = page.locator('section[aria-labelledby="weekly-emotions-title"]');
  await section.screenshot({ path: `${OUT}/${item.name}-module.png` });

  await context.close();
}

await browser.close();

if (errors.length > 0) {
  console.error('目检未通过：');
  for (const error of errors) console.error(' -', error);
  process.exit(1);
}
console.log('目检通过，截图在', OUT);
