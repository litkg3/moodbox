/**
 * 把用户给的 16 张 MBTI 插画（白底 PNG）处理成卡片能用的圆形头像，并拼一张整图。
 *
 * 用法：
 *   node scripts/mbti-import.mjs <解压后的目录>
 *
 * 为什么要处理，而不是直接 cp：
 *
 * 1. 白底。原始插画是纯白背景（400×400，无透明通道）。卡片上的头像是
 *    圆形裁切 + 浅紫底，白底直接放进去会变成一个刺眼的白色圆盘，
 *    和卡片本身的 --mbti-soft 渐变打架。这里按「离纯白多远」做 alpha，
 *    浅色（脸、白大褂）因为也接近白，用阈值 + 主色保留的处理保住。
 *
 * 2. 构图。原图里人物顶天立地（多数 bbox 高度 = 100%），圆形裁切会切掉
 *    脚和头。这里按人物包围盒居中、留 8% 安全边，让全身完整落进圆里。
 *
 * 3. 整图。这套素材没有配套的 4×4 信息图，用同样这 16 张拼一张，
 *    每格底下写代号与中文名，替换 public/mbti/mbti-all.webp。
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!source) {
  console.error('缺少源目录：node scripts/mbti-import.mjs <16 张 png 所在目录>');
  process.exit(1);
}

const OUT = path.resolve('public/mbti');
/** 卡片里用的是 480×480 的方形图（与原来的 vol. 一致），保留同尺寸 */
const SIZE = 480;
/** 人物包围盒之外再留的边（占正方形边长的比例） */
const PADDING = 0.06;
/** 比这个更接近纯白的像素直接当背景抠掉 */

const TYPES = JSON.parse(await readFile(path.resolve('src/data/mbti.json'), 'utf8'));

/**
 * 白底 → 透明。
 *
 * 只处理「和画布边缘连通的纯白」。不能简单地按亮度阈值抠：
 * 这套插画里人物穿着白大褂、白衬衫，脸也是浅色（#f6e8da 这种），
 * 一刀切会把衣服和脸一起抠掉，露出底板的淡紫色方块。
 *
 * 所以先看连通性 —— 从四条边往里灌，只有和边缘连上的白才是背景。
 * 人物内部被线条围住的白（衣领、白眼白）灌不到，原样保留。
 * 边缘再用一点容差（>= 250）吃掉抗锯齿产生的近白边，避免白边。
 */
function whiteToAlpha(data, width, height) {
  const total = width * height;
  const isWhite = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    isWhite[i] = r >= 250 && g >= 250 && b >= 250 ? 1 : 0;
  }

  const isBg = new Uint8Array(total);
  const stack = [];
  for (let x = 0; x < width; x += 1) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push(y * width, y * width + width - 1);
  }
  while (stack.length > 0) {
    const index = stack.pop();
    if (index === undefined) continue;
    if (isBg[index] || !isWhite[index]) continue;
    isBg[index] = 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }

  const out = Buffer.alloc(total * 4);
  for (let i = 0; i < total; i += 1) {
    const a = isBg[i] ? 0 : 255;
    out[i * 4] = data[i * 4];
    out[i * 4 + 1] = data[i * 4 + 1];
    out[i * 4 + 2] = data[i * 4 + 2];
    out[i * 4 + 3] = a;
  }
  return out;
}

/** 把透明图按内容居中收紧到正方形，四周留 PADDING。 */
async function normalize(buffer) {
  const trimmed = await sharp(buffer).trim({ threshold: 1 }).toBuffer();
  const { width = SIZE, height = SIZE } = await sharp(trimmed).metadata();
  const inner = Math.round(SIZE * (1 - PADDING * 2));
  const scale = Math.min(inner / width, inner / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const fitted = await sharp(trimmed).resize(w, h, { fit: 'contain', kernel: 'lanczos3' }).toBuffer();

  return sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fitted, left: Math.round((SIZE - w) / 2), top: Math.round((SIZE - h) / 2) }])
    .png()
    .toBuffer();
}

await mkdir(OUT, { recursive: true });

const tiles = new Map();

for (const type of TYPES) {
  const code = type.code.toLowerCase();
  const file = path.join(source, `${code}.png`);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = whiteToAlpha(data, info.width, info.height);
  const withAlpha = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
  const normalized = await normalize(withAlpha);
  tiles.set(type.code, normalized);
  await sharp(normalized).webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(OUT, `${code}.webp`));
  console.log(`✓ ${type.code} → ${code}.webp`);
}

/* ---------------- 整图：4 行 4 列，每格带代号与中文名 ---------------- */

const COLS = 4;
const CELL = 400;
const GAP = 24;
const LABEL = 54;
const MARGIN = 48;
const W = MARGIN * 2 + COLS * CELL + (COLS - 1) * GAP;
const ROWS = Math.ceil(TYPES.length / COLS);
const H = MARGIN * 2 + ROWS * (CELL + LABEL) + (ROWS - 1) * GAP;

const ACCENT = {
  紫粉: '#7b5ea7',
  蓝青: '#3f6f92',
  绿: '#4a7f5c',
  橙黄: '#a8703a',
};

const parts = [];
const overlays = [];
TYPES.forEach((type, index) => {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = MARGIN + col * (CELL + GAP);
  const y = MARGIN + row * (CELL + LABEL + GAP);
  const tint = ACCENT[type.group] ?? '#5c5470';

  /*
   * 底板与文字交给 SVG，插画单独 composite 叠上去。
   *
   * 不能把 PNG 塞进 SVG 的 <image href="data:…"> —— 那条路径下 sharp
   * 会把透明区域当灰底渲染，每格后面露出一圈浅灰色方块。
   */
  parts.push(
    `<text x="${x + CELL / 2}" y="${y + CELL + 26}" text-anchor="middle" font-family="PingFang SC, Noto Sans SC, sans-serif" font-size="26" font-weight="600" fill="${tint}">${type.code}</text>`,
    `<text x="${x + CELL / 2}" y="${y + CELL + 48}" text-anchor="middle" font-family="PingFang SC, Noto Sans SC, sans-serif" font-size="19" fill="#6b6478">${type.name}</text>`,
  );

  overlays.push({ code: type.code, tint, x, y });
});

/*
 * 每格的底板由 SVG 画（圆角 + 淡色），插画作为独立图层贴上去。
 *
 * 关键：SVG 光栅化结果是**不透明**的，先把底图 flatten 成 RGB 再 composite，
 * 就不会出现「透明像素被填灰」的问题；插画本身保持 alpha，直接叠上去
 * 才能让淡色底板透出来。踩过的两个坑：把 PNG 塞进 SVG 的 <image>，
 * 以及先 flatten 到白色 —— 前者露灰块，后者露白块。
 */
const tiles2 = await Promise.all(
  overlays.map(async ({ code, x, y }) => {
    const inner = CELL - 48;
    const art = await sharp(tiles.get(code))
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return { input: art, left: x + 24, top: y + 16 };
  }),
);

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#faf7fd"/>
  ${overlays
    .map(
      ({ tint, x, y }) =>
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="30" fill="${tint}" fill-opacity="0.07"/>`,
    )
    .join('\n  ')}
  ${parts.join('\n  ')}
</svg>`;

const board = await sharp(Buffer.from(svg)).flatten({ background: '#faf7fd' }).png().toBuffer();

await sharp(board).composite(tiles2).webp({ quality: 86 }).toFile(path.join(OUT, 'mbti-all.webp'));
console.log(`✓ mbti-all.webp（${W}×${H}）`);
/*
 * 灯箱拿 MBTI_SHEET 的宽高算拖动边界，尺寸对不上就拖不到图片右半边。
 * 这里直接把该写什么打出来，省得换图的人去量。
 */
console.log(`\n请确认 src/data/mbti.ts 里：`);
console.log(`  export const MBTI_SHEET = { src: '/mbti/mbti-all.webp', width: ${W}, height: ${H} } as const;`);
console.log('完成。');
