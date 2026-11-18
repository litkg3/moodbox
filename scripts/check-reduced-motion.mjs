// 对比「减少动效」与常规模式下的球体位置，确认降级后仍居中、不压标题
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
let bad = 0;

for (const mode of ['reduce', 'no-preference']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: mode });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-hydrated="true"]');
  await page.waitForTimeout(1600);

  const info = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const range = document.createRange();
    range.selectNodeContents(h1);
    const hr = range.getBoundingClientRect();
    const orbs = [...document.querySelectorAll('.orb-surface')].map((el) => {
      const r = el.getBoundingClientRect();
      return { n: (el.textContent ?? '').trim().slice(0, 2), l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) };
    });
    const hits = orbs.filter((o) => o.l < hr.right && hr.left < o.r && o.t < hr.bottom && hr.top < o.b).map((o) => o.n);
    return { h1: [Math.round(hr.left), Math.round(hr.right)], count: orbs.length, sample: orbs[0], hits };
  });

  console.log(`${mode.padEnd(14)} 球数=${info.count} 第一颗=${JSON.stringify(info.sample)} H1=${JSON.stringify(info.h1)} 压字=${info.hits.length ? info.hits.join('/') : '无'}`);
  if (info.hits.length) bad += 1;
  await page.screenshot({ path: `.shots/home-${mode === 'reduce' ? 'reduced' : 'normal'}.png` });
  await context.close();
}

await browser.close();
console.log(bad === 0 ? '\n✅ 两种模式布局一致，减少动效下球仍居中' : '\n⚠️ 减少动效下存在压字');
if (bad > 0) process.exitCode = 1;
