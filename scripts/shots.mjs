import { chromium } from 'playwright';

const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3107';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });
const errors = [];
const expected = [];

async function shot(name, { width = 1440, height = 900, path: url = '/', full = false, before } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 音频文件按版权要求没有随项目分发，缺失音源时这条 404 是预期结果
    if (text.includes('404')) expected.push(`[${name}] ${text}`);
    else errors.push(`[${name}] console: ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`[${name}] pageerror: ${err.message}`));
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2200);
  if (before) await before(page);
  await page.screenshot({ path: `.shots/${name}.png`, fullPage: full });
  await context.close();
}

await shot('home-desktop');
await shot('panel-anxiety', {
  before: async (page) => {
    await page.getByRole('button', { name: /^焦虑/ }).click({ force: true });
    await page.waitForTimeout(1200);
  },
});
await shot('comfort-empty', {
  before: async (page) => {
    await page.getByRole('button', { name: '我不开心了' }).click();
    await page.waitForTimeout(1800);
  },
});
await shot('memories-empty', { path: '/memories' });
await shot('calendar-empty', { path: '/calendar' });
await shot('about', { path: '/about', full: true });
await shot('home-mobile', { width: 390, height: 844 });
await shot('home-tablet', { width: 768, height: 1024 });
await shot('home-tablet-landscape', { width: 1024, height: 768 });
await shot('memories-mobile', { width: 390, height: 844, path: '/memories' });
await shot('calendar-mobile', { width: 390, height: 844, path: '/calendar' });

console.log(errors.length ? '❌ 意外错误:\n' + errors.join('\n') : '✅ 无控制台错误');
console.log(expected.length ? `ℹ️ 预期内 404 ×${expected.length}（音源未随项目分发）` : 'ℹ️ 无 404');
await browser.close();
