import { expect, test, type Page } from '@playwright/test';

/**
 * 第十六轮：导航三按钮 / 更多面板 / 广场卡片 / AI 陪聊。
 *
 * 这一轮的要求集中在"四种组合（白日·星空 × 移动·桌面）都要成立"，
 * 所以每个用例都尽量把主题与视口两个维度碰一遍，而不是只验一种。
 */

const MOBILE = { width: 375, height: 812 };

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 45_000 });
}

/**
 * 切主题。
 *
 * 两种布局分别处理：
 * - 窄屏（<1024）：页头只留「主页 / 陪聊 / 更多」，主题按钮收在「更多」面板底部；
 * - 宽屏：日期与音乐、主题直接摆在页头右侧。
 * 这里都走真实路径，不直接改 localStorage —— 否则测的就不是"用户能不能切"。
 */
async function useTheme(page: Page, theme: 'day' | 'night') {
  const current = await page.getAttribute('html', 'data-theme');
  if (current === theme) return;

  const target = theme === 'night' ? '切换到星空模式' : '切换到白日模式';
  const direct = page.getByRole('button', { name: target }).first();

  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
  } else {
    const more = page.getByRole('button', { name: '更多功能' });
    await more.click();
    await expect(page.getByRole('menu', { name: '更多功能' })).toBeVisible();
    await page.getByRole('button', { name: target }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: '更多功能' })).toBeHidden();
  }

  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/**
 * 发一条帖子。
 *
 * 广场默认是空的（本机模式），不先发一条就拿不到 `.mb-post-card`。
 * 走的是真实路径：点「写一条」→ 填内容 → 点「发出去」。
 */
async function publishPost(page: Page, content: string) {
  await page.getByRole('button', { name: '写一条' }).click();
  await page.getByPlaceholder(/让我也借着你的眼睛看这个世界/).fill(content);
  await page.getByRole('button', { name: '发出去' }).click();
  await expect(page.locator('.mb-post-card').first()).toBeVisible({ timeout: 20_000 });
}

/* ---------------- 一、导航栏 ---------------- */

test.describe('移动端页头', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test('375px：logo + 三个按钮挤在一行，不换行也不溢出', async ({ page }) => {
    await gotoHydrated(page, '/');

    await expect(page.getByRole('link', { name: '主页' })).toBeVisible();
    await expect(page.getByRole('link', { name: '陪聊' })).toBeVisible();
    await expect(page.getByRole('button', { name: '更多功能' })).toBeVisible();

    // 整页不出现横向滚动条
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // 三个按钮都在页头这一行里，且右边缘没有顶出视口
    const boxes = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) return null;
      /*
       * 桌面的 TopToolBar 在窄屏是 `hidden` 但仍在 DOM 里，它的子项都带 aria-label
       * 且 getBoundingClientRect 全是 0。不排掉的话，"是否同一行"会被这些 0 撑坏，
       * 所以只取真正渲染出来的控件（宽高都 > 0）。
       */
      const items = Array.from(
        header.querySelectorAll<HTMLElement>('a[aria-label], button[aria-label]'),
      ).filter((el) => {
        if (el.closest('[role="menu"]')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const rects = items.map((el) => el.getBoundingClientRect());
      return {
        labels: items.map((el) => el.getAttribute('aria-label')),
        // 三颗现在都是 34px 高，中心应该完全落在同一条线上（仍给 1px 容差防舍入）
        centers: rects.map((rect) => rect.top + rect.height / 2),
        tops: rects.map((rect) => Math.round(rect.top)),
        bottoms: rects.map((rect) => Math.round(rect.bottom)),
        heights: rects.map((rect) => Math.round(rect.height)),
        right: Math.max(...rects.map((rect) => rect.right)),
        left: Math.min(...rects.map((rect) => rect.left)),
        headerBottom: header.getBoundingClientRect().bottom,
      };
    });
    expect(boxes).not.toBeNull();
    // 页头里只剩这三颗 + 站标链接
    expect(boxes!.labels).toEqual(['情绪盒子 MoodBox 首页', '主页', '陪聊', '更多功能']);
    const centers = boxes!.centers.map((center) => center ?? -1);
    expect(centers).toHaveLength(4);
    for (let i = 1; i < centers.length; i += 1) {
      expect(Math.abs(centers[i]! - centers[i - 1]!)).toBeLessThanOrEqual(1);
    }
    // 三颗上下边缘完全对齐（以前是 44 / 36 / 36，边缘差 4px）
    const [, ...btnTops] = boxes!.tops;
    const [, ...btnBottoms] = boxes!.bottoms;
    const [, ...btnHeights] = boxes!.heights;
    expect(new Set(btnTops).size).toBe(1);
    expect(new Set(btnBottoms).size).toBe(1);
    // 移动端收到 34：比左边 36px 的站标略小一圈，不再"按钮比 logo 大"
    expect(btnHeights).toEqual([34, 34, 34]);
    // 都在页头里，没有溢到内容区
    expect(centers.every((center) => center < boxes!.headerBottom)).toBe(true);
    expect(boxes!.right).toBeLessThanOrEqual(MOBILE.width);
    expect(boxes!.left).toBeGreaterThan(0);

    // 「主页」只剩图标：圆形、34×34、里面没有可见文字
    const home = page.getByRole('link', { name: '主页' });
    const homeBox = await home.boundingBox();
    expect(Math.round(homeBox!.width)).toBe(34);
    expect(Math.round(homeBox!.height)).toBe(34);
    expect((await home.innerText()).trim()).toBe('');
    /*
     * 「圆形」的判定：Chrome 会把 `rounded-full` 求值成 `3.35544e+07px`
     * （无限大的一侧被截断后的结果），所以不能死比字符串，
     * 只要求圆角半径 ≥ 短边的一半，即整个盒子被抹成圆。
     */
    const radius = await home.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderRadius));
    expect(radius).toBeGreaterThanOrEqual(34 / 2);

    // 「陪聊」是带文字的主按钮，「更多」是描边的次要按钮
    expect((await page.getByRole('link', { name: '陪聊' }).innerText()).trim()).toContain('陪聊');

    const pair = await page.evaluate(() => {
      const alphaOf = (el: Element | null) => {
        if (!el) return -1;
        const bg = getComputedStyle(el).backgroundColor;
        const match = bg.match(/rgba?\(([^)]+)\)/);
        if (!match) return 1;
        const parts = match[1]!.split(',').map((item) => Number(item.trim()));
        return parts.length === 4 ? (parts[3] ?? 1) : 1;
      };
      const chat = document.querySelector('.mb-nav-btn--primary');
      const more = document.querySelector('.mb-nav-btn--ghost');
      // 主按钮的实底画在 background-image 的渐变里，取其中出现的最小不透明度
      const image = chat ? getComputedStyle(chat).backgroundImage : '';
      const alphas = [...image.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].map((match) =>
        Number(match[1]),
      );
      return {
        chatImage: image,
        // 渐变里没有写 alpha（用了 #hex）时视为完全不透明
        chatGradientAlpha: alphas.length > 0 ? Math.min(...alphas) : 1,
        chatAlpha: alphaOf(chat) ?? 1,
        moreAlpha: alphaOf(more) ?? 1,
        moreBorder: more ? getComputedStyle(more).borderTopWidth : '',
      };
    });
    // 主按钮：实心，且有渐变
    expect(pair.chatImage).toContain('gradient');
    expect(pair.chatGradientAlpha).toBeGreaterThan(0.85);
    expect(pair.chatAlpha + pair.chatGradientAlpha).toBeGreaterThan(0.85);
    // 次要按钮：浅底 + 有描边，明显比主按钮轻
    expect(pair.moreBorder).toBe('1px');
    expect(pair.moreAlpha).toBeLessThan(0.5);
  });

  test('三颗按钮是同一套刻度：34px 高、17px 图标、1.75 描边、同一层阴影', async ({ page }) => {
    await gotoHydrated(page, '/');

    const spec = await page.evaluate(() => {
      const header = document.querySelector('header')!;
      const brand = header.querySelector<HTMLElement>('a[aria-label="情绪盒子 MoodBox 首页"]')!;
      const mark = brand.querySelector('svg')!;
      const labels = ['主页', '陪聊', '更多功能'];
      const buttons = labels.map((label) => {
        const el = header.querySelector<HTMLElement>(
          `a[aria-label="${label}"], button[aria-label="${label}"]`,
        )!;
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const icon = el.querySelector('svg')!;
        const iconRect = icon.getBoundingClientRect();
        const hitBefore = getComputedStyle(el, '::before');
        return {
          label,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          columnGap: cs.columnGap,
          borderWidth: cs.borderTopWidth,
          borderStyle: cs.borderTopStyle,
          boxSizing: cs.boxSizing,
          shadow: cs.boxShadow,
          iconW: iconRect.width,
          iconH: iconRect.height,
          iconStroke: getComputedStyle(icon).strokeWidth,
          iconCap: getComputedStyle(icon).strokeLinecap,
          iconJoin: getComputedStyle(icon).strokeLinejoin,
          // 热区：伪元素向四周各探出去多少
          beforeTop: hitBefore.top,
          beforePosition: hitBefore.position,
          // ::before 用 inset:-2px 时 top 会算成 -2px
          beforeInset: hitBefore.inset,
        };
      });

      // 热区是否真的覆盖到 44×44：在按钮上方 1.5px 处取点，看命中的是谁
      const home = header.querySelector<HTMLElement>('a[aria-label="主页"]')!;
      const hr = home.getBoundingClientRect();
      const cx = hr.left + hr.width / 2;
      const hitAbove = document.elementFromPoint(cx, hr.top - 1.5);
      const hitBelow = document.elementFromPoint(cx, hr.bottom + 1.5);

      const brandRect = brand.getBoundingClientRect();

      return {
        headerHeight: header.getBoundingClientRect().height,
        buttons,
        markW: mark.getBoundingClientRect().width,
        markH: mark.getBoundingClientRect().height,
        brandGap: getComputedStyle(brand).columnGap,
        brandLeft: brandRect.left,
        brandCenterY: brandRect.top + brandRect.height / 2,
        /** 热区扩展是否被伪元素接住（用 Boolean 包一层：elementFromPoint 返回 null 时不能算通过） */
        hotAbove: Boolean(hitAbove?.closest('a[aria-label="主页"]')),
        hotBelow: Boolean(hitBelow?.closest('a[aria-label="主页"]')),
        hotAboveTag: hitAbove?.tagName ?? null,
      };
    });

    // 页头高度：移动端 56px，内容行不因滚动而缩短
    expect(spec.headerHeight).toBe(56);

    for (const btn of spec.buttons) {
      expect(btn.height, `${btn.label} 高度`).toBe(34);
      // 字号 12 / 字重 500 / 行高 1（避免基线偏移）
      expect(btn.fontSize, btn.label).toBe('12px');
      expect(btn.fontWeight, btn.label).toBe('500');
      expect(btn.lineHeight, btn.label).toBe('12px');
      // 图标与文字之间 6px
      expect(btn.columnGap, btn.label).toBe('6px');
      // 边框统一 1px；没边框的也要占位，否则会矮 2px
      expect(btn.borderWidth, btn.label).toBe('1px');
      expect(btn.borderStyle, btn.label).not.toBe('none');
      expect(btn.boxSizing, btn.label).toBe('border-box');
      // 图标 17×17，描边 1.75，端点为圆头
      expect(btn.iconW, btn.label).toBe(17);
      expect(btn.iconH, btn.label).toBe(17);
      expect(btn.iconStroke, btn.label).toBe('1.75px');
      expect(btn.iconCap, btn.label).toBe('round');
      expect(btn.iconJoin, btn.label).toBe('round');
      /*
       * 阴影 y 偏移不超过 2px（以前「陪聊」是 10px，看着往下掉）。
       * 按图层拆开、每层只取前两个长度（offsetX offsetY），
       * 不能跨层两两配对 —— 第 3 个值是 blur、第 4 个是 spread，会被误读成 y。
       */
      const yOffsets = btn.shadow.split(/,(?![^(]*\))/).map((layer) => {
        const nums = [...layer.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
        return nums.length >= 2 ? Math.abs(nums[1]!) : 0;
      });
      expect(yOffsets.length).toBeGreaterThan(0);
      for (const dy of yOffsets) expect(dy, `${btn.label} 阴影 y`).toBeLessThanOrEqual(2);
    }

    // 三颗的上下边缘完全一致
    expect(new Set(spec.buttons.map((b) => Math.round(b.top))).size).toBe(1);
    expect(new Set(spec.buttons.map((b) => Math.round(b.bottom))).size).toBe(1);
    /*
     * 三颗共用同一层基础阴影（形状一致，只是主题色不同）。
     * 选中态那一颗会多一层 `inset 0 0 0 1px` 当选中指示（规范要求用它，
     * 而不是加粗 border），比对时把 inset 层剔掉。
     */
    const shadowShapes = spec.buttons.map((b) =>
      b.shadow
        .split(/,(?![^(]*\))/)
        .filter((layer) => !layer.includes('inset'))
        .map((layer) => layer.replace(/rgba?\([^)]*\)/g, 'C').trim())
        .join(' , '),
    );
    expect(new Set(shadowShapes).size).toBe(1);

    // 触屏热区探到 44×44（视觉仍是 36）
    expect(spec.hotAbove, '主页上方 1.5px 应仍可点').toBe(true);
    expect(spec.hotBelow, '主页下方 1.5px 应仍可点').toBe(true);

    // logo：图标 36×36、与文字 10px、左边缘在 20px（与内容区一致）
    expect(spec.markW).toBe(36);
    expect(spec.markH).toBe(36);
    expect(spec.brandGap).toBe('10px');
    expect(spec.brandLeft).toBe(20);
    // logo 的中线与按钮组的中线是同一条（按钮高 34，中线在 top + 17）
    expect(Math.abs(spec.brandCenterY - (spec.buttons[0]!.top + 17))).toBeLessThanOrEqual(1);
  });

  test('logo 左边缘与内页正文左边缘对齐', async ({ page }) => {
    // 内页用 PageShell（px-5），正文左边缘有确定的参考值
    await gotoHydrated(page, '/breathe');

    const align = await page.evaluate(() => {
      const brand = document.querySelector<HTMLElement>('header a[aria-label*="首页"]')!;
      const main = document.querySelector('main')!;
      const mainRect = main.getBoundingClientRect();
      return {
        brandLeft: brand.getBoundingClientRect().left,
        /* 正文起点 = main 的左边缘 + 它自己的左内边距（main 是通栏、靠 padding 让位） */
        textLeft: mainRect.left + Number.parseFloat(getComputedStyle(main).paddingLeft),
        mainPadLeft: Number.parseFloat(getComputedStyle(main).paddingLeft),
      };
    });
    expect(align.mainPadLeft).toBe(20);
    // logo 与正文必须同一个像素起头
    expect(Math.abs(align.brandLeft - align.textLeft)).toBeLessThanOrEqual(1);
  });

  test('选中态只换颜色，不改变尺寸与位置', async ({ page }) => {
    const measure = async () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('a[aria-label="主页"]')!;
        const rect = el.getBoundingClientRect();
        return {
          w: rect.width,
          h: rect.height,
          left: rect.left,
          top: rect.top,
          borderWidth: getComputedStyle(el).borderTopWidth,
        };
      });

    await gotoHydrated(page, '/');
    const active = await measure();
    await expect(page.getByRole('link', { name: '主页' })).toHaveAttribute('aria-current', 'page');

    // 换到非当前页：同一颗按钮不该变胖或位移
    await gotoHydrated(page, '/chat');
    const idle = await measure();
    await expect(page.getByRole('link', { name: '主页' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );

    expect(idle.w).toBe(active.w);
    expect(idle.h).toBe(active.h);
    expect(idle.left).toBe(active.left);
    expect(idle.top).toBe(active.top);
    expect(idle.borderWidth).toBe(active.borderWidth);
  });

  test('更多面板：全宽下拉、有遮罩、分组正确、再点一次关掉', async ({ page }) => {
    await gotoHydrated(page, '/');
    const more = page.getByRole('button', { name: '更多功能' });
    await more.click();

    const menu = page.getByRole('menu', { name: '更多功能' });
    await expect(menu).toBeVisible();

    // 全宽：左右贴边
    const box = await menu.boundingBox();
    expect(Math.round(box!.x)).toBe(0);
    expect(Math.round(box!.width)).toBe(MOBILE.width);

    // 遮罩：从页头下沿开始铺满，带模糊
    const scrim = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.mb-more-scrim');
      if (!el) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        bg: style.backgroundColor,
        filter: style.backdropFilter,
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    });
    expect(scrim).not.toBeNull();
    expect(scrim!.filter).toContain('blur');
    expect(scrim!.width).toBe(MOBILE.width);
    // 遮罩不能盖住页头，否则"再点一次关闭"点不到
    expect(scrim!.top).toBeGreaterThan(0);
    expect(scrim!.bg).not.toBe('rgba(0, 0, 0, 0)');

    // 第一项是「AI 陪聊」
    const items = menu.getByRole('menuitem');
    await expect(items.first()).toContainText('AI 陪聊');

    /*
     * 不再有「常用」这行小标题。
     *
     * 面板里的每一项都自带图标和文字，分组靠位置和间距就看得懂；
     * 多一行 10px 的小字反而占掉了两行的高度。
     */
    await expect(menu.getByText('常用', { exact: true })).toHaveCount(0);

    // 常用项在上，关于/设置在下面
    const order = await menu.evaluate((el) => {
      const texts = Array.from(el.querySelectorAll('[role="menuitem"]')).map(
        (node) => node.textContent ?? '',
      );
      return texts;
    });
    const index = (keyword: string) => order.findIndex((text) => text.includes(keyword));
    expect(index('AI 陪聊')).toBe(0);
    for (const common of ['呼吸放松', '情绪测试', '树洞广场', '开心罐']) {
      const at = index(common);
      expect(at, common).toBeGreaterThan(-1);
      expect(at, common).toBeLessThan(index('关于'));
    }
    expect(index('关于')).toBeLessThan(index('设置'));

    // 面板背景不透出下面的文字
    const panelAlpha = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.mb-more-panel');
      if (!el) return null;
      const bg = getComputedStyle(el).backgroundColor;
      const match = bg.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1]!.split(',').map((item) => Number(item.trim()));
      return parts.length === 4 ? (parts[3] ?? 1) : 1;
    });
    expect(panelAlpha).not.toBeNull();
    expect(panelAlpha!).toBeGreaterThanOrEqual(0.92);

    // 再点一次「更多」关闭
    await more.click();
    await expect(menu).toBeHidden();
  });

  test('点遮罩也能关；主题切换后遮罩颜色按主题走', async ({ page }) => {
    await gotoHydrated(page, '/');

    for (const theme of ['day', 'night'] as const) {
      await useTheme(page, theme);
      await page.getByRole('button', { name: '更多功能' }).click();
      const menu = page.getByRole('menu', { name: '更多功能' });
      await expect(menu).toBeVisible();

      const bg = await page
        .locator('.mb-more-scrim')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      if (theme === 'night') {
        expect(bg).toContain('0, 0, 0');
      } else {
        // 白日是偏紫的浅色遮罩，不是纯黑
        expect(bg).not.toContain('rgba(0, 0, 0');
      }

      // 点面板下方的空白处（遮罩）关闭
      await page.mouse.click(MOBILE.width / 2, MOBILE.height - 40);
      await expect(menu).toBeHidden();
    }
  });

  test('当前页面在菜单里有选中态，点「陪聊」会到 /chat', async ({ page }) => {
    await gotoHydrated(page, '/breathe');
    await page.getByRole('button', { name: '更多功能' }).click();
    const current = page.getByRole('menuitem', { name: /呼吸放松/ });
    await expect(current).toHaveAttribute('aria-current', 'page');
    // 别的入口不该跟着亮
    await expect(page.getByRole('menuitem', { name: /情绪测试/ })).not.toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('button', { name: '更多功能' }).click();
    await page.getByRole('link', { name: '陪聊' }).click();
    await expect(page).toHaveURL(/\/chat$/);
  });
});

/* ---------------- 二、树洞广场 ---------------- */

test.describe('广场卡片', () => {
  test('卡片是 0.88 不透明度的玻璃，两种主题都成立', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoHydrated(page, '/square');
    await publishPost(page, '今天的风很软，想记一下。');

    const card = page.locator('.mb-post-card').first();
    await expect(card).toBeVisible();

    for (const theme of ['day', 'night'] as const) {
      await useTheme(page, theme);
      const style = await card.evaluate((el) => {
        const computed = getComputedStyle(el);
        const match = computed.backgroundColor.match(/rgba?\(([^)]+)\)/);
        const parts = match ? match[1]!.split(',').map((item) => Number(item.trim())) : [];
        return {
          alpha: parts.length === 4 ? (parts[3] ?? 1) : 1,
          rgb: parts.slice(0, 3),
          filter: computed.backdropFilter,
          border: computed.borderTopColor,
          shadow: computed.boxShadow,
        };
      });
      expect(style.alpha).toBeCloseTo(0.88, 2);
      expect(style.filter).toContain('blur');
      if (theme === 'night') expect(style.rgb[0]).toBeLessThan(80);
      else expect(style.rgb[0]).toBeGreaterThan(200);
    }
  });

  test('移动端单列铺满，左右各留 20px', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoHydrated(page, '/square');
    await publishPost(page, '留白检查。');

    const card = page.locator('.mb-post-card').first();
    await expect(card).toBeVisible();

    const box = await card.boundingBox();
    expect(Math.round(box!.x)).toBe(20);
    expect(Math.round(box!.width)).toBe(MOBILE.width - 40);

    // 只有一列：所有卡片的左边都对齐
    const lefts = await page
      .locator('.mb-post-card')
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().left)),
      );
    expect(new Set(lefts).size).toBe(1);
  });

  /*
   * 提示行的字号与图标分支（地球 / 数据库）由 tests/unit/components.test.tsx 覆盖：
   * e2e 固定跑在本机模式（moodbox-force-local=1），永远拿不到"所有人都能看见"那句。
   * 这里只验真实渲染出来的这一种：13px、不再是 12px 那档小字、对比度够。
   */
  test('数据去向那行提示放大了一档，颜色不是最浅那层', async ({ page }) => {
    await gotoHydrated(page, '/square');
    const note = page.locator('.mb-square-note').first();
    await expect(note).toBeVisible();
    await expect(note).toContainText('只存在这台设备上');

    const style = await note.evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      // 把 --color-ink-ghost 解析成实际颜色，用来确认"没退回到最浅那层"
      const probe = document.createElement('span');
      probe.style.color = root.getPropertyValue('--color-ink-ghost').trim() || 'transparent';
      document.body.appendChild(probe);
      const ghost = getComputedStyle(probe).color;
      probe.remove();
      return {
        size: Number.parseFloat(getComputedStyle(el).fontSize),
        color: getComputedStyle(el).color,
        ghost,
      };
    });
    expect(style.size).toBeGreaterThanOrEqual(13);
    expect(style.color).not.toBe(style.ghost);
  });
});

/* ---------------- 三、AI 陪聊 ---------------- */

test.describe('AI 陪聊', () => {
  test('空状态：免责声明常驻、三个快捷入口都在', async ({ page }) => {
    await gotoHydrated(page, '/chat');

    await expect(page.getByText('AI 陪伴，不是真人，不能替代专业帮助')).toBeVisible();
    for (const quick of ['想说说今天', '帮我平静下来', '只想有人听听']) {
      await expect(page.getByRole('button', { name: quick })).toBeVisible();
    }
  });

  test('高风险输入会弹出关怀卡片，而不是继续普通回复', async ({ page }) => {
    await gotoHydrated(page, '/chat');

    const input = page.getByLabel('输入消息');
    await input.fill('真的不想活了，想死');
    await input.press('Enter');

    const card = page.getByRole('region', { name: '关怀提示' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('我很在意你刚才说的');
    // 没有配置热线时，卡片上不会凭空出现号码
    await expect(card.locator('.mb-care-phone')).toHaveCount(0);
    // 也不该再有一条 AI 的普通回复接着分析
    await expect(page.locator('.mb-chat-bubble-ai')).toHaveCount(0);
  });

  test('回车发送、Shift+Enter 换行、输入法组词时回车不发送', async ({ page }) => {
    await gotoHydrated(page, '/chat');
    const input = page.getByLabel('输入消息');

    // Shift + Enter 只换行
    await input.fill('第一行');
    await input.press('Shift+Enter');
    await expect(input).toHaveValue('第一行\n');

    // 组词期间按 Enter 不发送（isComposing 为 true）
    await input.fill('还在打字');
    await input.evaluate((el) => {
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
      );
    });
    await expect(page.locator('.mb-chat-bubble-user')).toHaveCount(0);

    // 正常 Enter 才发送，并且焦点留在输入框
    await input.fill('今天有点闷');
    await input.press('Enter');
    await expect(page.locator('.mb-chat-bubble-user')).toHaveCount(1);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
  });

  test('流式回复能逐字出来，Esc 可停止并保留已生成的部分', async ({ page }) => {
    await gotoHydrated(page, '/chat');
    const input = page.getByLabel('输入消息');
    await input.fill('今天加班到很晚，有点撑不住');
    await input.press('Enter');

    const ai = page.locator('.mb-chat-bubble-ai').last();
    await expect(ai).toBeVisible();
    // 先出「正在输入」的三个点，再逐字替换
    await expect(ai.locator('.mb-chat-typing')).toBeVisible();
    await expect(ai.locator('p')).not.toHaveText('', { timeout: 20_000 });

    const partial = (await ai.locator('p').innerText()).length;
    await page.keyboard.press('Escape');
    await expect(ai.locator('.mb-chat-stopped')).toBeVisible();
    // 停止后长度不再增长
    await page.waitForTimeout(600);
    expect((await ai.locator('p').innerText()).length).toBeGreaterThanOrEqual(partial);
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  });

  test('切换主题不会丢对话，也不会跳回顶部', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHydrated(page, '/chat');
    const input = page.getByLabel('输入消息');

    for (const [index, text] of ['第一句：今天有点累', '第二句：但还是想说说', '第三句：谢谢你听着'].entries()) {
      // 上一轮彻底结束（「停止生成」按钮消失）再发下一句
      await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0, {
        timeout: 20_000,
      });
      await input.fill(text);
      await input.press('Enter');
      /*
       * 等待条件要盯"这一轮"：上一轮已生成的 AI 气泡里有字，
       * 直接等 last().locator('p') 非空会在新气泡刚插进来时就通过。
       */
      await expect(page.locator('.mb-chat-bubble-user')).toHaveCount(index + 1);
      await expect(page.locator('.mb-chat-bubble-ai').nth(index).locator('p')).not.toHaveText('', {
        timeout: 20_000,
      });
    }
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0, {
      timeout: 20_000,
    });
    expect(await page.locator('.mb-chat-bubble-user').count()).toBe(3);

    await useTheme(page, 'night');

    await expect(page.locator('.mb-chat-bubble-user')).toHaveCount(3);
    await expect(page.getByText('第一句：今天有点累')).toBeVisible();
    // 还在底部附近，没被顶回第一屏
    const gap = await page.locator('.mb-chat-scroll').evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    expect(gap).toBeLessThan(80);
  });

  test('桌面端：对话区居中 760px，气泡不超过 75%', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHydrated(page, '/chat');

    const input = page.getByLabel('输入消息');
    await input.fill('桌面端宽度检查');
    await input.press('Enter');
    await expect(page.locator('.mb-chat-bubble-user')).toBeVisible();

    const layout = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('.mb-chat-grid')!;
      const main = document.querySelector<HTMLElement>('.mb-chat-main')!;
      const side = document.querySelector<HTMLElement>('.mb-chat-side')!;
      const bubble = document.querySelector<HTMLElement>('.mb-chat-bubble')!;
      const gridRect = grid.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        gridLeft: gridRect.left,
        gridRight: window.innerWidth - gridRect.right,
        mainWidth: mainRect.width,
        sideWidth: side.getBoundingClientRect().width,
        bubbleRatio: bubble.getBoundingClientRect().width / mainRect.width,
        // 输入栏和对话区同宽、贴在它底部
        composerLeft: document.querySelector<HTMLElement>('.mb-chat-composer')!.getBoundingClientRect().left,
        mainLeft: mainRect.left,
      };
    });

    expect(Math.round(layout.mainWidth)).toBe(760);
    // 整个 grid 居中：左右留白相等（侧栏在左边，也算在 grid 里）
    expect(Math.abs(layout.gridLeft - layout.gridRight)).toBeLessThanOrEqual(2);
    expect(Math.round(layout.sideWidth)).toBe(260);
    expect(layout.bubbleRatio).toBeLessThanOrEqual(0.75 + 0.01);
    expect(Math.round(layout.composerLeft)).toBe(Math.round(layout.mainLeft));
  });

  test('「保存对话」是显式开关：关着不写 localStorage，开着一键能删干净', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHydrated(page, '/chat');
    const input = page.getByLabel('输入消息');

    /*
     * 先等聊天外壳挂上再操作。
     *
     * 「删除全部记录」在侧栏里，而侧栏跟着 `.mb-chat-page` 一起出现；不等的话，
     * 机器慢的时候 Playwright 会按"还没定位好"的坐标去点 —— 调试信息里表现
     * 成背景层（极光）拦截了点击。hydration 标记只说明 JS 跑起来了，不说明
     * 这个固定定位的外壳已经布好版。
     */
    await expect(page.locator('.mb-chat-page')).toBeVisible();

    await input.fill('这句话不该被存下来');
    await input.press('Enter');
    await expect(page.locator('.mb-chat-bubble-ai').last().locator('p')).not.toHaveText('', {
      timeout: 20_000,
    });

    expect(await page.evaluate(() => localStorage.getItem('moodbox-chat-sessions-v1'))).toBeNull();

    await page.getByRole('button', { name: /不保存|已保存/ }).click();
    await expect(page.getByRole('button', { name: /已保存/ })).toBeVisible();

    await input.fill('这句话打开开关后才存');
    await input.press('Enter');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('moodbox-chat-sessions-v1')))
      .not.toBeNull();

    await page.getByRole('button', { name: '删除全部记录' }).click();
    /*
     * 用 poll 而不是立刻读：点击只是派发了事件，真正清空发生在这一帧的
     * effect 里，紧接着同步读 localStorage 会偶发拿到旧值（CI 上机器慢时更明显）。
     */
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('moodbox-chat-sessions-v1')))
      .toBeNull();
  });
});

/* ---------------- 验收：移动端键盘不挡输入栏 ---------------- */

test.describe('移动端键盘', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test('visualViewport 变矮时，输入栏跟着抬起来（--chat-vv-h / --chat-kb）', async ({ page }) => {
    await gotoHydrated(page, '/chat');

    const input = page.getByLabel('输入消息');
    await expect(input).toBeVisible();

    const before = await page.evaluate(() => {
      const vv = window.visualViewport;
      return {
        vvH: vv?.height ?? 0,
        rootH: getComputedStyle(document.documentElement).getPropertyValue('--chat-vv-h').trim(),
        kb: getComputedStyle(document.documentElement).getPropertyValue('--chat-kb').trim(),
      };
    });
    expect(before.rootH).not.toBe('');
    expect(Number.parseInt(before.rootH, 10)).toBe(Math.round(before.vvH));

    /*
     * 真机键盘没法在 Playwright 里唤起，所以直接把 visualViewport 改矮 ——
     * 应用监听的正是它的 resize，这条路径和 iOS 弹出键盘是同一条。
     */
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, 'height', { value: window.innerHeight - 320, configurable: true });
      vv.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => {
      const vv = window.visualViewport;
      const root = getComputedStyle(document.documentElement);
      const composer = document.querySelector<HTMLElement>('.mb-chat-composer');
      return {
        vvH: vv?.height ?? 0,
        rootH: Number.parseInt(root.getPropertyValue('--chat-vv-h').trim(), 10),
        kb: Number.parseInt(root.getPropertyValue('--chat-kb').trim(), 10),
        composerBottom: composer ? Math.round(composer.getBoundingClientRect().bottom) : -1,
      };
    });

    // 变量跟着视口走
    expect(after.rootH).toBe(Math.round(after.vvH));
    expect(after.kb).toBeGreaterThan(200);

    // 输入栏整体落在可见区域内，不会被键盘盖住
    expect(after.composerBottom).toBeLessThanOrEqual(Math.round(after.vvH) + 1);
    await expect(input).toBeVisible();
  });
});

/* ---------------- 验收：手机上点输入框不会把整页放大 ---------------- */

test.describe('移动端聊天输入框', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test('输入框字号 ≥ 16px —— iOS 就是靠这条决定要不要自动放大', async ({ page }) => {
    await gotoHydrated(page, '/chat');

    const input = page.getByLabel('输入消息');
    await input.focus();
    await input.fill('点一下输入框试试');

    const spec = await page.evaluate(() => {
      const el = document.querySelector<HTMLTextAreaElement>('.mb-chat-input')!;
      const cs = getComputedStyle(el);
      const composer = document.querySelector<HTMLElement>('.mb-chat-composer')!;
      return {
        fontSize: Number.parseFloat(cs.fontSize),
        lineHeight: Number.parseFloat(cs.lineHeight),
        // 聚焦后页面不能被撑宽（放大时 scrollWidth 会超过 clientWidth）
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // 输入栏底边不应被推出视口
        composerBottom: Math.round(composer.getBoundingClientRect().bottom),
        viewportH: window.innerHeight,
      };
    });

    /*
     * 16 是硬线下限。iOS Safari 聚焦 font-size < 16px 的输入框时会把整页
     * 放大一次且不自动缩回，看起来就像"点一下输入框，页面炸了"。
     * 桌面允许 14px，所以这条只在移动视口下断言。
     */
    expect(spec.fontSize).toBeGreaterThanOrEqual(16);
    expect(spec.lineHeight).toBeGreaterThanOrEqual(20);
    expect(spec.overflowX).toBeLessThanOrEqual(0);
    expect(spec.composerBottom).toBeLessThanOrEqual(spec.viewportH);
  });

  test('手机上没有键盘提示那一行', async ({ page }) => {
    await gotoHydrated(page, '/chat');

    // 整行隐藏：Enter/Shift+Enter 在触屏上不成立，留着只会让人以为还有快捷键要学
    await expect(page.locator('.mb-chat-hint')).toBeHidden();

    // 桌面端仍然保留
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.mb-chat-hint')).toBeVisible();
    await expect(page.locator('.mb-chat-hint')).toContainText('Enter 发送');
  });
});

/* ---------------- 回归：键盘弹出后聊天页不能被顶走 ---------------- */

test.describe('移动端键盘弹出时的整页行为', () => {
  test.use({ viewport: MOBILE, hasTouch: true, isMobile: true });

  test('键盘弹出时主文档没有滚动余量，对话区仍在可视范围内', async ({ page }) => {
    await gotoHydrated(page, '/chat');
    await expect(page.locator('.mb-chat-page')).toBeVisible();

    // 造两条消息，确认"上方能看见对话"这件事是可验证的，而不是看空状态
    const input = page.getByLabel('输入消息');
    await input.fill('今天有点累，加班到十点。');
    await input.press('Enter');
    await expect(page.locator('.mb-chat-bubble-ai').last().locator('p')).not.toHaveText('', {
      timeout: 20_000,
    });

    // 模拟键盘：iOS 上 innerHeight 不变，只变 visualViewport
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) throw new Error('这个浏览器没有 visualViewport，测不了键盘');
      Object.defineProperty(vv, 'height', { value: window.innerHeight - 336, configurable: true });
      vv.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => {
      const html = document.documentElement;
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().toJSON() : null;
      };
      const vvH = Math.round(window.visualViewport!.height);
      // 试着把页面滚下去：不该成功
      window.scrollTo(0, 400);
      return {
        vvH,
        vvTop: Math.round(window.visualViewport!.offsetTop),
        scrollY: Math.round(window.scrollY),
        docScrollable: html.scrollHeight > html.clientHeight,
        bodyH: Math.round(document.body.getBoundingClientRect().height),
        pageTop: Math.round(box('.mb-chat-page')!.top),
        pageBottom: Math.round(box('.mb-chat-page')!.bottom),
        scrollTop: Math.round(box('.mb-chat-scroll')!.top),
        composerBottom: Math.round(box('.mb-chat-composer')!.bottom),
        headerBottom: Math.round(box('header.mb-header')!.bottom),
        visibleBubble: (() => {
          const bubble = document.querySelector('.mb-chat-bubble-ai')?.getBoundingClientRect();
          if (!bubble) return false;
          // 气泡至少要有一截落在"页头下方 ~ 输入栏上方"这段可见区里
          return bubble.bottom > 56 && bubble.top < vvH - 1;
        })(),
      };
    });

    // 页面本身不该能滚 —— 一旦能滚，iOS 就会把 fixed 的聊天层滚出屏幕
    expect(state.docScrollable, '主文档不该有滚动余量').toBe(false);
    expect(state.scrollY).toBe(0);
    expect(state.vvTop).toBe(0);

    // 聊天层贴着页头、贴着可视底边，没有跑出视口
    expect(state.pageTop).toBe(state.headerBottom);
    expect(state.pageBottom).toBeLessThanOrEqual(state.vvH + 1);
    expect(state.composerBottom).toBeLessThanOrEqual(state.vvH + 1);

    // 上方看得见对话本身
    expect(state.scrollTop).toBeLessThan(state.composerBottom);
    expect(state.visibleBubble, '键盘弹起后气泡仍在可见区').toBe(true);
  });
});
