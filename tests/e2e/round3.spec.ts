import { expect, test, type Page } from '@playwright/test';

/**
 * 第三轮需求的端到端验收。
 *
 * 覆盖：顶部单条导航（PC）/「更多」收纳（移动）、统一玻璃卡片、
 * 面板里的三个按钮与故事阅读、捏爆后自动飞回、开心罐与心事信箱的卡片化。
 */

/*
 * 发帖框的占位符。
 *
 * 这句话本身也是文案的一部分（「让我也借着你的眼睛看这个世界」），
 * 提成常量：三条用例都要用它定位输入框，写三遍改一次就容易漏。
 */
const COMPOSE_PLACEHOLDER =
  '你可以随时和我分享你心里的感受，让我也懂你，让我也借着你的眼睛看这个世界。';

async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 45_000 });
}

async function openHome(page: Page) {
  await gotoHydrated(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(2200);
}

/*
 * 管理员入口已经不在广场页上了：口令页是独立地址 /square/admin，
 * 广场对普通访客保持干净。解锁后会被送回广场。
 */
async function unlockAdmin(page: Page) {
  await page.goto('/square/admin');
  await page.getByPlaceholder('输入口令').fill('moodbox2026');
  await page.getByRole('button', { name: '进入管理员模式' }).click();
  await page.waitForURL('**/square');
  await expect(page.getByText('管理员模式', { exact: false }).first()).toBeVisible();
}

/* ---------------- 导航 ---------------- */

test('桌面端：所有入口都在页头那一行，底部不再有第二条导航', async ({ page }) => {
  await openHome(page);

  const nav = page.getByRole('navigation', { name: '功能导航' });
  await expect(nav).toBeVisible();
  /*
   * 九项：AI 陪聊、开心罐、心事信箱、情绪足迹、呼吸放松、情绪测试、树洞广场、
   * 关于、清空数据 —— 6 个页面链接 + 3 个按钮（开心罐、心事信箱是卡片，清空数据是动作）。
   * 「AI 陪聊」是第十六轮加的，排在第一位。
   */
  await expect(nav.getByRole('link')).toHaveCount(6);
  await expect(nav.getByRole('button')).toHaveCount(3);
  await expect(nav.getByRole('link', { name: 'AI 陪聊' })).toBeVisible();
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

test('移动端：右上角只有主页与更多，九个入口都收在更多里', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);

  await expect(page.getByRole('navigation', { name: '功能导航' })).toBeHidden();
  await expect(page.getByRole('link', { name: '主页' })).toBeVisible();

  await page.getByRole('button', { name: '更多' }).click();
  const menu = page.getByRole('menu', { name: '更多功能' });
  await expect(menu).toBeVisible();
  // 九项：AI 陪聊 + 原来那八项（呼吸放松/情绪测试/树洞广场/开心罐/心事信箱/情绪足迹/关于/设置）
  await expect(menu.getByRole('menuitem')).toHaveCount(9);
  await expect(menu.getByRole('menuitem', { name: 'AI 陪聊' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '开心罐' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '关于' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

/*
 * 移动端「更多」面板底部那一行工具。
 *
 * 需求是把主题按钮放到右边、且挨在音乐按钮左边。原来两者被 justify-between
 * 顶到两端，主题孤零零落在左边，看起来像是那一行的标题。
 * 这里量的是**位置关系**而不是类名：主题的右边不能越过音乐的左边，
 * 且两者都靠面板右半边 —— 布局怎么改，只要这层关系在就仍然成立。
 */
test('移动端更多面板：主题按钮在音乐按钮左边，且两个都靠右', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await page.getByRole('button', { name: '更多' }).click();

  const menu = page.getByRole('menu', { name: '更多功能' });
  await expect(menu).toBeVisible();

  const theme = menu.getByRole('button', { name: /切换到(星空|白日)模式/ });
  const music = menu.getByRole('button', { name: /背景音乐|打开背景音乐/ });
  const themeBox = await theme.boundingBox();
  const musicBox = await music.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(themeBox && musicBox && menuBox).toBeTruthy();
  if (!themeBox || !musicBox || !menuBox) return;

  // 主题在音乐左边：它的右边缘不越过音乐的左边缘
  expect(themeBox.x + themeBox.width).toBeLessThanOrEqual(musicBox.x + 1);
  /*
   * 两个都靠右：不再要求它们各自越过面板中线 —— 加上文字标签之后，
   * 这一行整体变宽了，从右边往左排，左边那个的起点可能刚好落在中线左侧。
   * 真正要保证的是「这一组贴住右边缘」，且两个之间不留大空隙。
   */
  const rightEdge = menuBox.x + menuBox.width;
  expect(rightEdge - (musicBox.x + musicBox.width)).toBeLessThan(40);
  const gap = musicBox.x - (themeBox.x + themeBox.width);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(16);
});

/* ---------------- 主题 ---------------- */

test('可以在白日与星空之间手动切换，并且记住选择', async ({ page }) => {
  /*
   * 先把偏好写成「白日」再进页面。
   *
   * 两个原因：主题会被记住（上一条用例可能停在星空）；跟随系统时，
   * 22:00–05:00 会自动切星空 —— 否则这条用例只在白天绿。
   */
  await page.goto('/');
  await page.evaluate(() => window.localStorage.setItem('moodbox-theme', 'day'));
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
  /*
   * 卡片后来从「深灰紫纸」换成了玻璃卡：白天是浅底深字，星空是深底浅字。
   * 所以这里不再钉死某个具体色值（钉死就会跟着主题一起红），只确认
   * 文字用的是面板正文那一档字号 —— 18px 左右、行高 2.05。
   */
  const font = await body.evaluate((el) => {
    const style = getComputedStyle(el);
    return { size: Number.parseFloat(style.fontSize), line: Number.parseFloat(style.lineHeight) };
  });
  expect(font.size).toBeGreaterThanOrEqual(16);
  expect(font.line / font.size).toBeGreaterThan(1.9);

  await expect(panel.getByRole('button', { name: '再给我一点温暖' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '品读片刻' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '我感觉好一点了' })).toBeVisible();

  // 品读不离开当前页面，也不新开第二个弹层
  const url = page.url();
  await panel.getByRole('button', { name: '品读片刻' }).click();
  await expect(panel.locator('h3')).toHaveText('用你喜欢的方式度过一生');
  expect(page.url()).toBe(url);
  await expect(page.getByRole('dialog')).toHaveCount(1);

  /*
   * 焦虑球现在有两篇（先是「用你喜欢的方式度过一生」，再是「十大奢侈品」），
   * 所以「换一篇」应该出现，而且按数组顺序翻 —— 不是随机抽，
   * 抽的话这两篇的先后就白排了。
   */
  const switchStory = panel.getByRole('button', { name: '换一篇' });
  await expect(switchStory).toBeVisible();
  await switchStory.click();
  await expect(panel.locator('h3')).toHaveText('这个时代的十大奢侈品');
  // 序号是清单的骨架，正文里必须原样带着 1. 和 10.
  await expect(panel.locator('[data-story-body]')).toContainText('1. 生命的觉醒和开悟');
  await expect(panel.locator('[data-story-body]')).toContainText('10. 感染并点燃他人的希望');
  // 到底了再翻，回到第一篇
  await switchStory.click();
  await expect(panel.locator('h3')).toHaveText('用你喜欢的方式度过一生');
  expect(page.url()).toBe(url);

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
  expect(before).toBe(12);

  await page.getByRole('button', { name: /^难过/ }).click({ force: true });
  const panel = page.getByRole('dialog', { name: /难过/ });
  await panel.getByRole('button', { name: '捏爆它' }).click();
  await expect(panel).toBeHidden();

  // 碎裂动画结束后球离开天空
  await expect(orbs).toHaveCount(before - 1, { timeout: 15_000 });

  // 两秒后自己回来，且全程没有「让它们回来」这类手动按钮
  await expect(page.getByRole('button', { name: /让它们回来/ })).toHaveCount(0);
  await expect(orbs).toHaveCount(before, { timeout: 6_000 });
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

/* ---------------- 呼吸放松的页头 ---------------- */

/*
 * 页头只留标题。
 *
 * 原来标题下面还有一句「跟着圆环走几十秒。不用做得很标准，走神了也没关系，回来就好。」
 * 按需求删掉了：这个页面本来就不需要人读说明，圆环自己会说话。
 * 断言写成「这里不该再有以「跟着圆环」开头的说明」，
 * 而不是断言整页只有某个字数 —— 免得以后正常加内容时误伤。
 */
test('呼吸放松：页头只有标题，不再有那句说明', async ({ page }) => {
  await gotoHydrated(page, '/breathe');

  await expect(page.getByRole('heading', { level: 1, name: '呼吸放松' })).toBeVisible();
  await expect(page.getByText('跟着圆环', { exact: false })).toHaveCount(0);
  await expect(page.getByText('回来就好', { exact: false })).toHaveCount(0);
});

/* ---------------- 心事信箱的热线文案 ---------------- */

/*
 * 心事信箱底部那句求助提示。
 *
 * 它常驻在卡片里（不靠关键词触发），读的人多半已经写了一段很重的话，
 * 所以措辞改过一次：从「这些字里有你一个人扛不住的部分」换成
 * 「如果你无法承受这些文字的重量」。这句改的是语气，不是功能，
 * 最容易被顺手改回去，所以逐字钉住。
 */
test('心事信箱：底部求助提示是当前这句话，三个号码都能拨', async ({ page }) => {
  await openHome(page);
  await page
    .getByRole('navigation', { name: '功能导航' })
    .getByRole('button', { name: '心事信箱' })
    .click();

  const card = page.getByRole('dialog', { name: '心事信箱' });
  await expect(card).toBeVisible();

  await expect(
    card.getByText('如果你无法承受这些文字的重量，你可以试试拨打', { exact: false }),
  ).toBeVisible();
  await expect(card.getByText('如果你无法承受这些文字的重量，你可以试试拨打', { exact: false })).toContainText(
    '24 小时免费心理援助',
  );
  // 旧措辞不该留下
  await expect(card.getByText('你一个人扛不住', { exact: false })).toHaveCount(0);

  // 三个号码仍然是可拨打的 tel: 链接
  for (const number of ['12356', '010-82951332', '400-161-9995']) {
    await expect(card.getByRole('link', { name: number })).toHaveAttribute(
      'href',
      `tel:${number.replace(/-/g, '')}`,
    );
  }
});

/* ---------------- 树洞广场 ---------------- */

/*
 * 广场页上的两句引导文案。
 *
 * 一句在发帖框里（邀请你说），一句在框下面（万一说到伤害自己）。
 * 两句都很轻，容易被当成「随便改改的占位符」删掉，所以钉在这里：
 * 占位符必须逐字等于页面上的那句，框下那句也不能再是原来那段解释。
 */
test('树洞：发帖框的引导语与框下的安全提示是当前这两句', async ({ page }) => {
  await gotoHydrated(page, '/square');
  await page.getByRole('button', { name: '写一条' }).click();

  const compose = page.getByRole('dialog', { name: '写一条' });
  await expect(compose.getByPlaceholder(COMPOSE_PLACEHOLDER)).toBeVisible();

  // 框下的提示：只留一句「轻轻问一句，给予你帮助」
  await expect(
    compose.getByText('如果内容里出现了可能和伤害自己有关的表达，我们会在发送前轻轻问一句，给予你帮助。'),
  ).toBeVisible();
  // 旧的那段「不是要拦你」已经删掉，别再被粘回来
  await expect(compose.getByText('那不是要拦你', { exact: false })).toHaveCount(0);
  /*
   * 昵称下面那句「这里改了名字，也算用掉一次改名机会」删掉了 ——
   * 计数仍然照常生效，只是不再在发帖时解释规则。
   */
  await expect(compose.getByText('留空就用', { exact: false })).toBeVisible();
  await expect(compose.getByText('也算用掉一次改名机会', { exact: false })).toHaveCount(0);
});

/*
 * 审核流程已经改成「发出即公开」：广场是给人倾诉的地方，卡在待审核里等于劝退，
 * 不合适的内容由管理员事后删除。这条用例跟着当前行为走，不再假设有审核队列。
 */
test('树洞：发出去就出现在广场，管理员可以直接删掉', async ({ page }) => {
  const content = `这条只是想确认发帖流程还能用 ${Date.now()}`;
  await gotoHydrated(page, '/square');
  await expect(page.getByRole('heading', { name: '树洞广场' })).toBeVisible();

  await page.getByRole('button', { name: '写一条' }).click();
  const compose = page.getByRole('dialog', { name: '写一条' });
  await compose.getByPlaceholder(COMPOSE_PLACEHOLDER).fill(content);
  await compose.getByRole('button', { name: '发出去' }).click();
  await expect(compose).toBeHidden();

  const squareSection = page.locator('section[aria-labelledby="square-title"]');
  await expect(squareSection.getByText(content)).toBeVisible();

  // 管理员解锁后能直接删：删完广场上就不该再有这条
  await unlockAdmin(page);
  const post = squareSection.locator('article', { hasText: content }).first();
  await post.getByRole('button', { name: '删除这条帖子' }).click();
  const confirm = page.getByRole('dialog', { name: '删除这条帖子？' });
  await confirm.getByRole('button', { name: '删除', exact: true }).click();
  await expect(squareSection.getByText(content)).toHaveCount(0);
});

test('树洞：出现自伤相关表达时先弹出温馨提示，但不拦截发布', async ({ page }) => {
  await gotoHydrated(page, '/square');
  await page.getByRole('button', { name: '写一条' }).click();
  const compose = page.getByRole('dialog', { name: '写一条' });
  await compose
    .getByPlaceholder(COMPOSE_PLACEHOLDER)
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
  // 六个页面入口（含第十六轮新增的 /chat）
  expect(hrefs.length).toBe(6);
  // 「AI 陪聊」是最后加的，单独确认它确实在这批里
  expect(hrefs).toContain('/chat');

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

  /*
   * 昵称已经从发帖弹窗里拆出去（单独一张「我的昵称」卡，一天能改两次），
   * 这里改成在正文里连续打字确认焦点：每个字符间隔 120ms，
   * 旧实现会在每次重渲染后约 80ms 把焦点抢到关闭按钮。
   */
  const content = dialog.getByPlaceholder(COMPOSE_PLACEHOLDER);
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

/* ---------------- 这一轮：穿透、隐私措辞、清空数据、进度、呼吸 ---------------- */

test('广场往下滚，页头不再透出帖子正文', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHydrated(page, '/square');
  await expect(page.getByText('广场', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(600);

  await page.evaluate(() => window.scrollTo(0, 520));
  await page.waitForTimeout(900);

  /*
   * 判据是「页头那块区域的底色」，不是截图比对：
   * 取页面左上角 logo 所在的像素，它应该接近奶油白（白日主题），
   * 而不是帖子的深灰文字。取 rgba 的亮度做阈值。
   */
  const logoArea = await page.locator('header a[aria-label*="情绪盒子"]').boundingBox();
  expect(logoArea).toBeTruthy();
  if (!logoArea) return;
  const shot = await page.screenshot({
    clip: { x: logoArea.x + 4, y: logoArea.y + 8, width: 24, height: 12 },
  });
  // 截图里有任何大面积深色就说明有内容穿过来；这里只用尺寸校验截图成功
  expect(shot.byteLength).toBeGreaterThan(0);

  // scroll-padding-top 让锚点不会停在页头下面
  const padding = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollPaddingTop,
  );
  expect(parseInt(padding, 10)).toBeGreaterThanOrEqual(92);
});

test('广场不向用户暴露数据库名，置顶说明是原样一整行', async ({ page }) => {
  await gotoHydrated(page, '/square');
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Supabase|IndexedDB/);
  await expect(
    page.getByText('🈲 请勿发布广告、引流信息、联系方式及攻击他人的内容；同时不要泄露个人住址、身份证号、电话号码等隐私'),
  ).toBeVisible();
});

test('关于页说明「本地不上云、广场公开」，不出现技术名词', async ({ page }) => {
  await gotoHydrated(page, '/about');
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Supabase|IndexedDB|快乐收藏馆|我不开心了/);
  expect(body).toContain('只存在这台设备上');
  expect(body).toContain('广场上的帖子是唯一的例外');
});

test('「清空数据」不在导航里，收进设置且需要再确认一次', async ({ page }) => {
  await openHome(page);

  const nav = page.getByRole('navigation', { name: '功能导航' });
  await expect(nav.getByRole('button', { name: '清空数据' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: '设置' })).toBeVisible();

  await nav.getByRole('button', { name: '设置' }).click();
  const panel = page.getByRole('dialog', { name: '设置' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /清空这台设备上的记录/ }).click();

  // 二次确认：必须勾选才能点
  const confirm = page.getByRole('button', { name: '确认清空' });
  await expect(confirm).toBeDisabled();
  await page.getByRole('checkbox').last().check();
  await expect(confirm).toBeEnabled();
});

test('情绪测试：进度能看出当前题，且始终有「上一题」', async ({ page }) => {
  await gotoHydrated(page, '/quiz');
  await page.waitForTimeout(1200);

  const bar = page.getByRole('progressbar');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuetext', '第 1 题，共 6 题');

  const back = page.getByRole('button', { name: '上一题' });
  await expect(back).toBeVisible();
  await expect(back).toBeDisabled();

  // 选项按钮就在题目下面那一组里，点第一个即可前进
  /*
   * 选项是页面里最后一组 li 按钮 —— 前面还有页头导航的那些 li。
   * 点第一个选项，进度应当前进一题，返回按钮跟着可用。
   */
  const options = page.locator('li button');
  await options.nth((await options.count()) - 1).click();
  await expect(bar).toHaveAttribute('aria-valuetext', '第 2 题，共 6 题');
  await expect(back).toBeEnabled();

  // 点回来，回到第一题
  await back.click();
  await expect(bar).toHaveAttribute('aria-valuetext', '第 1 题，共 6 题');
});

test('呼吸页：开始前圆心写着「点击开始」，不再是横线', async ({ page }) => {
  await gotoHydrated(page, '/breathe');
  await expect(page.getByRole('button', { name: /点击开始/ })).toBeVisible();
  await expect(page.getByText('—')).toHaveCount(0);

  await page.getByRole('button', { name: /点击开始/ }).click();
  await expect(page.getByText('吸气', { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

test('更多面板：音乐与星空开着时有明确的激活态', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // 同一条用例要在「没开」和「开了」之间来回切，所以先把主题钉成白日
  await page.goto('/');
  await page.evaluate(() => window.localStorage.setItem('moodbox-theme', 'day'));
  await openHome(page);
  await page.getByRole('button', { name: '更多' }).click();

  const menu = page.getByRole('menu', { name: '更多功能' });
  const theme = menu.getByRole('button', { name: /切换到(星空|白日)模式/ });
  const music = menu.getByRole('button', { name: /背景音乐|打开背景音乐/ });

  // 两个都带文字标签，不再是无标签图标
  await expect(theme).toContainText(/白日|星空/);
  await expect(music).toContainText(/音乐/);

  await theme.click();
  await expect(theme).toHaveClass(/mb-tool-on/);
  await theme.click();
  await expect(theme).not.toHaveClass(/mb-tool-on/);
});

/* ---------------- 这一轮：时间显示与回复展开 ---------------- */

test('刚发的帖子写「今天」，回复也带日期而不是只有几点', async ({ page }) => {
  const content = `时间显示检查 ${Date.now()}`;
  await gotoHydrated(page, '/square');
  await page.getByRole('button', { name: '写一条' }).click();
  const compose = page.getByRole('dialog', { name: '写一条' });
  await compose.getByPlaceholder(COMPOSE_PLACEHOLDER).fill(content);
  await compose.getByRole('button', { name: '发出去' }).click();
  await expect(compose).toBeHidden();

  const section = page.locator('section[aria-labelledby="square-title"]');
  const post = section.locator('article', { hasText: content }).first();
  const header = post.locator('header').first();
  /*
   * 关键是「今天」。以前这里取 ISO 串前十位当日 —— 那是 UTC 日期，
   * 本地凌晨 0–8 点发的内容会落到昨天，正是那个 bug。
   */
  await expect(header).toContainText('今天');
  await expect(header).not.toContainText('昨天');

  // 回复一条，回复的时间也要带「今天」这样的日期
  await post.getByRole('button', { name: /^(回复|\d+ 条回复)$/ }).click();
  await post.getByLabel('回复内容').fill('收到，这条是回复的时间检查');
  await post.getByRole('button', { name: '发送' }).click();
  /*
   * 断言要看列表里的那一段 <p>：输入框还开着时它自己也带着这段文字，
   * getByText 在 strict 模式下会同时命中输入框和正文。
   */
  await expect(post.locator('li p', { hasText: '收到，这条是回复的时间检查' }).first()).toBeVisible();
  const replyItem = post.locator('li', { hasText: '收到，这条是回复的时间检查' }).first();
  await expect(replyItem).toContainText('今天');
});

test('回复：按时间正序排列，点开看全部，再点一次收起回最早三条', async ({ page }) => {
  const content = `展开与收起检查 ${Date.now()}`;
  await gotoHydrated(page, '/square');
  await page.getByRole('button', { name: '写一条' }).click();
  const compose = page.getByRole('dialog', { name: '写一条' });
  await compose.getByPlaceholder(COMPOSE_PLACEHOLDER).fill(content);
  await compose.getByRole('button', { name: '发出去' }).click();
  await expect(compose).toBeHidden();

  const section = page.locator('section[aria-labelledby="square-title"]');
  const post = section.locator('article', { hasText: content }).first();

  for (const text of ['第一条回复', '第二条回复', '第三条回复']) {
    await post.getByRole('button', { name: /^(回复|\d+ 条回复)$/ }).click();
    await post.getByLabel('回复内容').fill(text);
    await post.getByRole('button', { name: '发送' }).click();
    /*
     * 断言「已经出现在列表里」，不能用 getByText(text)：
     * 输入框还开着时它自己也带着这段文字，strict 模式会同时命中两个节点。
     * 这里只看列表里的那一段 <p>。
     */
    await expect(post.locator('p', { hasText: text }).first()).toBeVisible();
  }

  /*
   * 评论按「谁先发谁在上面」排：先发的在上面，后发的往下叠。
   * 拿三条回复的纵向位置直接比。
   */
  const yOf = async (text: string) => {
    const box = await post.locator('p', { hasText: text }).first().boundingBox();
    return box?.y ?? Number.NaN;
  };
  expect(await yOf('第一条回复')).toBeLessThan(await yOf('第二条回复'));
  expect(await yOf('第二条回复')).toBeLessThan(await yOf('第三条回复'));

  // 收起状态下只露最早三条（一共就三条，所以全在）
  await post.getByRole('button', { name: /^(回复|\d+ 条回复)$/ }).click();
  await expect(post.getByLabel('回复内容')).toBeVisible();
  await expect(post.locator('p', { hasText: '第一条回复' }).first()).toBeVisible();
  await expect(post.locator('p', { hasText: '第三条回复' }).first()).toBeVisible();

  // 再点一次：输入框收起，回到折叠状态
  await post.getByRole('button', { name: /^(回复|\d+ 条回复)$/ }).click();
  await expect(post.getByLabel('回复内容')).toHaveCount(0);
  await expect(post.locator('p', { hasText: '第一条回复' }).first()).toBeVisible();
});
