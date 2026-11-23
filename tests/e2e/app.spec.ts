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

test('中央液态玻璃气泡：桌面端罩住文字并真的模糊，手机端不出现', async ({ page }) => {
  await openHome(page);

  const veil = page.locator('.mb-bubble-veil');
  const blob = page.locator('.mb-blob');
  await expect(veil).toBeVisible();
  await expect(blob).toBeVisible();

  // 文字整块落在气泡里，而不是溢出到玻璃外面
  const bubble = await page.locator('.mb-bubble').boundingBox();
  const veilBox = await veil.boundingBox();
  const title = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(bubble && veilBox && title).toBeTruthy();
  expect(veilBox!.width).toBeGreaterThan(bubble!.width);
  expect(veilBox!.x).toBeLessThan(title!.x);
  expect(veilBox!.x + veilBox!.width).toBeGreaterThan(title!.x + title!.width);

  /*
   * 模糊必须真的生效。
   *
   * 这里专门守一件事：手写 `-webkit-backdrop-filter` 会让构建器丢掉标准写法，
   * 于是 `getComputedStyle` 读回 `none`，玻璃层看上去还是玻璃，其实一点都没糊。
   */
  const blur = await veil.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(blur).toContain('blur');

  // 形变与扰动由 SMIL 驱动，不是 JS 定时器；浮动是慢的、小的
  const animateCount = await blob.evaluate((el) => el.querySelectorAll('animate').length);
  expect(animateCount).toBeGreaterThan(0);
  const motion = await page.locator('.mb-bubble').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { name: cs.animationName, duration: parseFloat(cs.animationDuration) };
  });
  expect(motion.name).toBe('mb-bubble-float');
  expect(motion.duration).toBeGreaterThan(6);

  // 手机端：这一层整个不出现，文字回到原来的纯排版
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(veil).toBeHidden();
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

  // 点「愤怒」，弹出详情卡，其余扇形半透明
  const anger = page.locator('.emotion-wheel-slice', { hasText: '愤怒' });
  await anger.click();
  const card = page.getByRole('dialog', { name: /愤怒/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('是为了获得');
  await expect(card).toContainText('处理方法');

  // 其余扇形进入半透明态（被点中的那一个 aria-checked=true）
  await expect(anger).toHaveAttribute('aria-checked', 'true');
  const other = page.locator('.emotion-wheel-slice[aria-checked="false"]').first();
  // 过渡是 0.45s，等它走完再读计算样式
  await expect
    .poll(() => other.evaluate((el) => parseFloat(getComputedStyle(el).opacity)))
    .toBeLessThan(0.5);

  // 返回按钮关闭
  await card.getByRole('button', { name: '返回转盘' }).click();
  await expect(card).toBeHidden();
  await expect(anger).toHaveAttribute('aria-checked', 'false');
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
