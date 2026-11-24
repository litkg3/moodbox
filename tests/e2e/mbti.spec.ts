import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

/** 打开首页并等 React 接管，避免"点了但脚本还没接上"的假失败 */
async function openHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 45_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(2200);
}

/** 直接落到第几屏（不走动画，测试里不需要看滚动过程） */
async function goToScreen(page: Page, id: string) {
  await page.evaluate((target) => {
    const el = document.getElementById(target);
    if (el) window.scrollTo({ top: el.offsetTop, behavior: 'instant' });
  }, id);
  await page.waitForTimeout(800);
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
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 底色采样点：卡片右下的留白（头像与文字都在左半边）
  const sampleAt = (fx: number, fy: number) => {
    const x = Math.min(info.width - 1, Math.round(info.width * fx));
    const y = Math.min(info.height - 1, Math.round(info.height * fy));
    const i = (info.width * y + x) * info.channels;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const surfaces = [sampleAt(0.92, 0.5), sampleAt(0.6, 0.92), sampleAt(0.5, 0.12)];
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

test('人格详解（桌面）：十六张卡一屏铺满，四组配色，卡片是头像+代号+中文名+标语', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  const cards = page.locator('.mb-mbti-grid-desktop .mb-mbti-card');
  await expect(cards).toHaveCount(16);

  // 标题与副标题（副标题是本轮改过的那句）
  await expect(page.getByRole('heading', { level: 2, name: /MBTI 十六种人格类型 详解/ })).toBeVisible();
  await expect(page.locator('.mb-mbti-sub')).toHaveText('从人格类型中认识自我，调节自我情绪');

  // 一屏内：4 列 4 行，全部落在视口里
  const layout = await page.evaluate(() => {
    const grid = document.querySelector('.mb-mbti-grid-desktop');
    if (!grid) return null;
    const boxes = Array.from(
      document.querySelectorAll('.mb-mbti-grid-desktop .mb-mbti-card'),
    ).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
      };
    });
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      rows: getComputedStyle(grid).gridTemplateRows.split(' ').length,
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

  // 四组各一个主色
  const accents = await page.evaluate(() =>
    ['analyst', 'sentinel', 'diplomat', 'explorer'].map((token) => {
      const el = document.querySelector(`.mb-mbti-${token}`);
      return el ? getComputedStyle(el).getPropertyValue('--mbti-accent').trim() : '';
    }),
  );
  expect(new Set(accents).size).toBe(4);

  // 每张卡：头像在文档流里、在代号上方，文字都不截断
  const geometry = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.mb-mbti-grid-desktop .mb-mbti-card')).map((card) => {
      const avatar = card.querySelector('.mb-mbti-avatar')!.getBoundingClientRect();
      const meta = card.querySelector('.mb-mbti-meta')!.getBoundingClientRect();
      const tagline = card.querySelector('.mb-mbti-tagline') as HTMLElement;
      return {
        // 桌面是横排（头像在左），这里只要两块矩形不相交
        apart:
          avatar.right <= meta.left + 1 || avatar.bottom <= meta.top + 1 || meta.right <= avatar.left + 1,
        taglineOverflow: tagline.scrollWidth - tagline.clientWidth,
        taglineText: tagline.textContent ?? '',
        cardOverflow: (card as HTMLElement).scrollHeight - (card as HTMLElement).clientHeight,
      };
    }),
  );
  for (const item of geometry) {
    expect(item.apart).toBe(true);
    expect(item.taglineOverflow).toBeLessThanOrEqual(0);
    expect(item.taglineText.length).toBeGreaterThan(0);
    expect(item.taglineText.length).toBeLessThanOrEqual(14);
    expect(item.cardOverflow).toBeLessThanOrEqual(1);
  }

  // 图片：webp、有宽高、alt 带代号与中文名
  const images = page.locator('.mb-mbti-grid-desktop .mb-mbti-avatar');
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

  // 对比度：直接量卡片上的真实像素（毛玻璃合成之后），四组各测一张
  for (const token of ['analyst', 'sentinel', 'diplomat', 'explorer']) {
    const card = `.mb-mbti-grid-desktop .mb-mbti-${token}`;
    expect(
      await cardContrast(page, card, `${card} .mb-mbti-code`),
      `${token} 代号对比度`,
    ).toBeGreaterThan(4.5);
    expect(
      await cardContrast(page, card, `${card} .mb-mbti-tagline`),
      `${token} 标语对比度`,
    ).toBeGreaterThan(4.5);
  }
});

test('人格详解（桌面）：点卡片开居中弹层，完整描述不截断，上一型/下一型可用', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  const card = page.getByRole('button', { name: /^INTJ 建筑师，查看完整介绍$/ });
  await card.click();

  const sheet = page.getByRole('dialog', { name: 'INTJ 建筑师' });
  await expect(sheet).toBeVisible();
  // 完整描述（不是卡片上那一句）
  await expect(sheet.locator('.mb-sheet-desc')).toContainText('习惯先搭好全局的框架');
  await expect(sheet.locator('.mb-sheet-desc')).toContainText('不太愿意把情绪挂在脸上');
  // 2~3 个关键词
  expect(await sheet.locator('.mb-sheet-tags li').count()).toBeGreaterThanOrEqual(2);
  // 免责声明搬进了面板底部
  await expect(sheet.locator('.mb-sheet-note')).toHaveText(
    'MBTI 仅供自我探索参考，不具备心理评估或诊断功能。',
  );

  // 桌面是居中弹层，不是贴底
  const box = (await sheet.boundingBox())!;
  const vh = await page.evaluate(() => window.innerHeight);
  expect(box.y).toBeGreaterThan(vh * 0.05);
  expect(box.y + box.height).toBeLessThan(vh * 0.98);

  // 下一型 / 上一型
  await sheet.getByRole('button', { name: '下一型' }).click();
  const nextSheet = page.getByRole('dialog', { name: 'INTP 逻辑学家' });
  await expect(nextSheet).toBeVisible();
  await nextSheet.getByRole('button', { name: '上一型' }).click();
  await expect(page.getByRole('dialog', { name: 'INTJ 建筑师' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'INTJ 建筑师' })).toBeHidden();
  // 关闭后焦点回到触发它的卡片，键盘用户可以接着往下走
  await expect(card).toBeFocused();
});

test('人格详解（桌面）：整图灯箱可缩放、可保存、Esc 关闭，底部有免责声明', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  await page.getByRole('button', { name: '查看完整图' }).click();
  const lightbox = page.getByRole('dialog', { name: /全图/ });
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('img')).toHaveAttribute('src', '/mbti/mbti-all.webp');
  await expect(lightbox.locator('.mb-lightbox-note')).toContainText('不具备心理评估或诊断功能');

  // 打开时页面锁滚，背景不会跟着乱跑
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

  await expect(lightbox.locator('.mb-lightbox-scale')).toHaveText('100%');
  await lightbox.getByRole('button', { name: '放大' }).click();
  await expect(lightbox.locator('.mb-lightbox-scale')).toHaveText('135%');
  await lightbox.getByRole('button', { name: '还原' }).click();
  await expect(lightbox.locator('.mb-lightbox-scale')).toHaveText('100%');

  const save = lightbox.getByRole('link', { name: '保存整图' });
  await expect(save).toHaveAttribute('download', 'MBTI-十六种人格类型.webp');

  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
});

for (const size of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`人格详解（手机 ${size.width}×${size.height}）：分组逐屏、一屏四张、无内滚无截断`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openHome(page);
    await goToScreen(page, 'mbti');

    const screen = page.locator('#mbti');
    const tabs = screen.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    // 一次只显示当前组的四张
    await expect(page.locator('.mb-mbti-grid-mobile .mb-mbti-card')).toHaveCount(4);
    await expect(page.locator('.mb-mbti-grid-desktop')).toBeHidden();

    const metrics = await page.evaluate(() => {
      const section = document.getElementById('mbti')!;
      const grid = section.querySelector('.mb-mbti-grid-mobile') as HTMLElement;
      const cards = Array.from(grid.querySelectorAll<HTMLElement>('.mb-mbti-card'));
      const note = section.querySelector('.mb-mbti-note') as HTMLElement;
      const title = section.querySelector('.mb-mbti-title') as HTMLElement;
      const style = getComputedStyle(grid);
      return {
        columns: style.gridTemplateColumns.split(' ').length,
        rows: style.gridTemplateRows.split(' ').length,
        docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // 整屏不需要滚动：这一屏没有比自身更高的内容
        screenOverflowY: section.scrollHeight - section.clientHeight,
        noteBottom: Math.round(note.getBoundingClientRect().bottom),
        vh: window.innerHeight,
        noteLines: Math.round(
          note.getBoundingClientRect().height / parseFloat(getComputedStyle(note).lineHeight),
        ),
        titleLines: Math.round(
          title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight),
        ),
        cards: cards.map((card) => {
          const avatar = card.querySelector('.mb-mbti-avatar')!.getBoundingClientRect();
          const code = card.querySelector('.mb-mbti-code')!.getBoundingClientRect();
          const tagline = card.querySelector('.mb-mbti-tagline') as HTMLElement;
          const name = card.querySelector('.mb-mbti-name') as HTMLElement;
          return {
            width: Math.round(card.getBoundingClientRect().width),
            avatarBottom: Math.round(avatar.bottom),
            codeTop: Math.round(code.top),
            cardOverflowY: card.scrollHeight - card.clientHeight,
            taglineOverflowX: tagline.scrollWidth - tagline.clientWidth,
            nameOverflowX: name.scrollWidth - name.clientWidth,
            bottom: Math.round(card.getBoundingClientRect().bottom),
          };
        }),
        // 这一屏里不该再有"自己能滚"的容器
        scrollers: Array.from(section.querySelectorAll<HTMLElement>('*'))
          .filter((el) => {
            const computed = getComputedStyle(el);
            return (
              (computed.overflowY === 'auto' || computed.overflowY === 'scroll') &&
              el.scrollHeight - el.clientHeight > 4
            );
          })
          .map((el) => el.className),
      };
    });

    expect(metrics.columns).toBe(2);
    expect(metrics.rows).toBe(2);
    expect(metrics.docOverflowX).toBeLessThanOrEqual(0);
    expect(metrics.screenOverflowY).toBeLessThanOrEqual(1);
    expect(metrics.scrollers).toEqual([]);
    expect(metrics.titleLines).toBe(1);
    expect(metrics.noteLines).toBe(1);
    expect(metrics.noteBottom).toBeLessThanOrEqual(metrics.vh);

    const first = metrics.cards[0]!;
    for (const card of metrics.cards) {
      expect(card.cardOverflowY).toBeLessThanOrEqual(1);
      expect(card.taglineOverflowX).toBeLessThanOrEqual(0);
      expect(card.nameOverflowX).toBeLessThanOrEqual(0);
      // 头像在代号上方，不压字
      expect(card.avatarBottom).toBeLessThanOrEqual(card.codeTop + 1);
      expect(card.width).toBe(first.width);
      expect(card.bottom).toBeLessThanOrEqual(metrics.vh);
    }

    // 切一组：卡片换成那一组的四个，标签跟着高亮
    await screen.getByRole('tab', { name: '探索型' }).click();
    await page.waitForTimeout(500);
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.mb-mbti-grid-mobile .mb-mbti-code')).toHaveText([
      'ISTP',
      'ISFP',
      'ESTP',
      'ESFP',
    ]);

    // 左右滑动也能换组（向右划 → 回到上一组）
    const box = (await page.locator('.mb-mbti-grid-mobile').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(page.locator('.mb-mbti-grid-mobile .mb-mbti-code').first()).toHaveText('INFJ');
  });
}

test('人格详解（手机）：点卡片从底部升起详情面板，可下滑关闭', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  await page.locator('.mb-mbti-grid-mobile .mb-mbti-card').first().click();
  const sheet = page.getByRole('dialog', { name: 'INTJ 建筑师' });
  await expect(sheet).toBeVisible();

  // bottom sheet：贴底、最高 70dvh
  const box = (await sheet.boundingBox())!;
  const vh = await page.evaluate(() => window.innerHeight);
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(vh - 2);
  expect(box.height).toBeLessThanOrEqual(vh * 0.7 + 2);

  // 描述完整显示（不截断）：没有 -webkit-line-clamp，也没有被裁掉的高度
  const desc = await sheet.locator('.mb-sheet-desc').evaluate((el) => ({
    clamp: getComputedStyle(el).webkitLineClamp,
    overflow: el.scrollHeight - el.clientHeight,
  }));
  expect(desc.clamp).toBe('none');
  expect(desc.overflow).toBeLessThanOrEqual(1);

  // 抓握把往下拖，关闭
  const grip = (await sheet.locator('.mb-sheet-grip').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 8);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 180, { steps: 8 });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
});

test('三种宽度都没有横向滚动条', async ({ page }) => {
  const sizes = [
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-hydrated="true"]', { timeout: 45_000 });
    await page.waitForTimeout(1400);

    for (const id of ['sky', 'wheel', 'mbti']) {
      await goToScreen(page, id);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const wide = Array.from(
          document.querySelectorAll<HTMLElement>('.mb-screen, .mb-mbti-grid, .mb-mbti-card'),
        )
          .map((el) => el.scrollWidth - el.clientWidth)
          .reduce((max, value) => Math.max(max, value), 0);
        return { doc: doc.scrollWidth - doc.clientWidth, wide };
      });
      expect(overflow.doc, `${size.width}px / ${id} 出现横向滚动`).toBeLessThanOrEqual(0);
      expect(overflow.wide, `${size.width}px / ${id} 内部溢出`).toBeLessThanOrEqual(1);
    }
  }
});

test('减少动效：进场动画关掉，内容直接可见，翻页仍在', async ({ page }) => {
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
    };
  });
  expect(state.opacity).toBe('1');
  expect(state.cardOpacity).toBe('1');
  expect(state.cardAnimation).toBe('none');

  // 减少动效下翻页仍然可用，只是时长收缩到 0（直接落位）
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);
  await page.keyboard.press('End');
  await page.waitForTimeout(400);
  const vh = await page.evaluate(() => window.innerHeight);
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(vh * 2);
});
