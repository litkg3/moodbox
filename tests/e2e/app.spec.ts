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
  // 天空（含小球）已经滚到视口上方之外
  expect(skyBox && skyBox.y + skyBox.height).toBeLessThanOrEqual(0);
});

test('情绪转盘：8 个扇形，点击放大并展示完整信息，可返回关闭', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await openHome(page);

  // 转盘在第一屏下方，滚过去让它进入视口
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();
  const wheel = page.locator('.emotion-wheel');
  await expect(wheel).toBeVisible();

  // 8 个扇形，每个都可点、都带标题
  const slices = page.locator('.emotion-wheel-slice');
  await expect(slices).toHaveCount(8);
  await expect(page.getByRole('heading', { name: '情绪转盘' }).first()).toBeVisible();

  // 点「迷茫」，弹出详情卡，其余扇形半透明
  const lost = page.locator('.emotion-wheel-slice', { hasText: '迷茫' });
  await lost.click();
  const card = page.locator('.emotion-wheel-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('是为了获得');
  await expect(card).toContainText('处理方法');

  // 其余扇形进入半透明态（被点中的那一个 aria-checked=true）
  await expect(lost).toHaveAttribute('aria-checked', 'true');
  const other = page.locator('.emotion-wheel-slice[aria-checked="false"]').first();
  // 过渡是 0.45s，等它走完再读计算样式
  await expect
    .poll(() => other.evaluate((el) => parseFloat(getComputedStyle(el).opacity)))
    .toBeLessThan(0.5);

  // 返回按钮关闭
  await card.getByRole('button', { name: '返回转盘' }).click();
  await expect(card).toBeHidden();
  await expect(lost).toHaveAttribute('aria-checked', 'false');
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
  const lonely = page.locator('.emotion-wheel-slice', { hasText: '孤独' });

  // 待机时卡片常驻，跟着指针走
  await expect(card).toHaveCount(1);

  // 点一下某一格 → 锁定，卡片定住
  await lonely.click();
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('孤独');
  await expect(page.locator('.emotion-wheel-card-close')).toBeVisible();

  // 再点一次同一格 → 收起；自动转动继续，但卡片不能再冒出来
  await lonely.click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.emotion-wheel-card-close')).toHaveCount(0);
  // 等过一个自动步进周期，确认卡片没有随着转动复活
  await page.waitForTimeout(2400);
  await expect(card).toHaveCount(0);

  // 重新点开，再点转盘外的空白处关闭
  await lonely.click();
  await expect(card).toHaveCount(1);
  await page.mouse.click(24, 780);
  await expect(card).toHaveCount(0);
  await page.waitForTimeout(2400);
  await expect(card).toHaveCount(0);
});

test('情绪转盘：第二屏撑满一屏，转盘水平居中', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  // 两屏：第一屏 + 转盘屏，页面刚好能滚一屏
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
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
  // 页面至少两屏高，滚到底就是转盘那一屏
  expect(geo!.docH).toBeGreaterThanOrEqual(geo!.vh * 2 - 24);
  /*
   * 窄屏（<1280）转盘水平居中（±2px）；
   * 宽屏改成「盘在左、卡片在右」，盘会往左让出一栏，这里只要求它完整在屏内。
   */
  if (geo!.vw < 1280) {
    expect(Math.abs(geo!.centerX - geo!.vw / 2)).toBeLessThan(2);
  } else {
    expect(geo!.centerX).toBeGreaterThan(geo!.vw * 0.2);
    expect(geo!.centerX).toBeLessThan(geo!.vw * 0.45);
  }
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
  // SVG 的 <text> 不是 HTMLElement，取文本要用 textContent
  const readTop = () =>
    page.locator('.emotion-wheel-slice-top .emotion-wheel-slice-label').evaluate((el) => el.textContent ?? '');

  // 待机时每秒转一格：2.2 秒后整盘角度必然变了
  const first = await readTransform();
  await page.waitForTimeout(2200);
  expect(await readTransform()).not.toBe(first);

  // 盘在转，但卡片一直在（自动选中），而且卡片标题与指针下那一格一致
  await expect(page.locator('.emotion-wheel-card')).toBeVisible();
  const topLabel = await readTop();
  expect(await readCard()).toBe(topLabel);
  await expect(page.locator('.emotion-wheel-pointer')).toHaveClass(/is-on/);

  // 再等一格，卡片跟着指针换人 —— 这就是「自动选中」
  await page.waitForTimeout(1300);
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
  const board = (await page.locator('.emotion-wheel-board').boundingBox())!;
  const centerX = board.x + board.width / 2;
  // 选一条半径：点在扇形环的中线上（避开中间的洞和边缘）
  const radius = board.width * 0.33;
  await page.mouse.move(centerX, board.y + board.height / 2 - radius, { steps: 10 });
  await page.waitForTimeout(500);
  // 径向往斜上轻移一下，确保触发了 pointermove
  await page.mouse.move(centerX + 6, board.y + board.height / 2 - radius + 4, { steps: 4 });
  await page.waitForTimeout(1200);

  const hot = page.locator('.emotion-wheel-slice-hot');
  await expect(hot).toHaveCount(1);

  // 悬停生效后盘停住、卡片与指针一致
  const topLabel = await page
    .locator('.emotion-wheel-slice-top .emotion-wheel-slice-label')
    .evaluate((el) => el.textContent ?? '');
  await expect(page.locator('.emotion-wheel-card-title')).toHaveText(topLabel);

  const paused = await readTransform();
  await page.waitForTimeout(2200);
  expect(await readTransform()).toBe(paused);

  // 移开之后重新开始转
  await page.mouse.move(24, 120, { steps: 8 });
  await page.waitForTimeout(2400);
  expect(await readTransform()).not.toBe(paused);
});

test('情绪转盘：点一下停住并锁定，卡片在侧边横向排开', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  await page.locator('.emotion-wheel-slice', { hasText: '焦虑' }).click();
  await expect(page.getByRole('region', { name: /焦虑/ })).toBeVisible();

  // 停转
  const spin = page.locator('.emotion-wheel-spin');
  await page.waitForTimeout(1200);
  const stopped = await spin.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(2200);
  expect(await spin.evaluate((el) => getComputedStyle(el).transform)).toBe(stopped);

  // 锁定态才有「返回转盘」
  await expect(page.locator('.emotion-wheel-card-close')).toBeVisible();
  await expect(page.locator('.emotion-wheel-card-slot')).toHaveAttribute('data-locked', 'true');

  // 卡片在转盘右侧，且是横向排布（宽明显大于高）
  const board = await page.locator('.emotion-wheel-board').boundingBox();
  const cardBox = await page.locator('.emotion-wheel-card').boundingBox();
  expect(board && cardBox).toBeTruthy();
  expect(cardBox!.x).toBeGreaterThan(board!.x + board!.width);
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

  // 横向两栏：处理方法在需求的右边，而不是下面
  const need = await page.locator('.emotion-wheel-card-need').boundingBox();
  const method = await page.locator('.emotion-wheel-card-method').boundingBox();
  expect(need && method).toBeTruthy();
  expect(method!.x).toBeGreaterThan(need!.x + need!.width - 1);
});
