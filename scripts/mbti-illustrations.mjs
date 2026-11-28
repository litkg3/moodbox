/**
 * 生成 MBTI 十六型的人物插画（480×480 webp）+ 4×4 整图（mbti-all.webp）。
 *
 * ⚠️ 已经不是线上在用的那套图了：2026-11 换成了外部提供的一套低多边形插画
 *    （白底 PNG 16 张），处理脚本见 `scripts/mbti-import.mjs`。
 *    留在这里是因为这套画法本身还可以复用 —— 想回到「脚本画、十六张
 *    同一套笔法」的时候，跑一遍就能覆盖回去。
 *
 * 为什么当初用脚本画而不是找图：十六张必须"同一套笔法"——同一张脸型、同一条
 * 描边粗细、同一组低饱和色。找来的图永远差一点；脚本生成的好处是改一个
 * 参数十六张一起变，权重也和站内的毛玻璃色盘对得上。
 *
 * 运行：node scripts/mbti-illustrations.mjs
 * 产物：public/mbti/*.webp、public/mbti/mbti-all.webp
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('public/mbti');

/** 四组的色系，和 globals.css 里的 --mbti-* 保持一致（画里只取浅色，别抢卡片）。 */
const GROUPS = {
  紫粉: { soft: '#efe3f8', soft2: '#f8e7ef', accent: '#7c5aa6', tint: '#d8c4ee' },
  蓝青: { soft: '#e2eef6', soft2: '#e6f2f2', accent: '#4e7d9c', tint: '#bcd8e8' },
  绿: { soft: '#e3f0e2', soft2: '#eef5e6', accent: '#4f7f61', tint: '#c2dfc6' },
  橙黄: { soft: '#f9ecd9', soft2: '#fbe9e0', accent: '#a9743a', tint: '#f0d3ab' },
};

/**
 * 16 个人。hair / outfit / acc 是三种可组合的"零件"，skin 与发色错开，
 * 让十六张摆在一起像同一本画册里的十六页，而不是十六个画师画的。
 */
const PEOPLE = [
  { code: 'INTJ', name: '建筑师', group: '紫粉', hair: 'slick', hairColor: '#2f2a3a', skin: '#f3d9c4', outfit: 'turtleneck', outfitColor: '#4b4568', acc: 'glasses' },
  { code: 'INTP', name: '逻辑学家', group: '紫粉', hair: 'messy', hairColor: '#483a33', skin: '#eed2b9', outfit: 'hoodie', outfitColor: '#6b6480', acc: 'glasses' },
  { code: 'ENTJ', name: '指挥官', group: '紫粉', hair: 'side', hairColor: '#241f2c', skin: '#eccdb3', outfit: 'blazer', outfitColor: '#5a4a6e', acc: 'tie' },
  { code: 'ENTP', name: '辩论家', group: '紫粉', hair: 'wavy', hairColor: '#5a4636', skin: '#f5ddc7', outfit: 'shirt', outfitColor: '#7d6a94', acc: 'none' },

  { code: 'ISTJ', name: '物流师', group: '蓝青', hair: 'buzz', hairColor: '#2b2b31', skin: '#e8c6aa', outfit: 'shirt', outfitColor: '#3f6a86', acc: 'tie' },
  { code: 'ISFJ', name: '守卫者', group: '蓝青', hair: 'bun', hairColor: '#4b3a2f', skin: '#f4dbc4', outfit: 'cardigan', outfitColor: '#5c8095', acc: 'none' },
  { code: 'ESTJ', name: '总经理', group: '蓝青', hair: 'side', hairColor: '#3a2f28', skin: '#e5c1a4', outfit: 'blazer', outfitColor: '#33586f', acc: 'tie' },
  { code: 'ESFJ', name: '执政官', group: '蓝青', hair: 'bob', hairColor: '#5a3f2e', skin: '#f6dfc9', outfit: 'sweater', outfitColor: '#6f8fa4', acc: 'earrings' },

  { code: 'INFJ', name: '提倡者', group: '绿', hair: 'long', hairColor: '#3a2d3f', skin: '#f2d6bd', outfit: 'coat', outfitColor: '#4f7f61', acc: 'scarf' },
  { code: 'INFP', name: '调停者', group: '绿', hair: 'curly', hairColor: '#6a4a35', skin: '#eed3b8', outfit: 'hoodie', outfitColor: '#6f9d7c', acc: 'none' },
  { code: 'ENFJ', name: '主人公', group: '绿', hair: 'ponytail', hairColor: '#3f2e26', skin: '#e6c3a6', outfit: 'blazer', outfitColor: '#4a7a5d', acc: 'earrings' },
  { code: 'ENFP', name: '竞选者', group: '绿', hair: 'wavy', hairColor: '#7a4a2c', skin: '#f7e0c8', outfit: 'tee', outfitColor: '#7aa886', acc: 'none' },

  { code: 'ISTP', name: '鉴赏家', group: '橙黄', hair: 'wavy', hairColor: '#312a26', skin: '#e2bc9c', outfit: 'jacket', outfitColor: '#a9743a', acc: 'none' },
  { code: 'ISFP', name: '探险家', group: '橙黄', hair: 'bob', hairColor: '#5b3a2b', skin: '#f4d9bd', outfit: 'tee', outfitColor: '#c08a4e', acc: 'earrings' },
  { code: 'ESTP', name: '企业家', group: '橙黄', hair: 'messy', hairColor: '#2a2320', skin: '#dfb695', outfit: 'jacket', outfitColor: '#b07a3a', acc: 'none' },
  { code: 'ESFP', name: '表演者', group: '橙黄', hair: 'curly', hairColor: '#6b4326', skin: '#f8e2ca', outfit: 'shirt', outfitColor: '#c78a4a', acc: 'earrings' },
];

const INK = '#3a3040';

/** 头发：先画"后层"（长度、马尾在脑后），再画脸，最后画"前层"（刘海）。 */
function hairBack(style, color) {
  switch (style) {
    case 'long':
      return `<path d="M138 168c-6 74 4 116 10 146 16 10 92 10 108 0 6-30 16-72 10-146Z" fill="${color}"/>`;
    case 'bob':
      return `<path d="M136 166c0 58 6 84 14 96 14 8 86 8 100 0 8-12 14-38 14-96Z" fill="${color}"/>`;
    case 'wavy':
      return `<path d="M134 172c-8 62 2 96 12 112 14 8 94 8 108 0 10-16 20-50 12-112Z" fill="${color}"/>`;
    case 'curly':
      return `<g fill="${color}"><circle cx="144" cy="150" r="26"/><circle cx="136" cy="184" r="22"/><circle cx="256" cy="150" r="26"/><circle cx="264" cy="184" r="22"/></g>`;
    case 'ponytail':
      return `<path d="M150 140c-26 30-28 82-14 112 10-28 14-56 14-84Z" fill="${color}"/><circle cx="284" cy="212" r="26" fill="${color}"/><path d="M276 236c10 8 14 22 10 34-12-6-18-18-18-30Z" fill="${color}"/>`;
    default:
      return '';
  }
}

function hairFront(style, color) {
  const cap = `<path d="M142 160c0-38 26-62 58-62s58 24 58 62c-8-18-20-28-34-32-14 12-34 18-58 16-10 4-18 10-24 16Z" fill="${color}"/>`;
  switch (style) {
    case 'slick':
      return `<path d="M142 162c0-38 26-62 58-62 34 0 56 24 58 60-14-16-30-26-52-28-24-2-44 8-56 26Z" fill="${color}"/>`;
    case 'messy':
      return `<path d="M141 160c0-38 27-62 59-62 33 0 57 24 59 62-10-8-18-12-26-14 2-10-4-16-12-10-8-14-22-18-32-8-12-4-22 2-26 14-10 2-16 8-22 18Z" fill="${color}"/>`;
    case 'side':
      return `<path d="M142 160c0-38 26-62 58-62 34 0 56 24 58 60-16-8-34-14-56-12-24 2-44 8-60 14Z" fill="${color}"/><path d="M196 100c22-4 46 6 56 22-18-8-38-10-56-6Z" fill="#ffffff" opacity="0.14"/>`;
    case 'bob':
      return `${cap}<path d="M140 158c2 22 8 34 16 40-4-22-4-38 0-50Z" fill="${color}"/>`;
    case 'bun':
      return `${cap}<circle cx="200" cy="88" r="20" fill="${color}"/>`;
    case 'ponytail':
      return `${cap}<path d="M150 150c8-8 18-12 26-12-10 10-16 22-18 34Z" fill="${color}"/>`;
    case 'curly':
      return `<g fill="${color}"><circle cx="200" cy="96" r="34"/><circle cx="164" cy="112" r="26"/><circle cx="236" cy="112" r="26"/><circle cx="150" cy="142" r="20"/><circle cx="250" cy="142" r="20"/></g>`;
    case 'wavy':
      return `${cap}<path d="M154 96c14-14 34-20 52-18-16 6-30 16-38 30Z" fill="#ffffff" opacity="0.12"/>`;
    case 'buzz':
      return `<path d="M142 162c0-38 26-62 58-62s58 24 58 62c-12-22-32-34-58-34s-46 12-58 34Z" fill="${color}" opacity="0.92"/>`;
    default:
      return cap;
  }
}

/** 衣服：领口决定"这个人穿什么"，比整件衣服的色块更能说明性格。 */
function outfit(style, color) {
  const body = `<path d="M56 400c4-66 52-104 144-104s140 38 144 104Z" fill="${color}"/>`;
  const shade = `<path d="M56 400c4-66 52-104 144-104 22 0 42 3 60 9-86 10-140 44-148 95Z" fill="#ffffff" opacity="0.08"/>`;
  let detail = '';
  switch (style) {
    case 'turtleneck':
      detail = `<path d="M170 292h60v26c0 12-12 20-30 20s-30-8-30-20Z" fill="${color}"/><path d="M170 300h60" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>`;
      break;
    case 'shirt':
      detail = `<path d="M200 300l-32 14 32 22 32-22Z" fill="#ffffff" opacity="0.9"/><path d="M200 336v26" stroke="${color}" stroke-width="3" opacity="0.5"/>`;
      break;
    case 'blazer':
      detail = `<path d="M200 300l-48 22 18 78h30Z" fill="#ffffff" opacity="0.92"/><path d="M200 300l48 22-18 78h-30Z" fill="#ffffff" opacity="0.92"/><path d="M200 300v100" stroke="${color}" stroke-width="2" opacity="0.35"/>`;
      break;
    case 'hoodie':
      detail = `<path d="M158 300c10 20 26 30 42 30s32-10 42-30c-12-10-26-14-42-14s-30 4-42 14Z" fill="#ffffff" opacity="0.16"/><path d="M186 330v34M214 330v34" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round"/>`;
      break;
    case 'cardigan':
      detail = `<path d="M200 296v104" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3"/><path d="M176 302l24 20 24-20" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/>`;
      break;
    case 'sweater':
      detail = `<path d="M152 332c16 10 32 14 48 14s32-4 48-14" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="3"/><path d="M152 356c16 10 32 14 48 14s32-4 48-14" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="3"/>`;
      break;
    case 'coat':
      detail = `<path d="M200 300l-44 16v84h32l12-56 12 56h32v-84Z" fill="#ffffff" opacity="0.9"/><circle cx="214" cy="352" r="3" fill="${color}"/><circle cx="214" cy="376" r="3" fill="${color}"/>`;
      break;
    case 'jacket':
      detail = `<path d="M200 300l-46 20v80h34l12-60 12 60h34v-80Z" fill="#ffffff" opacity="0.88"/><path d="M168 330h-10M242 330h10" stroke="#ffffff" stroke-opacity="0.6" stroke-width="2"/>`;
      break;
    default:
      detail = `<path d="M164 302c12 14 24 20 36 20s24-6 36-20" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>`;
  }
  return body + shade + detail;
}

function accessory(acc, group) {
  switch (acc) {
    case 'glasses':
      return `<g fill="none" stroke="${INK}" stroke-opacity="0.72" stroke-width="3"><rect x="158" y="154" width="36" height="28" rx="12"/><rect x="206" y="154" width="36" height="28" rx="12"/><path d="M194 166h12"/></g>`;
    case 'earrings':
      return `<circle cx="138" cy="196" r="5" fill="${GROUPS[group].accent}" opacity="0.85"/><circle cx="262" cy="196" r="5" fill="${GROUPS[group].accent}" opacity="0.85"/>`;
    case 'scarf':
      return `<path d="M158 288c14 14 28 20 42 20s28-6 42-20c-6 22-22 34-42 34s-36-12-42-34Z" fill="${GROUPS[group].accent}" opacity="0.55"/><path d="M214 320l10 34-16-4Z" fill="${GROUPS[group].accent}" opacity="0.45"/>`;
    case 'tie':
      return `<path d="M200 316l-10 12 10 42 10-42Z" fill="${GROUPS[group].accent}" opacity="0.7"/>`;
    default:
      return '';
  }
}

function portrait(person, index) {
  const group = GROUPS[person.group];
  const { skin } = person;
  const shadow = 'rgba(58,48,64,0.10)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <radialGradient id="bg${index}" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="${group.soft}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${group.soft2}" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="196" r="168" fill="url(#bg${index})"/>
  <circle cx="318" cy="96" r="34" fill="${group.tint}" opacity="0.5"/>
  <circle cx="82" cy="302" r="18" fill="${group.tint}" opacity="0.42"/>
  <ellipse cx="200" cy="398" rx="126" ry="10" fill="${shadow}" opacity="0.5"/>
  ${hairBack(person.hair, person.hairColor)}
  ${outfit(person.outfit, person.outfitColor)}
  <path d="M178 226h44v52h-44Z" fill="${skin}"/>
  <path d="M178 226h44v16c-8 8-36 8-44 0Z" fill="#000000" opacity="0.06"/>
  <ellipse cx="200" cy="176" rx="60" ry="66" fill="${skin}"/>
  <ellipse cx="140" cy="182" rx="9" ry="12" fill="${skin}"/>
  <ellipse cx="260" cy="182" rx="9" ry="12" fill="${skin}"/>
  ${hairFront(person.hair, person.hairColor)}
  <g fill="${INK}">
    <ellipse cx="180" cy="178" rx="4.2" ry="5" opacity="0.86"/>
    <ellipse cx="220" cy="178" rx="4.2" ry="5" opacity="0.86"/>
  </g>
  <g fill="none" stroke="${INK}" stroke-opacity="0.5" stroke-width="2.4" stroke-linecap="round">
    <path d="M170 162c6-5 14-5 20 0"/>
    <path d="M210 162c6-5 14-5 20 0"/>
  </g>
  <path d="M190 204c4 6 16 6 20 0" fill="none" stroke="${INK}" stroke-opacity="0.55" stroke-width="2.8" stroke-linecap="round"/>
  <ellipse cx="166" cy="196" rx="12" ry="6" fill="#e08f96" opacity="0.28"/>
  <ellipse cx="234" cy="196" rx="12" ry="6" fill="#e08f96" opacity="0.28"/>
  ${accessory(person.acc, person.group)}
</svg>`;
}

await mkdir(OUT, { recursive: true });

const files = [];
for (const [index, person] of PEOPLE.entries()) {
  const svg = portrait(person, index);
  const file = path.join(OUT, `${person.code.toLowerCase()}.webp`);
  await sharp(Buffer.from(svg)).resize(480, 480).webp({ quality: 84 }).toFile(file);
  files.push(file);
}

/* ---------- 整图：4×4 一页海报，灯箱里就是"完整图" ---------- */

const rows = [0, 1, 2, 3].map((r) =>
  PEOPLE.slice(r * 4, r * 4 + 4)
    .map(
      (person) => `<figure>
        <div class="art"><img src="data:image/webp;base64,__${person.code}__" alt=""/></div>
        <figcaption><b style="color:${GROUPS[person.group].accent}">${person.code}</b><span>${person.name}</span></figcaption>
      </figure>`,
    )
    .join(''),
);

const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1600px;height:2000px;padding:92px 96px;background:#fbf7f3;font-family:'Noto Sans CJK SC','Noto Sans SC',sans-serif;color:#332c3c}
  h1{font-size:52px;font-weight:300;letter-spacing:.14em}
  p.sub{margin-top:14px;font-size:19px;letter-spacing:.2em;color:#746c80}
  .grid{margin-top:44px;display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
  figure{background:rgba(255,255,255,.66);border:1px solid rgba(255,255,255,.9);border-radius:22px;padding:14px 14px 16px;break-inside:avoid}
  .art{aspect-ratio:1;border-radius:14px;overflow:hidden;background:#fff}
  .art img{display:block;width:100%;height:100%;object-fit:cover}
  figcaption{display:flex;align-items:baseline;gap:8px;margin-top:10px}
  figcaption b{font-size:22px;letter-spacing:.06em}
  figcaption span{font-size:13px;color:#564e60}
  footer{position:absolute;left:96px;bottom:44px;font-size:13px;letter-spacing:.16em;color:#968fa1}
</style></head><body>
  <h1>MBTI 十六种人格类型</h1>
  <p class="sub">从人格类型中认识自我，调节自我情绪</p>
  <div class="grid">${rows.join('')}</div>
  <footer>MoodBox · 仅供自我探索参考</footer>
</body></html>`;

/* 图片以 base64 内联，playwright 截屏时不必等网络 */
const withImages = await Promise.all(
  PEOPLE.map(async (person) => {
    const b64 = (await sharp(files[PEOPLE.indexOf(person)]).resize(420, 420).webp({ quality: 80 }).toBuffer()).toString('base64');
    return [person.code, b64];
  }),
);
let html = sheet;
for (const [code, b64] of withImages) html = html.replace(`__${code}__`, b64);

const { chromium } = await import('playwright');
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 2000 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: path.join(OUT, 'mbti-all.png') });
await browser.close();

await sharp(path.join(OUT, 'mbti-all.png'))
  .resize(1600, 2000)
  .webp({ quality: 82 })
  .toFile(path.join(OUT, 'mbti-all.webp'));

await sharp(path.join(OUT, 'mbti-all.webp')).toFile(path.join(OUT, 'mbti-all.preview.png'));

console.log(`done: ${PEOPLE.length} tiles + mbti-all.webp`);
