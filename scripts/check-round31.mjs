import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/**
 * 第三十一轮的目检：三件事。
 *
 *   1. 情绪足迹底部不再有「这些天出现过的情绪」那块排行；
 *   2. 开心罐里的纸条整行可点，点开是详情（而不是编辑表单）；
 *   3. 纸条上只有正文，没有那行自动截出来的标题。
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3210';
const OUT = '/workspace/screenshots/r31';
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

async function openPage(path) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const p = await context.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
  });
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForSelector('html[data-hydrated="true"]');
  await p.evaluate(() => window.localStorage.setItem('moodbox-force-local', '1'));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('html[data-hydrated="true"]');
  await p.waitForTimeout(1500);
  return { p, context };
}

/* ---------- 1. 情绪足迹 ---------- */
{
  const { p, context } = await openPage('/calendar');
  const ranked = await p.getByText('这些天出现过的情绪').count();
  console.log('「这些天出现过的情绪」出现次数：', ranked);
  const summary = p.locator('section[aria-labelledby="weekly-summary-title"]');
  await summary.scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/calendar-week.png`, fullPage: false });
  const text = await summary.innerText();
  console.log('这一周区块里还提到「最常出现」吗：', text.includes('最常出现的情绪'), '（这是三张数字卡之一，保留）');
  await context.close();
}

/* ---------- 2 & 3. 开心罐 ---------- */
{
  const { p, context } = await openPage('/');
  await p.getByRole('button', { name: /开心罐/ }).first().click();
  const sheet = p.getByRole('dialog').first();
  await sheet.waitFor({ state: 'visible' });
  // 全新上下文里罐子是空的，先载入演示数据 —— 纸条行才有东西可点
  const demoBtn = sheet.getByRole('button', { name: '载入演示数据' });
  await demoBtn.scrollIntoViewIfNeeded();
  // 备份面板默认是折起来的，按钮被它盖住 —— 先展开
  await sheet.locator('button[aria-expanded="false"]').first().click();
  await p.waitForTimeout(600);
  await demoBtn.click();
  await p.waitForTimeout(1800);

  const listItems = sheet.locator('ul > li');
  const count = await listItems.count();
  console.log('纸条数量：', count);

  const firstText = await listItems.first().innerText();
  console.log('第一张纸条的可见文字：', JSON.stringify(firstText));

  const demoSeed = await p.evaluate(() => {
    const raw = window.localStorage.getItem('moodbox:demo-title');
    return raw;
  });
  console.log('（参考）localStorage 里的 demo 标记：', demoSeed);

  await p.screenshot({ path: `${OUT}/jar-list.png` });

  // 整行可点：点第一张纸条正文的某一处（不是铅笔按钮）
  const body = listItems.first().locator('span.line-clamp-2').first();
  await body.click({ position: { x: 24, y: 8 } });
  await p.waitForTimeout(900);

  // Dialog 有 role="dialog" 但外层 sheet 也是；用「最上层」判断：数一下弹窗个数，
  // 并把详情弹窗的可见性单独问一遍。
  const visibleDialogs = await p.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
      })
      .map((el) => el.textContent.slice(0, 80)),
  );
  console.log('可见弹窗：', JSON.stringify(visibleDialogs, null, 2));
  const editVisible = await p.getByRole('button', { name: '保存修改' }).count();
  console.log('是否误开编辑表单（应为 0）：', editVisible);
  const savingVisible = await p.getByText('保存修改').count();
  console.log('（辅助）保存修改文案出现次数：', savingVisible);
  await p.screenshot({ path: `${OUT}/jar-detail.png` });

  await context.close();
}

/* ---------- 4. 新建一张纸条，确认存的标题是空串 ---------- */
{
  const { p, context } = await openPage('/');
  await p.getByRole('button', { name: /开心罐/ }).first().click();
  const sheet = p.getByRole('dialog').first();
  await sheet.waitFor({ state: 'visible' });
  await sheet.getByRole('button', { name: '收藏一份快乐' }).click();
  await p.waitForTimeout(500);
  const form = p.getByRole('dialog').last();
  await form.locator('textarea').fill('测试一下：新建的纸条不该再有标题。');
  await form.getByRole('button', { name: '收进盒子' }).click();
  await p.waitForTimeout(1200);

  const stored = await p.evaluate(async () => {
    const dbs = await indexedDB.databases();
    return dbs.map((db) => db.name);
  });
  console.log('数据库：', stored);
  await p.screenshot({ path: `${OUT}/jar-new.png` });
  await context.close();
}

console.log('控制台错误：', errors.length === 0 ? '无' : errors);
await browser.close();
