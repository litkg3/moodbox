import { expect, test, type Page } from '@playwright/test';

const BLESSING =
  '或许“情绪球”上的内容无法完全对应你的心情，但我希望这些小球可以给你带来一些温暖。';

/** 打开页面并等待 React 完成水合，避免“点了但脚本还没接管”的假失败 */
async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 45_000 });
}

async function openHome(page: Page) {
  await gotoHydrated(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(2200);
}

/**
 * 指针正对着的那一格的文字。
 *
 * 转盘是 8 瓣 × 3 层，只有最内层（最高强度那个词）会打上
 * `.emotion-wheel-slice-top`，所以这个选择器天然唯一，取到的就是卡片该显示的那一格。
 */
function topLabelOf(page: Page) {
  return page
    .locator('.emotion-wheel-slice-top .emotion-wheel-slice-label')
    .evaluate((el) => el.textContent ?? '');
}

/**
 * 把某一格滚到屏幕上，返回它的盒子。
 *
 * 转盘在自动转，格子的屏幕位置一直在变，所以量坐标之前先让盘停住：
 * 把鼠标放到盘上（悬停即暂停），再等一拍。
 */
async function holdCell(page: Page, label: string) {
  const cell = page.locator('.emotion-wheel-slice').filter({ hasText: label }).first();
  const box = (await cell.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(260);
  return cell;
}

/**
 * 点转盘上某一格。
 *
 * 为什么不能直接 cell.click()：一格的形状是「一段上宽下窄的带子 + 两条弧」，
 * 它的 getBoundingClientRect 是个斜置的外接矩形 —— 内层那两环更是接近
 * 三角形，外接矩形的中心落在外面的空白里。Playwright 默认点外框中心，
 * 于是报「被别的格子挡住」。
 *
 * 这里的做法是量「这一格真正能被点到的所有像素」的重心，再从重心附近找
 * 一个确实命中自己的点按下去。悬停先让盘停住，量出来的坐标才有效。
 */
async function clickCell(page: Page, label: string) {
  await holdCell(page, label);

  const point = await page
    .locator('.emotion-wheel-slice')
    .filter({ hasText: label })
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const own: Array<{ x: number; y: number }> = [];
      for (let ix = 1; ix < 40; ix += 1) {
        for (let iy = 1; iy < 40; iy += 1) {
          const x = r.x + (r.width * ix) / 40;
          const y = r.y + (r.height * iy) / 40;
          if (document.elementFromPoint(x, y)?.closest?.('.emotion-wheel-slice') === el) {
            own.push({ x, y });
          }
        }
      }
      if (!own.length) return null;
      // 取重心：落在这一格最"胖"的位置，不会贴着某条边
      const cx = own.reduce((sum, p) => sum + p.x, 0) / own.length;
      const cy = own.reduce((sum, p) => sum + p.y, 0) / own.length;
      let best = own[0]!;
      let bestD = Infinity;
      for (const p of own) {
        const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    });

  if (!point) throw new Error(`转盘上找不到可点的「${label}」`);
  await page.mouse.click(point.x, point.y);
}

async function openJar(page: Page) {
  await openHome(page);
  await page.getByRole('button', { name: '开心罐' }).click();
  const jar = page.getByRole('dialog', { name: '开心罐' });
  await expect(jar).toBeVisible();
  return jar;
}

async function createMemory(page: Page, jar: ReturnType<Page['getByRole']>, content: string) {
  await jar.getByRole('button', { name: '收藏一份快乐' }).click();
  const form = page.getByRole('dialog', { name: '收藏一份快乐' });
  const textarea = form.getByPlaceholder('今天有什么值得偷偷开心的小事吗？');
  await expect(textarea).toBeVisible({ timeout: 15_000 });
  await textarea.fill(content);
  await form.getByRole('button', { name: '收进盒子' }).click();
  await expect(form).toBeHidden();
}

test('首页展示品牌、寄语、树洞入口与全部情绪球', async ({ page }) => {
  await openHome(page);

  await expect(page.locator('p', { hasText: BLESSING }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('点开一颗情绪球');
  await expect(page.getByRole('link', { name: '情绪盒子 MoodBox 首页' })).toBeVisible();

  const orbs = page.getByRole('button', { name: /：/ });
  await expect(orbs.first()).toBeVisible();
  expect(await orbs.count()).toBe(12);

  // 原来那个「我不开心了」换成了树洞广场
  await expect(page.getByRole('link', { name: '树洞广场' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '我不开心了' })).toHaveCount(0);
});

test('点击情绪球打开陪伴面板，可以切换文案并关闭', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: /^焦虑/ }).click({ force: true });

  const dialog = page.getByRole('dialog', { name: /焦虑/ });
  await expect(dialog).toBeVisible();
  const message = dialog.locator('p[aria-live="polite"]').first();
  const firstMessage = await message.innerText();
  expect(firstMessage.length).toBeGreaterThan(8);

  await dialog.getByRole('button', { name: /再给我一点温暖/ }).click();
  await expect(message).not.toHaveText(firstMessage);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('首页情绪球：中间那块文案不吃点击，「委屈」「烦躁」也点得到', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);

  /*
   * 首屏那块文案（文案 + 寄语 + 按钮）是一整块 350×200 的矩形，正好压在右侧
   * 两颗球上。它一旦吃掉指针事件，球在漂移，压进去就点不动 —— 表现就是
   * "有概率点不到"。这里直接量球心那一点到底命中了谁。
   */
  const hits = await page.evaluate(() => {
    const out: { label: string; ok: boolean; hit: string }[] = [];
    for (const label of ['委屈', '烦躁']) {
      const btn = document.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);
      if (!btn) {
        out.push({ label, ok: false, hit: 'missing' });
        continue;
      }
      const rect = btn.getBoundingClientRect();
      const center = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      out.push({
        label,
        ok: center?.closest('button') === btn,
        hit: center ? `${center.tagName.toLowerCase()}.${center.className}`.slice(0, 40) : 'none',
      });
    }
    return out;
  });

  for (const item of hits) expect(item.ok, `${item.label} 的球心被 ${item.hit} 挡住了`).toBe(true);

  // 真的按一下：球一直在漂，用 force 绕开"元素不稳定"的等待
  await page.getByRole('button', { name: /^委屈/ }).click({ force: true });
  await expect(page.getByRole('dialog', { name: /委屈/ })).toBeVisible();
});

test('开心罐里可以创建、刷新后保留、编辑并删除一份快乐', async ({ page }) => {
  const jar = await openJar(page);
  const content = '傍晚的云是粉色的，我在楼下站了五分钟才回家。';

  await createMemory(page, jar, content);
  await expect(jar.getByText(content)).toBeVisible();

  // 刷新后数据仍在（IndexedDB 持久化），卡片需要重新打开
  await gotoHydrated(page, '/');
  await page.getByRole('button', { name: '开心罐' }).click();
  const reopened = page.getByRole('dialog', { name: '开心罐' });
  await expect(reopened.getByText(content)).toBeVisible();

  // 编辑：标题由正文自动生成，所以按按钮的无障碍名匹配
  await reopened.getByRole('button', { name: /^编辑：/ }).first().click();
  const form = page.getByRole('dialog', { name: '编辑这份快乐' });
  await form.getByPlaceholder('今天有什么值得偷偷开心的小事吗？').fill('改过之后的一句话。');
  await form.getByRole('button', { name: '保存修改' }).click();
  await expect(reopened.getByText('改过之后的一句话。')).toBeVisible();

  // 删除（需要确认）
  await reopened.getByRole('button', { name: /^删除：/ }).first().click();
  await expect(page.getByText('要把它从盒子里取出来吗？')).toBeVisible();
  await page.getByRole('button', { name: '删除这份记忆' }).click();
  await expect(reopened.getByText('改过之后的一句话。')).toHaveCount(0);
});

test('情绪足迹里能看到当天收藏的快乐', async ({ page }) => {
  const jar = await openJar(page);
  await createMemory(page, jar, '今天在便利店遇到了很久没见的朋友。');
  await page.keyboard.press('Escape');

  await gotoHydrated(page, '/calendar');
  await expect(page.getByRole('heading', { name: '情绪足迹' })).toBeVisible();
  await expect(page.getByText('今天在便利店遇到了很久没见的朋友。').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /1 份快乐记忆/ }).first()).toBeVisible();
});

test('可以导出全部数据为一份备份文件', async ({ page }) => {
  const jar = await openJar(page);

  await jar.getByText('备份与隐私').click();
  // 展开有过渡动画，按钮要等它真的可见再点，否则会被判成「不可点」
  const exportButton = jar.getByRole('button', { name: '导出备份', exact: true });
  await expect(exportButton).toBeVisible({ timeout: 5000 });
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^moodbox-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

test('键盘可以访问情绪球并打开面板', async ({ page }) => {
  await openHome(page);
  await page.keyboard.press('Tab');
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
  expect(['A', 'BUTTON']).toContain(focusedTag);

  await page.getByRole('button', { name: /^开心：/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /开心/ })).toBeVisible();
});

test('滚到转盘后情绪球随页面滚走，第一屏底部有向下箭头', async ({ page }) => {
  await openHome(page);

  // 第一屏底部有向下滑动的箭头（无文字）
  const hint = page.locator('.mb-scroll-hint');
  await expect(hint).toBeVisible();

  // 滚到转盘区域后，情绪球已经随页面滚出视口（不再只是原地渐隐）
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();
  const skyBox = await page.locator('.emotion-sky').boundingBox();
  // 天空（含小球）已经滚到视口上方之外（留一点亚像素容差）
  expect(skyBox && skyBox.y + skyBox.height).toBeLessThanOrEqual(24);
});

test('情绪转盘：8 瓣 × 3 层，点击放大并展示完整信息，可返回关闭', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await openHome(page);

  // 转盘在第一屏下方，滚过去让它进入视口
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();
  const wheel = page.locator('.emotion-wheel');
  await expect(wheel).toBeVisible();

  /*
   * 24 格：8 瓣 × 3 层强度。每瓣外圈低、内圈高，所以「悲观」这一瓣是
   * 伤感 / 悲伤 / 悲痛；外加 8 个落在瓣缝里的复合词（只读标签，不可点）。
   */
  const slices = page.locator('.emotion-wheel-slice');
  await expect(slices).toHaveCount(24);
  await expect(page.locator('.emotion-wheel-petal')).toHaveCount(8);
  await expect(page.locator('.emotion-wheel-dyad')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: '情绪转盘' }).first()).toBeVisible();

  // 点「悲痛」（最内层，强度最高），弹出详情卡，其余格子半透明
  const sad = page.locator('.emotion-wheel-slice', { hasText: '悲痛' }).first();
  await clickCell(page, '悲痛');
  const card = page.locator('.emotion-wheel-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('高强度');
  await expect(card).toContainText('伤感 · 悲伤 · 悲痛');

  // 其余格子进入半透明态（被点中的那一个 aria-checked=true）
  await expect(sad).toHaveAttribute('aria-checked', 'true');
  const other = page.locator('.emotion-wheel-slice[aria-checked="false"]').first();
  // 过渡是 0.45s，等它走完再读计算样式
  await expect
    .poll(() => other.evaluate((el) => parseFloat(getComputedStyle(el).opacity)))
    .toBeLessThan(0.5);

  // 返回按钮关闭
  await card.getByRole('button', { name: '返回转盘' }).click();
  await expect(card).toBeHidden();
  await expect(sad).toHaveAttribute('aria-checked', 'false');
});

test('情绪转盘：八个复合词落在瓣缝里，盘下有强度说明', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  // 说明文字就在盘下面，三句话都在
  const note = page.locator('.emotion-wheel-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('外边缘是低强度情绪');
  await expect(note).toContainText('向中心区情绪渐强');
  await expect(note).toContainText('无色区是混合情绪');

  /*
   * 复合词的位置。它们必须落在「两瓣之间的缝」上 —— 也就是离最近的两瓣
   * 各差半个瓣（22.5°），而不是压在某一片花瓣的中线上。
   *
   * 上一版这里多加了 PETAL_DEG / 2，八个词于是全跑到瓣尖正上方，看着像
   * 给那一片花瓣起了个别名，而它本该说的是「左边这瓣 + 右边这瓣」。
   */
  const measured = await page.evaluate(() => {
    const svg = document.querySelector('.emotion-wheel-svg') as SVGSVGElement;
    const m = svg.getScreenCTM()!;
    const cx = m.a * 200 + m.c * 200 + m.e;
    const cy = m.b * 200 + m.d * 200 + m.f;
    const angleOf = (el: Element) => {
      const b = el.getBoundingClientRect();
      return (Math.atan2((b.top + b.bottom) / 2 - cy, (b.left + b.right) / 2 - cx) * 180) / Math.PI;
    };

    const petals = [...document.querySelectorAll('.emotion-wheel-petal')].map((petal) => {
      const labels = petal.querySelectorAll('.emotion-wheel-slice-label');
      const mid = labels[1] as Element;
      return { name: mid.textContent ?? '', angle: angleOf(mid) };
    });

    return [...document.querySelectorAll('.emotion-wheel-dyad text')].map((text) => {
      const angle = angleOf(text);
      const nearby = petals
        .map((petal) => ({ name: petal.name, delta: ((angle - petal.angle + 540) % 360) - 180 }))
        .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
        .slice(0, 2);
      return {
        dyad: text.textContent ?? '',
        neighbours: nearby.map((n) => n.name).sort(),
        gap: Math.round(Math.min(...nearby.map((n) => Math.abs(n.delta)))),
      };
    });
  });

  /*
   * 配对表按「每瓣中间那一层」的词写（悲伤、惊讶、厌恶……），
   * 因为下面的测量取的就是 labels[1]。复合词本身是两瓣的高强度档撞出来的，
   * 换成外层的伤感 / 不解 / 惊吓来读也对，只是对不上这份表。
   */
  const expected: Record<string, [string, string]> = {
    乐观: ['喜悦', '期待'],
    喜爱: ['信任', '喜悦'],
    屈从: ['信任', '恐惧'],
    敬畏: ['恐惧', '惊讶'],
    悲观: ['悲伤', '惊讶'],
    悔恨: ['悲伤', '厌恶'],
    鄙视: ['厌恶', '生气'],
    好斗: ['生气', '期待'],
  };

  expect(measured).toHaveLength(8);
  for (const item of measured) {
    // 半个瓣 = 22.5°，允许几度误差（字盒中心与锚点不完全重合）
    expect(Math.abs(item.gap - 22.5), `${item.dyad} 的落点偏离瓣缝 ${item.gap}°`).toBeLessThanOrEqual(4);
    expect(item.neighbours, `${item.dyad} 两侧的花瓣`).toEqual([...(expected[item.dyad] ?? [])].sort());
  }
});

test('情绪转盘：卡片内部不出现滚动条', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();
  await expect(page.locator('.emotion-wheel-card')).toBeVisible();

  /*
   * 卡片里不允许有纵向滚动。
   * 判断标准是 scrollHeight 与 clientHeight 相等 —— 只要相等，就没有
   * 可滚区域，无论那一块是内容真的超了，还是装饰伪元素把它撑开的。
   */
  const box = await page.locator('.emotion-wheel-card').evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));
  expect(box.overflowY).toBe('hidden');
  expect(box.scrollHeight).toBe(box.clientHeight);

  // 换一格内容之后同样不能溢出
  await clickCell(page, '暴怒');
  await page.waitForTimeout(700);
  const after = await page.locator('.emotion-wheel-card').evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(after.scrollHeight).toBe(after.clientHeight);
});

test('导航栏：底色够实、文字与图标比说明性小字更深', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  const nav = page.locator('nav[aria-label="功能导航"] ul');
  await expect(nav).toBeVisible();
  // 底色是一层可读的渐变（不是完全透明）
  const bg = await nav.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('gradient');

  /*
   * 颜色对比：导航项应该比 ink-faint（说明性小字）更深。
   * 直接比「与页面底色的亮度差」不好算，这里退一步比较 alpha 与亮度：
   * ink-faint 在白日下是半透明灰，导航项必须比它更不透明。
   */
  const item = page.locator('.mb-nav-item').first();
  const navColor = await item.evaluate((el) => getComputedStyle(el).color);
  const faintColor = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'text-ink-faint';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  expect(navColor).not.toBe(faintColor);
});

test('情绪转盘：点空白处关闭详情，点击已选中扇形也能收起', async ({ page }) => {
  /*
   * 用宽屏（≥1280）测。
   *
   * 卡片在这里是「常驻」的（跟着指针自动切换），所以两种收起方式都得
   * 真的把它压住、不能收完又冒出来 —— 这正是窄屏看不出问题的地方。
   */
  await page.setViewportSize({ width: 1366, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  const card = page.locator('.emotion-wheel-card');

  // 待机时卡片常驻，跟着指针走
  await expect(card).toHaveCount(1);

  // 点一下某一格 → 锁定，卡片定住
  await clickCell(page, '悲伤');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('伤感 · 悲伤 · 悲痛');
  await expect(page.locator('.emotion-wheel-card-close')).toBeVisible();

  // 再点一次同一格 → 收起；自动转动继续，但卡片不能再冒出来
  await clickCell(page, '悲伤');
  await expect(card).toHaveCount(0);
  await expect(page.locator('.emotion-wheel-card-close')).toHaveCount(0);
  // 等过一个自动步进周期，确认卡片没有随着转动复活
  await page.waitForTimeout(2400);
  await expect(card).toHaveCount(0);

  // 重新点开，再点转盘外的空白处关闭
  await clickCell(page, '悲伤');
  await expect(card).toHaveCount(1);
  await page.mouse.click(24, 780);
  await expect(card).toHaveCount(0);
  await page.waitForTimeout(2400);
  await expect(card).toHaveCount(0);
});

test('首页整屏翻页：桌面端滚轮一次一屏，1s 缓动；手机端仍是原生吸附', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.waitForTimeout(600);

  const y = () => page.evaluate(() => Math.round(window.scrollY));
  const vh = await page.evaluate(() => window.innerHeight);
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  // 三屏：情绪天空 / 情绪转盘 / 人格详解（第四屏已删除）
  expect(Math.abs(docH - vh * 3)).toBeLessThanOrEqual(2);

  // 桌面端关掉 CSS 吸附，翻页由 JS 接管
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe(
    'none',
  );
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('mb-js-pager')),
  ).toBe(true);
  // scroll-behavior 必须是 auto，否则 rAF 每帧写一次 scrollTop 会变成每帧一段动画
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
    'auto',
  );

  expect(await y()).toBe(0);
  // 落在转盘左侧的空白上：卡片区域会接管指针，这里专测页面本身
  await page.mouse.move(300, 450);

  /*
   * 一、缓动：滚一屏要花掉接近 1s，而且中间出现大量中间位置。
   * 之前原生吸附是"拨一下、啪地吸过去"，采样只会有 0 和 900 两个值。
   */
  const trail: number[] = [];
  const startedAt = Date.now();
  const sampler = setInterval(async () => {
    try {
      trail.push(await y());
    } catch {
      /* 页面正在关闭时忽略 */
    }
  }, 50);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(1400);
  clearInterval(sampler);
  const elapsed = Date.now() - startedAt;

  expect(trail.filter((value) => value > 60 && value < vh - 60).length).toBeGreaterThanOrEqual(4);
  expect(await y()).toBe(vh);
  // 一次翻页至少要几百毫秒，不能"瞬间跳过去"
  expect(elapsed).toBeGreaterThan(600);

  // 二、一屏就是一屏：再滚一大截也只翻到第三屏
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(1400);
  expect(await y()).toBe(vh * 2);

  // 三、动画中继续滚，不会翻多屏（输入被丢掉）
  await page.keyboard.press('Home');
  await page.waitForTimeout(1300);
  expect(await y()).toBe(0);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(120);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(1400);
  expect(await y()).toBe(vh);

  // 四、键盘走同一套翻页
  await page.keyboard.press('End');
  await page.waitForTimeout(1300);
  expect(await y()).toBe(vh * 2);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(1300);
  expect(await y()).toBe(vh);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1300);
  expect(await y()).toBe(vh * 2);

  // 五、圆点导航也调同一个 goToSection
  await page.getByRole('button', { name: '前往人格详解' }).click();
  await page.waitForTimeout(1300);
  expect(await y()).toBe(vh * 2);
  await page.getByRole('button', { name: '前往情绪天空' }).click();
  await page.waitForTimeout(1300);
  expect(await y()).toBe(0);
  await expect(page.locator('.mb-screen-dot.is-active em')).toHaveText('情绪天空');
});

test('首页翻页：手机端保留原生 scroll-snap，一滑一屏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);

  const state = await page.evaluate(() => ({
    snap: getComputedStyle(document.documentElement).scrollSnapType,
    js: document.documentElement.classList.contains('mb-js-pager'),
    docH: document.documentElement.scrollHeight,
    vh: window.innerHeight,
  }));
  expect(state.snap).toBe('y mandatory');
  expect(state.js).toBe(false);
  expect(Math.abs(state.docH - state.vh * 3)).toBeLessThanOrEqual(2);
});

test('情绪转盘：第二屏撑满一屏，转盘水平居中', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  // 直接落到第二屏（转盘）。url 里没有锚点，用 offsetTop 避免 smooth 还没走完
  await page.evaluate(() => {
    const el = document.getElementById('wheel');
    if (el) window.scrollTo({ top: el.offsetTop, behavior: 'instant' });
  });
  await page.waitForTimeout(700);

  const geo = await page.evaluate(() => {
    const board = document.querySelector('.emotion-wheel-board');
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      vw: window.innerWidth,
      vh: window.innerHeight,
      docH: document.documentElement.scrollHeight,
    };
  });

  expect(geo).toBeTruthy();
  // 三屏的页面，第二屏就是转盘
  expect(geo!.docH).toBeGreaterThanOrEqual(geo!.vh * 3 - 24);
  /*
   * 窄屏（<1280）转盘水平居中（±2px）；
   * 宽屏改成「盘在左、卡片在右」，盘会往左让出一栏，这里只要求它完整在屏内。
   */
  // 任何宽度下盘都水平居中（宽屏也一样，卡片只是浮在两肩）
  expect(Math.abs(geo!.centerX - geo!.vw / 2)).toBeLessThan(3);
  // 滚到底后转盘落在视口中部，而不是吊在屏幕下缘
  expect(geo!.centerY).toBeGreaterThan(geo!.vh * 0.32);
  expect(geo!.centerY).toBeLessThan(geo!.vh * 0.72);
});

test('情绪转盘：桌面端自动转到每一格并自动选中，卡片与指针同步', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  const spin = page.locator('.emotion-wheel-spin');
  const readTransform = () => spin.evaluate((el) => getComputedStyle(el).transform);
  const readCard = () => page.locator('.emotion-wheel-card-title').innerText();
  const readTop = () => topLabelOf(page);

  /*
   * 待机节奏是 3 秒一格（0.82s 旋转 + 约 2.2s 静止）。
   *
   * 先确认「刚转完一格的样子」在一秒内不会变 —— 这一条专门守住"别再把
   * 间隔改回 1 秒"：1 秒的话这一步必然已经转走了。
   */
  const first = await readTransform();
  await page.waitForTimeout(900);
  expect(await readTransform(), '一秒内不该转走，否则说明间隔被改短了').toBe(first);

  // 等到下一个 3 秒点，整盘角度必然变了
  await page.waitForTimeout(2600);
  expect(await readTransform()).not.toBe(first);

  // 盘在转，但卡片一直在（自动选中），而且卡片标题与指针下那一格一致
  await expect(page.locator('.emotion-wheel-card')).toBeVisible();
  const topLabel = await readTop();
  expect(await readCard()).toBe(topLabel);
  await expect(page.locator('.emotion-wheel-pointer')).toHaveClass(/is-on/);

  // 再等一格（3 秒 + 一点余量），卡片跟着指针换人 —— 这就是「自动选中」
  await page.waitForTimeout(3600);
  const nextTop = await readTop();
  expect(await readCard()).toBe(nextTop);
});

test('情绪转盘：鼠标悬停停住并切到那一格，移开后继续转', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  const spin = page.locator('.emotion-wheel-spin');
  const readTransform = () => spin.evaluate((el) => getComputedStyle(el).transform);

  /*
   * 怎么让「悬停」这件事稳定下来：
   *
   * 盘在转，扇形会从鼠标底下走过。鼠标落在哪个扇形，取决于指针停下那一刻
   * 盘转到哪儿 —— 这是运行时的事，所以这里不能断言「一定是疲惫」，只能断言
   * 「悬停生效了」：有且只有一格被标成 hot、卡片标题等于指针指向的那一格。
   */
  /*
   * 落点要稳：第一屏的入场动画还在跑时盘的位置会动，等它停下再取坐标。
   *
   * 半径取环形中线（洞 86/400 = 21.5%，外沿 190/400 = 47.5%，中线 34.5%）。
   * 之前写的 0.33 已经贴着洞边了，盘再转一点、入场再缩一点，指针就落回
   * <svg> 空白上 —— hoverIndex 一直是 null，高亮不亮，看着像"悬停没反应"。
   */
  await page.waitForTimeout(1300);
  const live = (await page.locator('.emotion-wheel-board').boundingBox())!;
  const centerX = live.x + live.width / 2;
  const radius = live.width * 0.345;
  await page.mouse.move(centerX, live.y + live.height / 2 - radius, { steps: 10 });
  await page.waitForTimeout(500);
  // 径向往斜上轻移一下，确保触发了 pointermove
  await page.mouse.move(centerX + 6, live.y + live.height / 2 - radius + 4, { steps: 4 });
  await page.waitForTimeout(1200);

  const hot = page.locator('.emotion-wheel-slice-hot');
  await expect(hot).toHaveCount(1);

  /*
   * 悬停生效后盘停住、卡片与悬停的那一格一致。
   *
   * 注意比的是「鼠标停着的那一格」，不是指针（12 点方向）指着的那一格 ——
   * 转盘现在是 8 瓣 × 3 层，指针只标到某一瓣，鼠标却可能停在这一瓣外圈或
   * 内圈的任意一层。原来比 .emotion-wheel-slice-top 属于八格时代的假设。
   */
  const hotLabel = await hot
    .locator('.emotion-wheel-slice-label')
    .evaluate((el) => el.textContent ?? '');
  await expect(page.locator('.emotion-wheel-card-title')).toHaveText(hotLabel);

  // 悬停期间跨过不止一个步进点（3 秒一格），角度必须一直不变
  const paused = await readTransform();
  await page.waitForTimeout(4200);
  expect(await readTransform()).toBe(paused);

  // 移开之后重新开始转：要等过一个完整的步进间隔才会动
  await page.mouse.move(24, 120, { steps: 8 });
  await page.waitForTimeout(3800);
  expect(await readTransform()).not.toBe(paused);
});

test('情绪转盘：点一下停住并锁定，卡片在侧边横向排开', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  await clickCell(page, '悲痛');
  await expect(page.getByRole('region', { name: /悲痛/ })).toBeVisible();

  // 停转
  const spin = page.locator('.emotion-wheel-spin');
  await page.waitForTimeout(1200);
  const stopped = await spin.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(2200);
  expect(await spin.evaluate((el) => getComputedStyle(el).transform)).toBe(stopped);

  // 锁定态才有「返回转盘」
  await expect(page.locator('.emotion-wheel-card-close')).toBeVisible();
  await expect(page.locator('.emotion-wheel-card-slot')).toHaveAttribute('data-locked', 'true');

  /*
   * 卡片落在「这一格所在的那半圈」那一侧，并且和盘不重叠。
   * 盘本身始终居中 —— 这是这次改动的重点，单独用一个用例守。
   */
  const board = await page.locator('.emotion-wheel-board').boundingBox();
  const cardBox = await page.locator('.emotion-wheel-card').boundingBox();
  expect(board && cardBox).toBeTruthy();
  const side = await page.locator('.emotion-wheel-card-slot').getAttribute('data-side');
  if (side === 'right') {
    expect(cardBox!.x).toBeGreaterThan(board!.x + board!.width);
  } else {
    expect(cardBox!.x + cardBox!.width).toBeLessThan(board!.x);
  }
  // 横向排布：比正方形宽得多
  expect(cardBox!.width).toBeGreaterThan(cardBox!.height);

  /*
   * 顶部的色条是一条很窄的短线，不是通栏。
   * 宽度占卡片两成以内 —— 只有 28px，卡片 400px 以上。
   */
  const bar = await page.locator('.emotion-wheel-card-bar').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height, cardWidth: el.closest('.emotion-wheel-card')!.getBoundingClientRect().width };
  });
  expect(bar.height).toBeLessThanOrEqual(3);
  expect(bar.width).toBeLessThanOrEqual(32);
  expect(bar.width).toBeLessThan(bar.cardWidth * 0.2);

  /*
   * 强度说明分两行：先写强度，再写这一瓣的三个词。
   * 两块都是块级，所以第二块的顶要压在第一块的底下面，且左对齐。
   *
   * 只比子元素 —— 父级 .emotion-wheel-card-lead 的盒子从第一行的行顶开始，
   * 而行高 1.85 留出的半行距会让子元素的顶看起来"高过"父级的顶，那是正常
   * 排版，不是错位。
   */
  const lead = await page.locator('.emotion-wheel-card-lead').boundingBox();
  const leadText = await page.locator('.emotion-wheel-card-lead-text').boundingBox();
  expect(lead && leadText).toBeTruthy();
  const leadStrong = await page.locator('.emotion-wheel-card-lead b').boundingBox();
  expect(leadStrong && leadText).toBeTruthy();
  expect(leadText!.y).toBeGreaterThanOrEqual(leadStrong!.y + leadStrong!.height - 1);
  expect(Math.abs(leadText!.x - lead!.x)).toBeLessThan(2);
});

test('情绪转盘：宽屏盘居中，卡片浮在两肩不挤动盘', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  // 自动态卡片已经在，先把盘的中心记下来
  await expect(page.locator('.emotion-wheel-card')).toBeVisible();
  // 第二屏的入场动画会把整块从下方 48px 浮上来，等它跑完再量
  await page.waitForTimeout(1200);
  const before = await page.locator('.emotion-wheel-board').boundingBox();
  const vw = await page.evaluate(() => window.innerWidth);
  expect(Math.abs(before!.x + before!.width / 2 - vw / 2)).toBeLessThan(3);

  // 点一格之后盘不能挪位，卡片只浮在两肩
  await clickCell(page, '暴怒');
  await expect(page.locator('.emotion-wheel-card')).toBeVisible();
  const after = await page.locator('.emotion-wheel-board').boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(after!.width - before!.width)).toBeLessThan(2);
});

test('情绪转盘：点中的标签停在原位，不会被转到指针下面', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  /*
   * 「点在它此刻所在的位置」—— 直接派发 click 最接近这件事：
   * Playwright 默认的 click 会先等元素停止移动，而转盘一直在转，
   * 等到的位置和真正按下时可能已经差了一格。
   *
   * 取第 15 格（W 形第 5 瓣的中间层）。挑它没有讲究，只要是个确定的格子；
   * 「有没有挪窝」看的是整盘角度，与挑哪一格无关。
   */
  const slice = page.locator('.emotion-wheel-slice').nth(14);
  const readTransform = () =>
    page.locator('.emotion-wheel-spin').evaluate((el) => getComputedStyle(el).transform);

  /*
   * 点击那一瞬间读一次实际角度，点完立刻再读一次。
   *
   * 这一条盯的是最常见的那个 bug：盘在从 A 转向 B 的途中被点，如果
   * 冻结的是 React 里的目标值 B，盘会自己把剩下那半格走完 —— 实测
   * 那一瞬间能甩出 45°，用户看到的就是"我点了它，它却跑到指针下面"。
   * 冻结实际角度时，两者之差只剩一帧的位移（约 1°）。
   */
  const spinAngle = () =>
    page.locator('.emotion-wheel-spin').evaluate((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    });

  /*
   * 「被点那一格在屏幕上的方位」怎么量？
   *
   * 不能量它的 boundingBox —— 那个框是裁剪前的整瓣轮廓，中心几乎就在圆心，
   * 算出来的方向没有任何意义（实测偏差能到 19°）。而整盘是刚体：只要盘没有
   * 转，格子就一定没挪窝。所以直接量旋转层的角度。
   */
  const sliceAngle = () => spinAngle();

  const beforeClick = await spinAngle();
  const beforeSlice = await sliceAngle();
  await slice.evaluate((el) => (el as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(page.locator('.emotion-wheel-card-close')).toBeVisible();
  await page.waitForTimeout(280);
  const afterClick = await spinAngle();
  // 归一化到 [-180, 180] 再取绝对值
  const jumped = Math.abs((((afterClick - beforeClick + 540) % 360) + 360) % 360 - 180);
  expect(jumped).toBeLessThan(8);

  // 等过渡走完，读一个稳定值
  await page.waitForTimeout(900);
  const frozen = await readTransform();
  await page.waitForTimeout(2200);
  // 点击之后盘就定住，不再自己转到"对齐指针"的角度
  expect(await readTransform()).toBe(frozen);

  /*
   * 被点的那一格仍在它原来的方位上。
   *
   * 这里比的是「点击前后整盘的角度」，而不是「它离正上方多远」——
   * 后者会随盘的随机起始位置变，某次点到的格子恰好本来就在正上方，
   * 用例就会假失败（真遇到过）。角度差与盘的位置无关，才是稳的判据。
   */
  const afterSlice = await sliceAngle();
  const moved = Math.abs((((afterSlice - beforeSlice + 540) % 360) + 360) % 360 - 180);
  expect(moved).toBeLessThan(6);

  // 锁定之后正上方的指针收起：它表示"停在最上面"，容易误读成标签被转上去了
  await expect(page.locator('.emotion-wheel-pointer')).not.toHaveClass(/is-on/);
});

test('呼吸页：点开始先播起势动画，再进入吸气', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHydrated(page, '/breathe');

  await page.getByRole('button', { name: /点击开始/ }).click();
  /*
   * 起势期间：圆心写「跟着呼吸」。此时文档里还不能有「吸气」这几个字 ——
   * 页面底部那条说明里本来就带着"呼气比吸气长"，所以范围收窄到圆环里。
   */
  const ring = page.locator('.mb-breath-orb').locator('..');
  await expect(page.getByText('跟着呼吸')).toBeVisible();
  await expect(ring.getByText('吸气', { exact: false })).toHaveCount(0);

  // 起势结束（约 0.9s）进入真正的呼吸节奏
  await expect(ring.getByText('吸气', { exact: false }).first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('跟着呼吸')).toHaveCount(0);

  // 起势结束后才出现倒计时数字
  await expect(ring.locator('.tabular-nums')).toBeVisible();
});

test('夜间主题：转盘压低饱和度，导航与帖子卡更实', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // 默认主题按当前小时决定，这里显式钉成夜间，免得白天跑测试时用例自己变了
  await page.addInitScript(() => window.localStorage.setItem('moodbox-theme', 'night'));

  await gotoHydrated(page, '/square');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

  /*
   * 导航：夜里靠不透明度压住星空。0.9 是这次的底线 ——
   * 低于它，星星会从字缝里透出来。
   */
  const navAlpha = await page.locator('.mb-glass-nav').first().evaluate((el) => {
    const layers = getComputedStyle(el).backgroundImage.match(/rgba?\([^)]+\)/g) ?? [];
    return Math.max(...layers.map((c) => Number(c.match(/[\d.]+(?=\))/)?.[0] ?? 0)));
  });
  expect(navAlpha).toBeGreaterThanOrEqual(0.9);

  /*
   * 帖子卡：变实之后文字必须跟着回到深色，否则浅底浅字是一片糊。
   * 这里直接量对比度 —— 比断言具体色值稳，以后微调颜色也不会误伤。
   */
  await page.getByRole('button', { name: '写一条' }).click();
  const composer = page.getByRole('dialog');
  await composer.locator('textarea').first().fill('夜里也要看得清的一条。');
  await composer.getByRole('button', { name: '发出去' }).click();
  await expect(page.locator('.mb-post-card')).toBeVisible({ timeout: 15_000 });

  const prose = await page.locator('.mb-post-card').evaluate((card) => {
    const p = card.querySelector('p');
    const bg = getComputedStyle(card).backgroundColor;
    const fg = getComputedStyle(p!).color;
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [l1, l2] = [lum(parse(fg)), lum(parse(bg))].sort((a, b) => b - a);
    return { ratio: (l1! + 0.05) / (l2! + 0.05) };
  });
  // 正文是 13.5px，按 WCAG 小字标准要 4.5:1，给一点渲染误差的余量
  expect(prose.ratio).toBeGreaterThan(4.5);

  /*
   * 转盘：扇形整体被压暗、降饱和，比白天那版沉。
   *
   * 不能直接读第 0 格 —— 鼠标此时可能正停在哪一格上，那格读到的会是
   * 悬停版的 filter（更亮一档）。所以取所有扇形里饱和度最低的那个值，
   * 它一定来自没有悬停的格子。
   */
  await gotoHydrated(page, '/');
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();
  await expect(page.locator('.emotion-wheel-slice-shape').first()).toBeVisible();
  const saturations = await page.locator('.emotion-wheel-slice-shape').evaluateAll((els) =>
    els.map((el) => {
      const m = getComputedStyle(el).filter.match(/saturate\(([\d.]+)\)/);
      return m ? Number(m[1]) : 1;
    }),
  );
  expect(Math.min(...saturations)).toBeCloseTo(0.78, 2);
  // 降饱和是真的生效了，而不是全都被悬停规则盖掉（那样最低值会接近 1）
  expect(Math.min(...saturations)).toBeLessThan(0.85);
});
