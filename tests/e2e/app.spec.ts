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
  const card = page.getByRole('dialog', { name: /迷茫/ });
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
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  const lonely = page.locator('.emotion-wheel-slice', { hasText: '孤独' });
  await lonely.click();
  const card = page.getByRole('dialog', { name: /孤独/ });
  await expect(card).toBeVisible();

  // 再点一下已选中的扇形，收起
  await lonely.click();
  await expect(card).toBeHidden();

  // 重新打开，点转盘外的空白处关闭
  await lonely.click();
  await expect(card).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(card).toBeHidden();
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
  // 转盘水平居中（±2px）
  expect(Math.abs(geo!.centerX - geo!.vw / 2)).toBeLessThan(2);
  // 滚到底后转盘落在视口中部，而不是吊在屏幕下缘
  expect(geo!.centerY).toBeGreaterThan(geo!.vh * 0.32);
  expect(geo!.centerY).toBeLessThan(geo!.vh * 0.72);
});

test('情绪转盘：桌面端自动转动，点一下停住，详情卡出现在侧边', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator('.emotion-wheel').scrollIntoViewIfNeeded();

  const spin = page.locator('.emotion-wheel-spin');
  const readTransform = () => spin.evaluate((el) => getComputedStyle(el).transform);

  // 待机时每秒转一格：2.2 秒后整盘角度必然变了
  const first = await readTransform();
  await page.waitForTimeout(2200);
  expect(await readTransform()).not.toBe(first);

  // 自动转动时顶部指针可见
  await expect(page.locator('.emotion-wheel-pointer')).toHaveClass(/is-on/);

  // 点一个扇形 → 停止自动转动，详情卡出现
  await page.locator('.emotion-wheel-slice', { hasText: '焦虑' }).click();
  await expect(page.getByRole('dialog', { name: /焦虑/ })).toBeVisible();

  // 等最后一步旋转（0.82s）收尾，再等两秒确认角度不再变化（停转），指针收起
  await page.waitForTimeout(1200);
  const stopped = await readTransform();
  await page.waitForTimeout(2200);
  expect(await readTransform()).toBe(stopped);
  await expect(page.locator('.emotion-wheel-pointer')).not.toHaveClass(/is-on/);

  // 卡片在转盘的左边或右边，而不是下面
  const board = await page.locator('.emotion-wheel-board').boundingBox();
  const slot = page.locator('.emotion-wheel-card-slot');
  const side = await slot.getAttribute('data-side');
  const cardBox = await slot.boundingBox();
  expect(board && cardBox).toBeTruthy();
  expect(['left', 'right']).toContain(side);

  if (side === 'right') {
    expect(cardBox!.x).toBeGreaterThan(board!.x + board!.width);
  } else {
    expect(cardBox!.x + cardBox!.width).toBeLessThan(board!.x);
  }

  // 并排而不是上下堆：垂直占位与转盘有重叠
  expect(cardBox!.y).toBeLessThan(board!.y + board!.height);
  expect(cardBox!.y + cardBox!.height).toBeGreaterThan(board!.y);
});
