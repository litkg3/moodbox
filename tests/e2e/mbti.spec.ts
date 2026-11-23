import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

/** 打开首页并等 React 接管，避免"点了但脚本还没接上"的假失败 */
async function openHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 45_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(2200);
}

/** 直接落到第几屏（不走 smooth，测试里不需要看滚动过程） */
async function goToScreen(page: Page, id: string) {
  await page.evaluate((target) => {
    const el = document.getElementById(target);
    if (el) window.scrollTo({ top: el.offsetTop, behavior: 'instant' });
  }, id);
  await page.waitForTimeout(700);
}

/**
 * 在页面里量"文字 vs 它实际压着的底色"的对比度。
 *
 * 为什么不用 CSS 里声明的颜色相除：卡片是半透明毛玻璃，背后还有一层渐变，
 * 真正决定可读性的是合成之后的像素。所以这里读屏幕上的像素：
 * 文字颜色用 computed color（毛玻璃不会改文字色），底色取卡片内一块空白处的
 * 实际像素 —— 也就是用户眼睛看到的那个底。
 */
async function cardContrast(page: Page, cardSelector: string, textSelector: string) {
  const box = await page.locator(cardSelector).first().boundingBox();
  if (!box) return 0;

  const buffer = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    scale: 'css',
  });
  // 解码成裸 RGB，省掉 pngjs 这个只为测试存在的依赖
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  // 底色采样点：卡片左下与下沿中点的留白（插画在右上角，避开它）
  const sampleAt = (fx: number, fy: number) => {
    const x = Math.min(info.width - 1, Math.round(info.width * fx));
    const y = Math.min(info.height - 1, Math.round(info.height * fy));
    const i = (info.width * y + x) * info.channels;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const surfaces = [sampleAt(0.5, 0.93), sampleAt(0.5, 0.6), sampleAt(0.08, 0.5)];
  const worstBg = surfaces.reduce((darkest, rgb) =>
    luminance(rgb) < luminance(darkest) ? rgb : darkest,
  );

  const color = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    return node ? getComputedStyle(node).color : 'rgb(0, 0, 0)';
  }, textSelector);

  return contrastRatio(parseRgb(color), worstBg);
}

/** 解析 rgb() / color(srgb …) 两种序列化（color-mix 会产出后者） */
function parseRgb(raw: string): [number, number, number] {
  const srgb = raw.match(/color\(srgb ([^)]+)\)/);
  if (srgb) {
    const parts = srgb[1]!.trim().split(/[\s/]+/).map(Number);
    return [parts[0]! * 255, parts[1]! * 255, parts[2]! * 255];
  }
  const nums = raw.match(/[\d.]+/g) ?? ['0', '0', '0'];
  return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
}

function luminance(rgb: number[]) {
  const channel = (value: number) => {
    const n = value / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);
}

function contrastRatio(a: number[], b: number[]) {
  const left = luminance(a);
  const right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

test('人格详解：十六张卡一屏铺满，四组配色，图片都是 webp', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  const cards = page.locator('.mb-mbti-card');
  await expect(cards).toHaveCount(16);

  // 标题与副标题
  await expect(page.getByRole('heading', { level: 2, name: /MBTI 十六种人格类型 详解/ })).toBeVisible();
  await expect(page.locator('.mb-mbti-sub')).toHaveText('认识自我 · 理解他人 · 成就更好的关系');

  // 一屏内：所有卡片都在视口里，且真的排成 4 列 4 行
  const layout = await page.evaluate(() => {
    const grid = document.querySelector('.mb-mbti-grid');
    if (!grid) return null;
    const style = getComputedStyle(grid);
    const boxes = Array.from(document.querySelectorAll('.mb-mbti-card')).map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left) };
    });
    return {
      columns: style.gridTemplateColumns.split(' ').length,
      rows: style.gridTemplateRows.split(' ').length,
      maxBottom: Math.max(...boxes.map((box) => box.bottom)),
      minTop: Math.min(...boxes.map((box) => box.top)),
      lefts: [...new Set(boxes.map((box) => box.left))].length,
      vh: window.innerHeight,
    };
  });
  expect(layout).toBeTruthy();
  expect(layout!.columns).toBe(4);
  expect(layout!.rows).toBe(4);
  expect(layout!.lefts).toBe(4);
  expect(layout!.minTop).toBeGreaterThan(0);
  expect(layout!.maxBottom).toBeLessThanOrEqual(layout!.vh);

  // 四组各一个色值
  const accents = await page.evaluate(() =>
    ['analyst', 'sentinel', 'diplomat', 'explorer'].map((token) => {
      const el = document.querySelector(`.mb-mbti-${token}`);
      return el ? getComputedStyle(el).getPropertyValue('--mbti-accent').trim() : '';
    }),
  );
  expect(new Set(accents).size).toBe(4);

  // 图片：webp、有宽高、alt 带代号与中文名
  const images = page.locator('.mb-mbti-art');
  await expect(images).toHaveCount(16);
  const metas = await images.evaluateAll((nodes) =>
    nodes.map((node) => ({
      src: node.getAttribute('src') ?? '',
      width: node.getAttribute('width'),
      height: node.getAttribute('height'),
      alt: node.getAttribute('alt') ?? '',
      loading: node.getAttribute('loading'),
    })),
  );
  for (const meta of metas) {
    expect(meta.src).toMatch(/^\/mbti\/[a-z]{4}\.webp$/);
    expect(meta.width).toBe('480');
    expect(meta.height).toBe('480');
    expect(meta.alt).toMatch(/^[EI][NS][TF][JP] /);
    expect(meta.loading).toBe('lazy');
  }

  // 小字声明
  await expect(page.locator('.mb-mbti-note')).toContainText('不具备心理评估或诊断功能');

  // 对比度：直接量卡片上的真实像素（毛玻璃合成之后），四组各测一张
  for (const token of ['analyst', 'sentinel', 'diplomat', 'explorer']) {
    const card = `.mb-mbti-${token}`;
    expect(await cardContrast(page, card, `${card} .mb-mbti-code`), `${token} 代号对比度`).toBeGreaterThan(4.5);
    expect(await cardContrast(page, card, `${card} .mb-mbti-desc`), `${token} 描述对比度`).toBeGreaterThan(4.5);
  }
  // 底部声明压在页面奶油底上
  expect(
    await page.evaluate(() => {
      const note = document.querySelector('.mb-mbti-note');
      return note ? getComputedStyle(note).color : '';
    }),
  ).toBeTruthy();
});

test('人格详解：点卡片开弹层，返回与 Esc 都能收起，焦点回到卡片', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  const card = page.getByRole('button', { name: /^INTJ 建筑师，查看完整介绍$/ });
  await card.click();

  const dialog = page.getByRole('dialog', { name: 'INTJ 建筑师' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('习惯先搭好全局的框架');

  await dialog.getByRole('button', { name: '返回' }).click();
  await expect(dialog).toBeHidden();
  // 关闭后焦点回到触发它的卡片，键盘用户可以接着往下走
  await expect(card).toBeFocused();

  await card.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('人格详解：整图灯箱可缩放、可保存、Esc 关闭', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  await page.getByRole('button', { name: '查看完整图' }).click();
  const lightbox = page.getByRole('dialog', { name: /全图/ });
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('img')).toHaveAttribute('src', '/mbti/mbti-all.webp');

  // 打开时页面锁滚，背景不会跟着乱跑
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

  await expect(lightbox.locator('.mb-lightbox-scale')).toHaveText('100%');
  await lightbox.getByRole('button', { name: '放大' }).click();
  await expect(lightbox.locator('.mb-lightbox-scale')).toHaveText('135%');
  await lightbox.getByRole('button', { name: '还原' }).click();
  await expect(lightbox.locator('.mb-lightbox-scale')).toHaveText('100%');

  // 保存：同源 webp，download 属性让浏览器直接存文件
  const save = lightbox.getByRole('link', { name: '保存整图' });
  await expect(save).toHaveAttribute('download', 'MBTI-十六种人格类型.webp');

  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
});

test('人格详解：手机端两列、屏内滚动，不会带动整页翻屏', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  const scroller = page.locator('.mb-mbti-scroll');
  const metrics = await scroller.evaluate((el) => {
    const cards = Array.from(el.querySelectorAll('.mb-mbti-card'));
    const grid = el.querySelector('.mb-mbti-grid')!;
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      width: grid.getBoundingClientRect().width,
      // 两列是否真的各占一半（而不是缩成内容宽贴在左边）
      firstRow: cards.slice(0, 2).map((card) => Math.round(card.getBoundingClientRect().width)),
      snapAlign: getComputedStyle(cards[0]!).scrollSnapAlign,
      // 非吸附方向、能滚动的容器，计算值里只有 'y'/'x'/'both'，'proximity' 不暴露
      scrollable: el.scrollHeight > el.clientHeight,
    };
  });
  expect(metrics.columns).toBe(2);
  expect(metrics.firstRow[0]).toBe(metrics.firstRow[1]);
  expect(metrics.width).toBeGreaterThan(metrics.clientWidth - 8);
  // 容器是可滚的，卡片声明了吸附对齐；能滚 + 有对齐点，才谈得上"靠近吸一下"
  expect(metrics.scrollable).toBe(true);
  expect(metrics.snapAlign).toBe('start');
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  const before = await page.evaluate(() => Math.round(window.scrollY));
  await scroller.evaluate((el) => el.scrollBy(0, 400));
  await page.waitForTimeout(600);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
  // 整页仍停在人格屏
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(before);
});

test('三种宽度都没有横向滚动条', async ({ page }) => {
  const sizes = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-hydrated="true"]', { timeout: 45_000 });
    await page.waitForTimeout(1400);

    for (const id of ['sky', 'wheel', 'mbti', 'square']) {
      await goToScreen(page, id);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const wide = Array.from(document.querySelectorAll<HTMLElement>('.mb-screen, .mb-mbti-grid, .mb-mbti-card'))
          .map((el) => el.scrollWidth - el.clientWidth)
          .reduce((max, value) => Math.max(max, value), 0);
        return { doc: doc.scrollWidth - doc.clientWidth, wide };
      });
      expect(overflow.doc, `${size.width}px / ${id} 出现横向滚动`).toBeLessThanOrEqual(0);
      expect(overflow.wide, `${size.width}px / ${id} 内部溢出`).toBeLessThanOrEqual(1);
    }
  }
});

test('减少动效：进场动画关掉，内容直接可见，吸附仍在', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  await goToScreen(page, 'mbti');
  const state = await page.evaluate(() => {
    const title = document.querySelector('.mb-mbti-title');
    const card = document.querySelector('.mb-mbti-card');
    return {
      opacity: getComputedStyle(title!).opacity,
      cardOpacity: getComputedStyle(card!).opacity,
      cardAnimation: getComputedStyle(card!).animationName,
      snap: getComputedStyle(document.documentElement).scrollSnapType,
    };
  });
  expect(state.opacity).toBe('1');
  expect(state.cardOpacity).toBe('1');
  expect(state.cardAnimation).toBe('none');
  expect(state.snap).toBe('y mandatory');
});
