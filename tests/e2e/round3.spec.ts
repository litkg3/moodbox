import { expect, test, type Page } from '@playwright/test';

/**
 * 第三轮需求的端到端验收。
 *
 * 覆盖：顶部单条导航（PC）/「更多」收纳（移动）、统一玻璃卡片、
 * 面板里的三个按钮与故事阅读、捏爆后自动飞回、开心罐与心事信箱的卡片化。
 */

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 45_000 });
}

async function openHome(page: Page) {
  await gotoHydrated(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(2200);
}

async function unlockAdmin(page: Page) {
  await page.getByRole('button', { name: '管理员入口' }).click();
  const dialog = page.getByRole('dialog', { name: '进入管理员模式' });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('输入口令').fill('moodbox2026');
  await dialog.getByRole('button', { name: '进入', exact: true }).click();
  await expect(page.getByText('管理员模式', { exact: false }).first()).toBeVisible();
}

/* ---------------- 导航 ---------------- */

test('桌面端：所有入口都在页头那一行，底部不再有第二条导航', async ({ page }) => {
  await openHome(page);

  const nav = page.getByRole('navigation', { name: '功能导航' });
  await expect(nav).toBeVisible();
  // 八项：开心罐、心事信箱、情绪足迹、呼吸放松、情绪测试、树洞广场、关于、清空数据
  // 5 个页面链接 + 3 个按钮（开心罐、心事信箱是卡片，清空数据是动作）
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(nav.getByRole('button')).toHaveCount(3);
  await expect(nav.getByRole('button', { name: '开心罐' })).toBeVisible();
  await expect(nav.getByRole('button', { name: '心事信箱' })).toBeVisible();
  await expect(nav.getByRole('link', { name: '树洞广场' })).toBeVisible();
  // 「情绪周报」已并入情绪足迹
  await expect(nav.getByRole('link', { name: '情绪周报' })).toHaveCount(0);

  // 已下线的页面入口不再出现
  await expect(page.getByRole('link', { name: '治愈故事集' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '时光信箱' })).toHaveCount(0);

  // 导航位于视口上半部分，且页面底部没有浮动条
  const box = await nav.boundingBox();
  expect(box?.y ?? 999).toBeLessThan(140);
  await expect(page.locator('.mb-dock')).toHaveCount(0);
});

test('移动端：右上角只有主页与更多，八个入口都收在更多里', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);

  await expect(page.getByRole('navigation', { name: '功能导航' })).toBeHidden();
  await expect(page.getByRole('link', { name: '主页' })).toBeVisible();

  await page.getByRole('button', { name: '更多' }).click();
  const menu = page.getByRole('menu', { name: '更多功能' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(8);
  await expect(menu.getByRole('menuitem', { name: '开心罐' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '关于' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

/* ---------------- 主题 ---------------- */

test('可以在白日与星空之间手动切换，并且记住选择', async ({ page }) => {
  await openHome(page);

  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'day');

  await page.getByRole('button', { name: '切换到星空模式' }).click();
  await expect(root).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('.mb-starfield')).toHaveCSS('opacity', '1');

  await gotoHydrated(page, '/');
  await expect(root).toHaveAttribute('data-theme', 'night');

  await page.getByRole('button', { name: '切换到白日模式' }).click();
  await expect(root).toHaveAttribute('data-theme', 'day');
});

/* ---------------- 情绪面板 ---------------- */

test('点开小球：深灰紫卡片、正文居中，三个按钮都在中间，故事不跳页', async ({ page }) => {
  await openHome(page);

  await page.getByRole('button', { name: /^焦虑/ }).click({ force: true });
  const panel = page.getByRole('dialog', { name: /焦虑/ });
  await expect(panel).toBeVisible();

  const body = panel.locator('p[aria-live="polite"]');
  await expect(body).toHaveCSS('text-align', 'center');
  await expect(body).toHaveCSS('color', 'rgb(255, 255, 255)');

  await expect(panel.getByRole('button', { name: '再给我一点温暖' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '看个小故事' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '我感觉好一点了' })).toBeVisible();

  // 看故事不离开当前页面，也不新开第二个弹层
  const url = page.url();
  await panel.getByRole('button', { name: '看个小故事' }).click();
  await expect(panel.getByRole('button', { name: '换一篇' })).toBeVisible();
  await expect(panel.locator('h3')).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(page.getByRole('dialog')).toHaveCount(1);

  await panel.getByRole('button', { name: '回到刚才' }).click();
  await expect(panel.getByRole('button', { name: '再给我一点温暖' })).toBeVisible();

  // 「我感觉好一点了」只收面板，不做别的
  await panel.getByRole('button', { name: '我感觉好一点了' }).click();
  await expect(panel).toBeHidden();
});

/* ---------------- 捏爆 ---------------- */

test('捏爆情绪球：碎裂后自己飞回来，不需要手动召回', async ({ page }) => {
  await openHome(page);

  const orbs = page.getByRole('button', { name: /：/ });
  const before = await orbs.count();
  expect(before).toBe(14);

  await page.getByRole('button', { name: /^难过/ }).click({ force: true });
  const panel = page.getByRole('dialog', { name: /难过/ });
  await panel.getByRole('button', { name: '捏爆它' }).click();
  await expect(panel).toBeHidden();

  // 碎裂动画结束后球离开天空
  await expect(orbs).toHaveCount(before - 1, { timeout: 15_000 });

  // 六秒后自己回来，且全程没有「让它们回来」这类手动按钮
  await expect(page.getByRole('button', { name: /让它们回来/ })).toHaveCount(0);
  await expect(orbs).toHaveCount(before, { timeout: 20_000 });
});

/* ---------------- 开心罐 ---------------- */

test('开心罐：卡片里收藏一份快乐，日期用日历格子选，不需要起名字', async ({ page }) => {
  await openHome(page);

  await page.getByRole('button', { name: '开心罐' }).click();
  const jar = page.getByRole('dialog', { name: '开心罐' });
  await expect(jar).toBeVisible();
  await expect(page.url()).toMatch(/\/$/); // 没有跳页

  await jar.getByRole('button', { name: '收藏一份快乐' }).click();
  const form = page.getByRole('dialog', { name: '收藏一份快乐' });
  await expect(form).toBeVisible();

  // 起名字的输入框与那句提示都不在了
  await expect(form.getByLabel(/起个名字/)).toHaveCount(0);
  await expect(form.getByText('写多写少都可以，只要是你记得的。')).toHaveCount(0);

  const content = `玻璃罐测试 ${Date.now()}`;
  await form.getByPlaceholder('今天有什么值得偷偷开心的小事吗？').fill(content);
  // 日历网格里选一个可选的日子（未来的日期是禁用的）
  await form.locator('button[aria-pressed]:not([disabled])').first().click();
  await form.getByRole('button', { name: '收进盒子' }).click();
  await expect(form).toBeHidden();

  await expect(jar.getByText(content)).toBeVisible();
});

/* ---------------- 心事信箱 ---------------- */

test('心事信箱：在卡片里写一封并封存', async ({ page }) => {
  await openHome(page);

  await page.getByRole('button', { name: '心事信箱' }).click();
  const box = page.getByRole('dialog', { name: '心事信箱' });
  await expect(box).toBeVisible();

  await box.getByRole('button', { name: '写一封' }).click();
  const compose = page.getByRole('dialog', { name: '写一封心事' });
  await compose
    .getByPlaceholder('比如：今天被一句话刺到了，到现在还没缓过来……')
    .fill('封一封测试用的心事，等一下就被删掉。');
  await compose.getByRole('button', { name: '封起来' }).click();
  await expect(compose).toBeHidden();

  await expect(box.getByText('未拆').first()).toBeVisible();
});

/* ---------------- 树洞广场 ---------------- */

test('树洞：新帖先进待审核，管理员放行后才出现在广场', async ({ page }) => {
  const content = `这条只是想确认审核流程还能用 ${Date.now()}`;
  await gotoHydrated(page, '/square');
  await expect(page.getByRole('heading', { name: '树洞广场' })).toBeVisible();

  await page.getByRole('button', { name: '写一条' }).click();
  const compose = page.getByRole('dialog', { name: '写一条' });
  await compose.getByPlaceholder('今天发生了什么？不用说得很完整。').fill(content);
  await compose.getByRole('button', { name: '发出去' }).click();
  await expect(compose).toBeHidden();

  await expect(page.getByText(content)).toHaveCount(0);

  await unlockAdmin(page);
  const pendingSection = page.locator('section[aria-labelledby="pending-title"]');
  await expect(pendingSection.getByText(content)).toBeVisible();
  await pendingSection.getByRole('button', { name: '放到广场' }).first().click();

  const squareSection = page.locator('section[aria-labelledby="square-title"]');
  await expect(squareSection.getByText(content)).toBeVisible();
});

test('树洞：出现自伤相关表达时先弹出温馨提示，但不拦截发布', async ({ page }) => {
  await gotoHydrated(page, '/square');
  await page.getByRole('button', { name: '写一条' }).click();
  const compose = page.getByRole('dialog', { name: '写一条' });
  await compose
    .getByPlaceholder('今天发生了什么？不用说得很完整。')
    .fill('最近真的不想活了，也不知道跟谁说。');
  await compose.getByRole('button', { name: '发出去' }).click();

  const notice = page.getByRole('dialog', { name: /让我有点担心你/ });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('link', { name: /12356/ })).toBeVisible();
  await expect(notice.getByRole('link', { name: /400-161-9995/ })).toBeVisible();

  await notice.getByRole('button', { name: '仍然发出去' }).click();
  await expect(notice).toBeHidden();
  await expect(compose).toBeHidden();
});

/* ---------------- 全部入口可达 ---------------- */

test('导航里的每个页面入口都能打开，且没有控制台错误', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openHome(page);
  const nav = page.getByRole('navigation', { name: '功能导航' });
  const hrefs = await nav
    .getByRole('link')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
  expect(hrefs.length).toBe(5);

  for (const href of hrefs) {
    const response = await page.goto(href, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), href).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  expect(errors).toEqual([]);
});

/* ---------------- 回归：焦点不能被反复抢走 ---------------- */

test('回归：在弹窗里连续打字，焦点不会跑到右上角的关闭按钮', async ({ page }) => {
  await gotoHydrated(page, '/square');
  await page.getByRole('button', { name: '写一条' }).click();

  const dialog = page.getByRole('dialog', { name: '写一条' });
  await expect(dialog).toBeVisible();

  const nickname = dialog.getByPlaceholder('匿名的人');
  const content = dialog.getByPlaceholder('今天发生了什么？不用说得很完整。');

  await nickname.click();
  // 每个字符间隔 120ms：旧实现会在每次重渲染后约 80ms 把焦点抢到关闭按钮
  await page.keyboard.type('xiaoyu', { delay: 120 });

  await expect(nickname).toBeFocused();
  await expect(nickname).toHaveValue('xiaoyu');

  // 换到正文，确认焦点也能稳定停在这个输入框里
  await content.click();
  await page.keyboard.type('今天还行', { delay: 120 });
  await expect(content).toBeFocused();
  await expect(content).toHaveValue('今天还行');
});

test('回归：卡片里再开弹窗时，Esc 只关掉弹窗、不关掉卡片', async ({ page }) => {
  await openHome(page);
  await page
    .getByRole('navigation', { name: '功能导航' })
    .getByRole('button', { name: '心事信箱' })
    .click();

  const card = page.getByRole('dialog', { name: '心事信箱' });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: '写一封' }).first().click();
  const compose = page.getByRole('dialog', { name: '写一封心事' });
  await expect(compose).toBeVisible();

  const textarea = compose.getByPlaceholder(/今天被一句话刺到了/);
  await textarea.click();
  await page.keyboard.type('写点东西', { delay: 120 });
  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveValue('写点东西');

  await page.keyboard.press('Escape');

  // 只关上面那一层
  await expect(compose).toHaveCount(0);
  await expect(card).toBeVisible();
});
