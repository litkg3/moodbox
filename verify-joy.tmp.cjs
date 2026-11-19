const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 940 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);

  // 开心球
  await p.locator('.orb-anchor button').filter({ hasText: '开心' }).first().click({ force: true });
  await p.waitForTimeout(900);
  const panel = p.getByRole('dialog');
  const labels = await panel.locator('div.mt-7 button').allInnerTexts();
  console.log('开心球按钮:', labels.map((t) => t.trim()).join(' | '));
  await panel.screenshot({ path: '/tmp/joy-panel.png' });
  await pageClose(panel, p);

  // 焦虑球对照
  await p.locator('.orb-anchor button').filter({ hasText: '焦虑' }).first().click({ force: true });
  await p.waitForTimeout(900);
  const p2 = p.getByRole('dialog');
  console.log('焦虑球按钮:', (await p2.locator('div.mt-7 button').allInnerTexts()).map((t) => t.trim()).join(' | '));
  await p2.screenshot({ path: '/tmp/anxiety-panel.png' });
  await b.close();

  async function pageClose(panel, page) {
    await panel.getByRole('button', { name: /天天开心|我感觉好一点了/ }).click();
    await page.waitForTimeout(500);
  }
})();
