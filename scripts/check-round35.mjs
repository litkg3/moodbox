/**
 * 第三十五轮目检：PC 端首页文案只把字号抬 1px，别的断点不许动。
 *
 * npm run build && npm run start -- -p 3210
 * node scripts/check-round35.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3210';
const OUT = '/workspace/screenshots/r35';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const errors = [];

const cases = [
  { width: 1440, height: 900, name: 'pc-1440', invite: '18.5px', blessing: '12px', button: '13.5px' },
  { width: 1280, height: 800, name: 'pc-1280', invite: '18.5px', blessing: '12px', button: '13.5px' },
  { width: 768, height: 900, name: 'tablet-768', invite: '17.5px', blessing: '11px', button: '12.5px' },
  { width: 390, height: 844, name: 'mobile-390', invite: '15px', blessing: '10.5px', button: '12.5px' },
  // 矮屏那条规则是 unlayered，必须仍然压得住工具类的 lg:text-*
  { width: 1440, height: 480, name: 'pc-short', invite: '12px', blessing: null, button: '11.5px' },
];

for (const item of cases) {
  const context = await browser.newContext({
    viewport: { width: item.width, height: item.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-hydrated="true"]');
  await page.waitForTimeout(1000);

  const measured = await page.evaluate(() => {
    const invite = document.querySelector('.home-title-invite');
    const blessing = document.querySelector('.home-copy p');
    const button = document.querySelector('.home-copy a');
    const copy = document.querySelector('.home-copy');
    const fs = (el) => (el ? getComputedStyle(el).fontSize : null);
    return {
      invite: fs(invite),
      blessing: fs(blessing),
      blessingDisplay: blessing ? getComputedStyle(blessing).display : null,
      button: fs(button),
      copyW: copy ? Math.round(copy.getBoundingClientRect().width) : null,
      copyScrollW: copy?.scrollWidth,
    };
  });

  console.log(`[${item.name}]`, JSON.stringify(measured));
  if (measured.invite !== item.invite) errors.push(`${item.name}: 邀请语字号 ${measured.invite}`);
  if (measured.button !== item.button) errors.push(`${item.name}: 按钮字号 ${measured.button}`);
  if (item.blessing === null) {
    if (measured.blessingDisplay !== 'none') errors.push(`${item.name}: 矮屏寄语没藏起来`);
  } else if (measured.blessing !== item.blessing) {
    errors.push(`${item.name}: 寄语字号 ${measured.blessing}`);
  }
  if (measured.copyScrollW > measured.copyW + 1) errors.push(`${item.name}: 文案块横向溢出`);

  await page.screenshot({ path: `${OUT}/${item.name}.png` });
  await context.close();
}

console.log('错误：', errors.length ? errors : '无');
await browser.close();
if (errors.length > 0) process.exitCode = 1;
