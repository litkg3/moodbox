import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3107';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

async function zoomShot({ url, name, theme, selector, pad = 56 }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme === 'night' ? 'dark' : 'light',
  });
  const p = await context.newPage();
  await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForSelector('html[data-hydrated="true"]');
  await p.waitForTimeout(1600);

  const box = await p.locator(selector).first().boundingBox();
  if (!box) throw new Error(`没找到 ${selector}`);

  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(1440 - Math.max(0, box.x - pad), box.width + pad * 2),
    height: box.height + pad * 2,
  };
  await p.screenshot({ path: `.shots/${name}.png`, clip });
  console.log('·', name, JSON.stringify(clip));
  await context.close();
}

await zoomShot({
  url: '/letters',
  name: 'zoom-letters-day',
  theme: 'day',
  selector: 'text=信箱里还没有信。',
  pad: 40,
});

await zoomShot({
  url: '/calendar',
  name: 'zoom-calendar-night',
  theme: 'night',
  selector: 'button[aria-pressed="true"]',
  pad: 26,
});

await browser.close();
