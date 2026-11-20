import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const OUT = '/workspace/screenshots/r14';
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

async function open() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const p = await context.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
  });
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await p.goto(`${BASE}/square`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForSelector('html[data-hydrated="true"]');
  // 本机模式：不连 Supabase
  await p.evaluate(() => window.localStorage.setItem('moodbox-force-local', '1'));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('html[data-hydrated="true"]');
  await p.waitForTimeout(1200);
  return p;
}

const ledger = (p) =>
  p.evaluate(() => {
    const raw = window.localStorage.getItem('moodbox:square-ledger:v1');
    return raw ? JSON.parse(raw) : {};
  });
const savedNickname = (p) => p.evaluate(() => window.localStorage.getItem('moodbox:square-nickname:v1'));

const p = await open();

async function compose(content, nickname) {
  await p.getByRole('button', { name: '写一条' }).click();
  const dialog = p.getByRole('dialog', { name: '写一条' });
  await dialog.waitFor({ state: 'visible' });
  const input = dialog.getByPlaceholder(/匿名|^.+·/).first();
  if (nickname !== undefined) await dialog.locator('input').first().fill(nickname);
  await dialog.getByPlaceholder('今天发生了什么？不用说得很完整。').fill(content);
  await dialog.getByRole('button', { name: '发出去' }).click();
  await p.waitForTimeout(600);
}

/* 1. 发帖时顺手改名字 → 必须扣一次 */
await compose('第一次：发帖时顺手改名 测试帖', '小鱼');
const after1 = await ledger(p);
const nick1 = await savedNickname(p);
const names1 = Object.values(after1).flatMap((row) => Object.values(row).map((e) => e.renames ?? 0));
console.log('发帖改名后 → 记住的昵称:', nick1, '| renames:', names1);
await p.screenshot({ path: `${OUT}/after-compose-rename.png` });

/* 2. 同样的名字再发一条 → 不该再扣 */
await compose('第二次：名字没变 再发一条', '小鱼');
const after2 = await ledger(p);
const names2 = Object.values(after2).flatMap((row) => Object.values(row).map((e) => e.renames ?? 0));
console.log('同名再发一条 → renames:', names2);

/* 3. 回复一条 → 作者名应该是「小鱼」而不是匿名 */
const post = p.locator('article', { hasText: '第二次：名字没变 再发一条' }).first();
await post.getByRole('button', { name: /回复/ }).first().click();
await post.getByLabel('回复内容').fill('回复一下，看看署名。');
await post.getByRole('button', { name: '发送' }).click();
await p.waitForTimeout(800);
const postText = await post.innerText();
console.log('回复后的帖子文本 →', JSON.stringify(postText.replace(/\s+/g, ' ').slice(0, 160)));
await p.screenshot({ path: `${OUT}/reply-with-nickname.png` });

/* 4. 再用发帖弹窗改一次名 → 第二次，仍可用；第三次应被拒、且不落盘 */
await p.getByRole('button', { name: '修改昵称' }).click();
const renameDialog = p.getByRole('dialog', { name: '改个昵称' });
await renameDialog.waitFor({ state: 'visible' });
await renameDialog.locator('input').fill('小雨');
await renameDialog.getByRole('button', { name: '记住这个昵称' }).click();
await p.waitForTimeout(500);
console.log('弹窗改第二次 → 记住的昵称:', await savedNickname(p));
await compose('第四次：第三次改名，应该被拒', '小周');
const nick4 = await savedNickname(p);
console.log('第三次改名被拒 → 记住的昵称仍为:', nick4);
const last = await p.locator('article').first().innerText();
console.log('被拒后那条帖子署名 →', JSON.stringify(last.replace(/\s+/g, ' ').slice(0, 80)));
await p.screenshot({ path: `${OUT}/rename-rejected.png` });

/* 5. 弹窗「改个昵称」也走同一条路：用完了就开不出来 */
await p.getByRole('button', { name: '修改昵称' }).click();
await p.waitForTimeout(500);
const renameDialogVisible = await p.getByRole('dialog', { name: '改个昵称' }).count();
console.log('次数用完后点「修改昵称」→ 弹窗数:', renameDialogVisible);
await p.screenshot({ path: `${OUT}/rename-exhausted.png` });

await browser.close();
console.log('console errors:', errors.length ? errors : 'none');
