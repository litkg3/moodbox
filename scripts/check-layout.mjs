// 布局检查：各视口下情绪球是否溢出视口、是否遮挡中央文案与底部入口栏
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const viewports = [
  { width: 360, height: 780, label: '安卓常见' },
  { width: 390, height: 844, label: 'iPhone 14' },
  { width: 768, height: 1024, label: 'iPad 竖屏' },
  { width: 834, height: 1112, label: 'iPad Air 竖屏' },
  { width: 1024, height: 768, label: 'iPad 横屏' },
  { width: 1280, height: 800, label: '笔记本' },
  { width: 1440, height: 900, label: '桌面' },
];

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
let problems = 0;

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-hydrated="true"]');
  await page.waitForTimeout(2600);

  const data = await page.evaluate((vw) => {
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) };
    };
    /** 只量文字实际占用的矩形，避免块级盒把整行宽度都算进来 */
    const glyphsOf = (el) => {
      if (!el) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return r.width && r.height ? { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) } : rectOf(el);
    };
    const orbs = [...document.querySelectorAll('.orb-surface')].map((el) => ({
      name: (el.textContent ?? '?').trim().split('\n')[0].slice(0, 4),
      ...rectOf(el),
    }));
    const heading = document.querySelector('h1');
    const blessing = [...document.querySelectorAll('p')].find((p) => p.textContent?.includes('情绪球'));
    const bar = document.querySelector('#main-content a[href="/memories"]')?.closest('div');
    return {
      orbs,
      heading: glyphsOf(heading),
      blessing: glyphsOf(blessing),
      bar: bar ? rectOf(bar) : null,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
    };
  }, vp.width);

  console.log(`\n=== ${vp.width}×${vp.height} ${vp.label} · 可见球 ${data.orbs.filter((o) => o.r > o.l).length} 颗 ===`);
  console.log(
    `中央文字：H1 l=${data.heading?.l} r=${data.heading?.r} t=${data.heading?.t} b=${data.heading?.b}；` +
      `寄语 l=${data.blessing?.l} r=${data.blessing?.r}；入口栏 t=${data.bar?.t}`,
  );
  const overlap = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

  for (const o of data.orbs) {
    const flags = [];
    if (o.r > data.innerW) flags.push(`右侧溢出 ${o.r - data.innerW}px`);
    if (o.l < 0) flags.push(`左侧溢出 ${-o.l}px`);
    if (overlap(o, data.heading)) flags.push('压住 H1');
    if (overlap(o, data.blessing)) flags.push('压住寄语');
    if (overlap(o, data.bar)) flags.push('压住底部入口栏');
    if (flags.length) problems += 1;
    console.log(
      `${o.name.padEnd(4)} w=${String(o.r - o.l).padStart(3)} l=${String(o.l).padStart(4)} r=${String(o.r).padStart(4)} ` +
        `t=${String(o.t).padStart(4)} b=${String(o.b).padStart(4)} ${flags.length ? '⚠️ ' + flags.join(' / ') : '✓'}`,
    );
  }
  const horizontalScroll = data.scrollW > data.innerW + 1;
  console.log(
    `页面横向滚动: ${horizontalScroll ? `⚠️ 有（scrollWidth ${data.scrollW} > ${data.innerW}）` : '✓ 无'}；文档高 ${data.scrollH} / 视口高 ${data.innerH}`,
  );
  if (horizontalScroll) problems += 1;
  await page.close();
}

await browser.close();
console.log(problems === 0 ? '\n✅ 布局检查通过' : `\n⚠️ 发现 ${problems} 处布局问题`);
if (problems > 0) process.exitCode = 1;
