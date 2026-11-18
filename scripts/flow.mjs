import { chromium } from 'playwright';

const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3107';
const errors = [];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server'] });

async function run(label, viewport, steps) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => {
    // 音频没有随项目分发，缺失音源时的 404 属于预期结果
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(`[${label}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror ${e.message}`));
  await steps(page, context);
  await context.close();
}

const demo = async (page) => {
  await page.goto(`${BASE}/memories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /备份与隐私/ }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '载入演示数据' }).click();
  await page.waitForTimeout(1400);
};

await run('desktop', { width: 1440, height: 900 }, async (page) => {
  await demo(page);
  await page.screenshot({ path: '.shots/memories-filled.png' });

  // 手动新增一条记忆，验证表单与保存反馈
  await page.getByRole('button', { name: /收藏一份快乐/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByPlaceholder('今天有什么值得偷偷开心的小事吗？').fill('测试：傍晚的云是粉色的，我在楼下站了五分钟才回家。');
  await page.getByRole('button', { name: /收进盒子/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '.shots/memories-saved.png' });

  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: '.shots/calendar-filled.png', fullPage: true });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: '我不开心了' }).click();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: '.shots/comfort-memory.png' });

  await page.goto(`${BASE}/memories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.getByRole('button', { name: /^查看《/ }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: '.shots/memory-detail.png' });
});

await run('mobile', { width: 390, height: 844 }, async (page) => {
  await demo(page);
  await page.screenshot({ path: '.shots/memories-filled-mobile.png' });
  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: '.shots/calendar-filled-mobile.png', fullPage: true });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: '我不开心了' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '.shots/comfort-mobile.png' });
});

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
