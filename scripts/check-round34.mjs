/**
 * 第三十四轮目检：标题、盘下说明、焦虑/麻木球的新句子。
 *
 * 跑之前先起生产服务：npm run build && npm run start -- -p 3210
 * 然后：node scripts/check-round34.mjs
 *
 * 单测和 e2e 已经把文案、2×2 排布钉住了；这个脚本负责的是「看上去对不对」：
 * 整句有没有被裁、矮屏会不会挤、两个球里那两句话是不是真的能翻到。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3210';
const OUT = '/workspace/screenshots/r34';
const WHEEL_SENTENCE = '在情绪转盘中，对角180°方向两种混合情绪互为相反情绪';
const BALL_SENTENCES = {
  焦虑: '给自己一点时间，不要焦虑。一步一步来，一日一日过，请相信生命的韧性是惊人的。',
  麻木: '人有时需要独自走走，听听街头人群喧嚣，看看巷尾草木生长，悲伤也成享受。',
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const errors = [];

async function openHome(width, height, deviceScaleFactor = 2) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-hydrated="true"]');
  await page.evaluate(() => localStorage.setItem('moodbox-force-local', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-hydrated="true"]');
  await page.waitForTimeout(1200);
  return { page, context };
}

async function scrollToWheel(page) {
  const index = await page.evaluate(() =>
    [...document.querySelectorAll('.mb-screen')].findIndex((section) =>
      section.querySelector('.emotion-wheel'),
    ),
  );
  await page.evaluate((i) => {
    const section = document.querySelectorAll('.mb-screen')[i];
    window.scrollTo({ top: section.offsetTop, behavior: 'instant' });
  }, index);
  await page.waitForTimeout(1200);
}

/* ---------- 1. 桌面 / 矮屏 / 手机：标题与说明 ---------- */
for (const [width, height, name] of [
  [1440, 900, 'wheel-1440'],
  [1440, 760, 'wheel-1440x760'],
  [390, 844, 'wheel-mobile'],
]) {
  const { page, context } = await openHome(width, height);
  await scrollToWheel(page);

  const info = await page.evaluate(() => {
    const note = document.querySelector('.emotion-wheel-note');
    const rows = [...note.querySelectorAll('.emotion-wheel-note-row')];
    const box = note.getBoundingClientRect();
    const wide = note.querySelector('.is-wide');
    const wideBox = wide.getBoundingClientRect();
    const screen = document.querySelector('.emotion-wheel').closest('.mb-screen');
    return {
      eyebrow: document.querySelector('.emotion-screen-inner p')?.textContent?.trim(),
      heading: document.querySelector('.emotion-screen-inner h2')?.textContent?.trim(),
      rows: rows.map((row) => ({
        term: row.querySelector('dt')?.textContent?.trim() ?? null,
        text: row.querySelector('dd')?.textContent?.trim(),
        top: Math.round(row.getBoundingClientRect().top),
      })),
      wideHasTerm: Boolean(wide.querySelector('dt')),
      wideInside: wideBox.left >= box.left - 1 && wideBox.right <= box.right + 1,
      overflow: screen.scrollHeight - screen.clientHeight,
    };
  });

  console.log(`\n[${name}]`, JSON.stringify(info, null, 1));
  if (info.eyebrow !== '学会与自己对话' || info.heading !== '普拉奇克情绪轮') {
    errors.push(`${name}: 标题不对`);
  }
  if (info.rows[0].top !== info.rows[1].top || info.rows[2].top !== info.rows[3].top) {
    errors.push(`${name}: 前四条没有两两并排`);
  }
  if (info.rows[4].term !== null || info.rows[4].text !== WHEEL_SENTENCE || info.wideHasTerm) {
    errors.push(`${name}: 整句不对（还带名词前缀或文案不符）`);
  }
  if (!info.wideInside) errors.push(`${name}: 整句溢出说明区`);

  await page.screenshot({ path: `${OUT}/${name}.png` });
  if (name === 'wheel-1440') {
    await page.locator('.emotion-wheel-note').screenshot({ path: `${OUT}/note.png` });
  }
  await context.close();
}

/* ---------- 2. 两个球：翻到新加的那句话 ---------- */
for (const [label, sentence] of Object.entries(BALL_SENTENCES)) {
  // 独立上下文：Esc 会把上一轮的浮层一起收掉，共用一个 page 容易互相干扰
  const { page, context } = await openHome(1440, 900);
  // 球一直在做漂浮动画，Playwright 的「元素稳定」检查会一直等；跳过它
  await page.getByRole('button', { name: new RegExp(`^${label}[：:]`) }).first().click({ force: true });
  await page.waitForTimeout(1000);

  let found = false;
  let tries = 0;
  while (tries < 80) {
    tries += 1;
    if ((await page.locator('body').innerText()).includes(sentence)) {
      found = true;
      break;
    }
    const next = page.getByRole('button', { name: /再给我一点温暖/ });
    if ((await next.count()) === 0) break;
    await next.click({ force: true });
    await page.waitForTimeout(220);
  }
  console.log(`\n[${label}球] 翻了 ${tries} 次，找到新句子：${found}`);
  if (!found) errors.push(`${label}球：没翻到新句子`);
  else await page.locator('[role="dialog"]').first().screenshot({ path: `${OUT}/ball-${label}.png` });
  await context.close();
}

console.log('\n错误：', errors.length ? errors : '无');
await browser.close();
if (errors.length > 0) process.exitCode = 1;
