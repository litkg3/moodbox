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
  await expect(sheet).toHaveAttribute('data-state', 'open');
  /*
   * 等入场滑完（280ms）再量、再拖。
   * 面板是"从屏幕下方滑上来"的，动画期间它的位置每秒在变 —— 先量到 y 再按下，
   * 按的时候抓握把已经在别处了，这是测试在追动画，不是用户会做的事。
   */
  await page.waitForTimeout(360);

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

test('人格详解：详情面板挂在 body 上并固定在视口，祖先链没有 transform / filter', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  await page.locator('.mb-mbti-grid-mobile .mb-mbti-card').first().click();
  const sheet = page.getByRole('dialog', { name: 'INTJ 建筑师' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(360);

  const info = await sheet.evaluate((el) => {
    /*
     * iOS 上「面板浮起来」最常见的原因是祖先带 transform / filter /
     * backdrop-filter —— 这几样会把 position: fixed 的包含块从视口换成那个
     * 祖先，面板就跟着页面滚动漂移。所以这里沿着祖先链一路查到 <html>。
     */
    const bad: string[] = [];
    let node: HTMLElement | null = el.parentElement;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (
        cs.transform !== 'none' ||
        cs.filter !== 'none' ||
        (cs as CSSStyleDeclaration & { backdropFilter?: string }).backdropFilter !== 'none' ||
        cs.perspective !== 'none'
      ) {
        bad.push(`${node.tagName.toLowerCase()}.${node.className}`);
      }
      node = node.parentElement;
    }
    const rect = el.getBoundingClientRect();
    return {
      parent: el.parentElement?.tagName.toLowerCase(),
      position: getComputedStyle(el).position,
      bad,
      bottom: Math.round(rect.bottom),
      vh: window.innerHeight,
    };
  });

  expect(info.parent).toBe('body');
  expect(info.position).toBe('fixed');
  expect(info.bad).toEqual([]);
  // 贴着视口底边
  expect(Math.abs(info.bottom - info.vh)).toBeLessThanOrEqual(2);

  // 遮罩与面板是兄弟，且都在 portal 里（body 的直接子元素）
  const order = await page.evaluate(() => {
    const scrim = document.querySelector('.mb-sheet-scrim');
    const panel = document.querySelector('.mb-sheet');
    return {
      sameParent: scrim?.parentElement === panel?.parentElement,
      zScrim: Number(getComputedStyle(scrim!).zIndex),
      zSheet: Number(getComputedStyle(panel!).zIndex),
    };
  });
  expect(order.sameParent).toBe(true);
  expect(order.zSheet).toBeGreaterThan(order.zScrim);
});

test('人格详解：面板打开时背景锁死，关闭后回到原处并把焦点还给卡片', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  const before = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    snap: getComputedStyle(document.documentElement).scrollSnapType,
  }));
  expect(before.y).toBeGreaterThan(0);

  await page.locator('.mb-mbti-grid-mobile .mb-mbti-card').first().click();
  const sheet = page.getByRole('dialog', { name: 'INTJ 建筑师' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(360);

  const locked = await page.evaluate(() => ({
    position: document.body.style.position,
    top: document.body.style.top,
    paused: document.documentElement.classList.contains('mb-overlay-open'),
    snap: getComputedStyle(document.documentElement).scrollSnapType,
    overflow: getComputedStyle(document.documentElement).overflow,
  }));
  expect(locked.position).toBe('fixed');
  expect(locked.top).toBe(`-${before.y}px`);
  // 整页吸附在面板开着时让路（否则背景会自己翻屏）
  expect(locked.paused).toBe(true);
  expect(locked.snap).toBe('none');

  // 背景真的滚不动：滚轮压在遮罩上
  await page.mouse.move(20, 160);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    body: document.body.getAttribute('style') ?? '',
    snap: getComputedStyle(document.documentElement).scrollSnapType,
    focus: document.activeElement?.getAttribute('aria-label'),
  }));
  expect(after.y).toBe(before.y);
  expect(after.body.trim()).toBe('');
  expect(after.snap).toBe(before.snap);
  expect(after.focus).toContain('INTJ');
});

test('人格详解：桌面上详情面板的顶部留白，头像不贴到面板上沿', async ({ page }) => {
  /*
   * 手机上这个位置有 26px 的拖拽握把垫着；桌面没有握把，
   * 而 `.mb-sheet-body` 的 padding-top 是 0 —— 实测头像上沿离面板顶边
   * 只有 1px，等于贴着边框裁进去。
   */
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  await page.locator('.mb-mbti-grid-desktop .mb-mbti-card').first().click();
  const sheet = page.getByRole('dialog', { name: 'INTJ 建筑师' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(420);

  const gap = await page.evaluate(() => {
    const panel = document.querySelector('.mb-sheet')!.getBoundingClientRect();
    const art = document.querySelector('.mb-sheet-art')!.getBoundingClientRect();
    return art.top - panel.top;
  });

  // 面板左右内边距是 20px，顶部至少要和它一个量级，不能贴边
  expect(gap, '头像离面板上沿太近').toBeGreaterThanOrEqual(18);
});

test('人格详解：矮屏下卡片内容也不贴边，头像不顶到卡片上沿', async ({ page }) => {
  /*
   * 四行网格把卡片高度压成"剩余高度 / 4"。屏高 560 时每张只剩 84px，
   * 而卡内内容是 头像 44 + 两行字 ≈ 66px —— 上下各分到 11px，比左右
   * 内边距（14px）还窄，看起来就是"头像顶到边、字挤在上下框里"。
   *
   * 1280×560 是笔记本上很常见的实际高度（浏览器上下工具栏各占一截），
   * 所以这一档必须真的量一遍，不能只看 1440×900。
   */
  await page.setViewportSize({ width: 1280, height: 560 });
  await openHome(page);
  await goToScreen(page, 'mbti');
  await page.waitForTimeout(400);

  const metrics = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.mb-mbti-grid-desktop .mb-mbti-card')];
    const visible = cards.filter((card) => card.getBoundingClientRect().width > 0);
    return visible.slice(0, 4).map((card) => {
      const box = card.getBoundingClientRect();
      // 卡内所有可见内容（头像 + 文字块）的最上沿与最下沿
      const parts = ['.mb-mbti-avatar', '.mb-mbti-meta'].map((sel) =>
        card.querySelector(sel)!.getBoundingClientRect(),
      );
      const style = getComputedStyle(card);
      return {
        gapTop: Math.min(...parts.map((part) => part.top)) - box.top,
        gapBottom: box.bottom - Math.max(...parts.map((part) => part.bottom)),
        paddingX: parseFloat(style.paddingLeft),
        cardHeight: box.height,
      };
    });
  });

  expect(metrics.length).toBeGreaterThan(0);
  for (const item of metrics) {
    // 上下都要留出比左右内边距更宽的空白，内容才没有"顶到边"
    expect(item.gapTop, '头像离卡片上沿太近').toBeGreaterThanOrEqual(item.paddingX);
    expect(item.gapBottom, '文字离卡片下沿太近').toBeGreaterThanOrEqual(item.paddingX);
    // 余量不能靠把卡片撑出屏幕换 —— 卡片高度本身要有个像样的下限
    expect(item.cardHeight).toBeGreaterThanOrEqual(100);
  }
});

test('人格详解：卡片在悬停/按下/获得焦点时都不改变几何', async ({ page }) => {
  await openHome(page);
  await goToScreen(page, 'mbti');

  /*
   * 这条是从"点一下卡片就上下抖"那件事里学到的教训。
   *
   * 之前两版修法（去掉 scale、压住 :hover:focus-visible）都是在跟具体的
   * 属性打架，但根因是：卡片的位置由「会被点按改写的属性」决定。只要
   * `:hover` / `:active` / `:focus-visible` 里还有 transform 或 translate，
   * 松手、焦点回填、鼠标停留这几个时刻就会把它演成一段看得见的位移 ——
   * 不同浏览器上还各演各的。
   *
   * 所以现在用结构来保证：这三条状态里**一个几何属性都不许有**。
   * 反馈只走描边、阴影、亮度。
   */
  const offenders = await page.evaluate(() => {
    const bad: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) walk(rule.cssRules);
        else if (rule instanceof CSSStyleRule) {
          if (!rule.selectorText.includes('.mb-mbti-card')) continue;
          if (!/:hover|:active|:focus-visible/.test(rule.selectorText)) continue;
          const { transform, translate, top, marginTop } = rule.style;
          if (transform && transform !== 'none') bad.push(`${rule.selectorText} → transform: ${transform}`);
          if (translate && translate !== 'none') bad.push(`${rule.selectorText} → translate: ${translate}`);
          if (top) bad.push(`${rule.selectorText} → top: ${top}`);
          if (marginTop) bad.push(`${rule.selectorText} → margin-top: ${marginTop}`);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        /* 跨域样式表读不到，忽略 */
      }
    }
    return bad;
  });
  expect(offenders, '卡片的状态规则里不该有几何属性').toEqual([]);

  // 实机行为也对一遍：悬停 → 按下 → 松开，位置一帧都不能变
  const card = page.locator('.mb-mbti-grid-desktop .mb-mbti-card').first();
  await card.scrollIntoViewIfNeeded();
  const before = await card.boundingBox();
  if (!before) throw new Error('卡片没渲染出来');

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.waitForTimeout(200);
  const onHover = await card.boundingBox();

  await page.mouse.down();
  await page.waitForTimeout(200);
  const onActive = await card.boundingBox();
  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterUp = await card.boundingBox();

  for (const [name, box] of Object.entries({ onHover, onActive, afterUp })) {
    expect(box!.x, `${name} 时横向位置变了`).toBeCloseTo(before.x, 1);
    expect(box!.y, `${name} 时纵向位置变了`).toBeCloseTo(before.y, 1);
    expect(box!.height, `${name} 时高度变了`).toBeCloseTo(before.height, 1);
  }
});
test('人格详解：关闭面板后焦点回到卡片，卡片不会因为焦点+悬停而往下晃', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  /*
   * 复现路径就是用户说的那条：点开卡片 → 关掉。
   * 关的时候焦点被还给卡片，鼠标还停在原处 —— `:hover` 和 `:focus-visible`
   * 会同时成立。`:hover` 想把卡片浮到 -2px、`:active` 刚把它按到 -1px 且
   * 过渡时长更短，两条一起插值，看上去就是卡片"往下晃了一下"。
   */
  const card = page.locator('.mb-mbti-grid-mobile .mb-mbti-card').first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error('卡片没渲染出来');
  // 把鼠标停在卡片正中，模拟"点完之后手还没移开"
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await card.click();
  const sheet = page.getByRole('dialog', { name: 'INTJ 建筑师' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(300);

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // 等过 450ms 的过渡，确认最终位置真的稳住了，而不是正在浮回来
  await page.waitForTimeout(560);

  const after = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.mb-mbti-grid-mobile .mb-mbti-card');
    if (!el) throw new Error('卡片不见了');
    const cs = getComputedStyle(el);
    return {
      transform: cs.transform,
      hover: el.matches(':hover'),
      focusVisible: el.matches(':focus-visible'),
      outlineWidth: cs.outlineWidth,
    };
  });

  // 焦点确实留在了卡片上（否则这条测试就没测到想测的场景）
  expect(after.hover || after.focusVisible, '鼠标应仍停在卡片上').toBe(true);
  // 关键：不许有任何位移，transform 必须是 none
  expect(after.transform, '关闭面板后卡片不该有位移').toBe('none');
});

test('人格详解：点遮罩关面板，背景不会先闪回第一屏（解锁时按住吸附、瞬时复位）', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  const before = await page.evaluate(() => Math.round(window.scrollY));
  expect(before).toBeGreaterThan(0);

  await page.locator('.mb-mbti-grid-mobile .mb-mbti-card').first().click();
  const sheet = page.getByRole('dialog', { name: 'INTJ 建筑师' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  // 越过打开后的遮罩静默期，否则这一下会被当成"双击的第二下"吞掉
  await page.waitForTimeout(600);

  /*
   * 逐帧采样。判据只有一个：**解锁之后不能有任何一帧停在第一屏**。
   *
   * 锁滚动用的是 `body { position: fixed; top: -y }`，此时 window.scrollY 是 0；
   * 一旦 body 回到文档流而 scrollTo 没跟上（或者被 smooth / snap 接走），
   * 用户看到的就是"页面闪回顶部、再滑回来"，也就是这次的抖动。
   */
  await page.evaluate(() => {
    type Frame = {
      t: number;
      unlocked: boolean;
      y: number;
      mbtiTop: number;
      snap: string;
      hold: boolean;
    };
    const root = document.documentElement;
    const mbti = document.getElementById('mbti')!;
    const frames: Frame[] = [];
    (window as unknown as { __frames: Frame[] }).__frames = frames;
    const t0 = performance.now();
    const tick = () => {
      frames.push({
        t: Math.round(performance.now() - t0),
        unlocked: document.body.style.position !== 'fixed',
        y: Math.round(window.scrollY),
        mbtiTop: Math.round(mbti.getBoundingClientRect().top),
        snap: getComputedStyle(root).scrollSnapType,
        hold: root.classList.contains('mb-snap-hold'),
      });
      if (performance.now() - t0 < 1400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // 点面板上方的空白（遮罩）关闭
  await page.mouse.click(195, 80);
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(600);

  const frames = await page.evaluate(
    () => (window as unknown as { __frames: Array<Record<string, unknown>> }).__frames,
  );
  expect(frames.length).toBeGreaterThan(20);

  const flashed = frames.filter((frame) => frame.unlocked === true && frame.y === 0);
  expect(flashed, '解锁后出现了停在第一屏的帧').toHaveLength(0);

  // 整个过程里人格屏都填满视口，没有一帧被顶出画面
  for (const frame of frames) expect(Math.abs(Number(frame.mbtiTop))).toBeLessThanOrEqual(2);

  // 解锁的瞬间吸附被按住（否则 Safari 会拿旧位置先吸一次），随后放开
  expect(frames.some((frame) => frame.hold === true && frame.snap === 'none')).toBe(true);
  expect(frames.at(-1)?.snap).toBe('y mandatory');

  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(before);
});

test('人格详解：双击卡片不会把刚打开的面板关掉', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await goToScreen(page, 'mbti');

  const box = (await page.locator('.mb-mbti-grid-mobile .mb-mbti-card').first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(60);
  // 第二下落在刚升起的遮罩上：属于「打开的余波」，要吞掉
  await page.mouse.click(x, y);
  await page.waitForTimeout(600);

  await expect(page.getByRole('dialog', { name: 'INTJ 建筑师' })).toHaveAttribute(
    'data-state',
    'open',
  );
});

test('人格详解：卡片的悬停效果只写给有鼠标的设备，触屏不会卡在浮起状态', async ({ page }) => {
  await openHome(page);

  const hoverMedias = await page.evaluate(() => {
    const found: string[] = [];
    const walk = (rules: CSSRuleList, media: string) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText);
        else if (rule instanceof CSSStyleRule && rule.selectorText.includes('.mb-mbti-card:hover')) {
          found.push(media);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules, '');
      } catch {
        /* 跨域样式表读不到，忽略 */
      }
    }
    return found;
  });

  expect(hoverMedias.length).toBeGreaterThan(0);
  // 每一条 hover 规则都必须被 (hover: hover) and (pointer: fine) 圈住
  for (const media of hoverMedias) expect(media).toContain('hover');
});
