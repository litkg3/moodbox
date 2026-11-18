// 验收：音源缺失时的降级表现（面板状态、路径提示、页面无报错、其它功能可用）
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('html[data-hydrated="true"]');

const trigger = page.getByRole('button', { name: /背景音乐|打开背景音乐/ });
console.log('trigger aria-label:', await trigger.getAttribute('aria-label'));

await trigger.click();
await page.waitForTimeout(500);
const dialog = page.getByRole('dialog', { name: '背景音乐设置' });
console.log('--- 打开面板（未点播放）---\n' + (await dialog.innerText()));

// 点一次播放，确认不会卡在“准备中”，而是稳定落到“未接入”
await dialog.getByRole('button', { name: /播放背景音乐|暂停背景音乐/ }).click();
await page.waitForTimeout(1200);
const afterText = await dialog.innerText();
console.log('--- 点击播放后 ---\n' + afterText);

const ok = afterText.includes('未接入') && afterText.includes('/audio/time-machine.mp3');
console.log(ok ? 'RESULT: PASS（缺失音源已明确告知且给出放置路径）' : 'RESULT: FAIL');

await page.screenshot({ path: '.shots/audio-missing.png', clip: { x: 860, y: 0, width: 420, height: 360 } });

// 其它功能不受影响
await page.keyboard.press('Escape');
await page.locator('#main-content').getByRole('link', { name: /快乐收藏馆/ }).click();
await page.waitForTimeout(800);
console.log('memories page heading:', await page.getByRole('heading', { level: 1 }).innerText());
console.log('pageerrors:', errors.length ? errors : 'none');

await browser.close();
if (!ok) process.exitCode = 1;
