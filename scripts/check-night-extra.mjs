import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const errors = [];
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

async function shotPage(url, name, theme) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme === 'night' ? 'dark' : 'light',
  });
  const p = await context.newPage();
  p.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${name}] ${msg.text()}`);
  });
  p.on('pageerror', (err) => errors.push(`[${name}] ${err.message}`));

  await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForSelector('html[data-hydrated="true"]');
  await p.waitForTimeout(1600);

  // 写入几条示例数据，让收藏馆与日历不是空状态
  if (url === '/memories' || url === '/calendar') {
    await p.evaluate(async () => {
      const open = () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('moodbox');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const db = await open();
      if (!db.objectStoreNames.contains('memories')) return;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const samples = [
        { title: '楼下咖啡店送我一块饼干', content: '明明没点，她说「今天烤多了」。', mood: 'warm' },
        { title: '把拖了两周的邮件回完了', content: '发出去那一刻，肩膀轻了一下。', mood: 'proud' },
        { title: '傍晚的云是橘色的', content: '站在路口看了三分钟。', mood: 'calm' },
      ];
      const tx = db.transaction('memories', 'readwrite');
      samples.forEach((item, i) => {
        tx.objectStore('memories').put({
          id: `probe-${i}`,
          title: item.title,
          content: item.content,
          mood: item.mood,
          date: today,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDemo: true,
        });
      });
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
      db.close();
    });
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('html[data-hydrated="true"]');
    await p.waitForTimeout(1600);
  }

  await p.screenshot({ path: `.shots/${name}.png`, fullPage: true });
  console.log('·', name);
  await context.close();
}

await shotPage('/memories', 'memories-night', 'night');
await shotPage('/memories', 'memories-day', 'day');
await shotPage('/calendar', 'calendar-night', 'night');
await shotPage('/about', 'about-night', 'night');

await browser.close();
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'errors: none');
