/**
 * 把一张 4×4 的 MBTI 信息图切成 16 张人物插画（webp），并生成整图。
 *
 * 用法：
 *   node scripts/mbti-slice.mjs ./mbti-source.png
 *   node scripts/mbti-slice.mjs ./mbti-source.png --inset 12 --size 480
 *
 * - 按行优先切成 4×4，顺序与 src/data/mbti.json 一致：
 *   INTJ INTP ENTJ ENTP / ISTJ ISFJ ESTJ ESFJ / INFJ INFP ENFJ ENFP / ISTP ISFP ESTP ESFP
 * - `--inset` 用来切掉每格四周的描边或说明文字（像素）
 * - 原图同时转成 public/mbti/mbti-all.webp，供「查看完整图」灯箱使用
 *
 * 换图之后不用改代码：文件路径就是 src/data/mbti.json 里的 image 字段。
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const source = args.find((arg) => !arg.startsWith('--'));
if (!source) {
  console.error('缺少源图片：node scripts/mbti-slice.mjs <4x4 信息图>');
  process.exit(1);
}

const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  const value = index === -1 ? undefined : args[index + 1];
  return value === undefined ? fallback : Number(value);
};

const INSET = flag('inset', 0);
const SIZE = flag('size', 480);
const OUT = path.resolve('public/mbti');

const CODES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

await mkdir(OUT, { recursive: true });

const image = sharp(source);
const { width = 0, height = 0 } = await image.metadata();
if (!width || !height) {
  console.error('读不到图片尺寸，换一张试试');
  process.exit(1);
}

const cellW = Math.floor(width / 4);
const cellH = Math.floor(height / 4);
const tileW = cellW - INSET * 2;
const tileH = cellH - INSET * 2;

for (const [index, code] of CODES.entries()) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  await sharp(source)
    .extract({ left: col * cellW + INSET, top: row * cellH + INSET, width: tileW, height: tileH })
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 86 })
    .toFile(path.join(OUT, `${code.toLowerCase()}.webp`));
}

await sharp(source)
  .resize({ width: 1600, withoutEnlargement: true })
  .webp({ quality: 84 })
  .toFile(path.join(OUT, 'mbti-all.webp'));

console.log(`已切出 16 张（${tileW}×${tileH} → ${SIZE}×${SIZE}）并生成 mbti-all.webp`);
