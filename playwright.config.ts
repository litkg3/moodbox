import { defineConfig, devices } from '@playwright/test';

/**
 * 端到端测试。
 *
 * 默认复用系统已安装的 Chrome（channel: 'chrome'），避免下载浏览器内核。
 * 如果你的机器上没有 Chrome，可先执行 `npx playwright install chromium`，
 * 然后把下面的 channel 去掉即可使用 Playwright 自带的 Chromium。
 */
const PORT = Number(process.env.E2E_PORT ?? 3107);
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

/*
 * 本机若配置了 HTTP_PROXY，Playwright 探测「本地端口是否已就绪」时也会走代理，
 * 于是把已经跑起来的服务误判成“没起”，转而再启一个占不到端口的 dev，
 * 最终以 “Timed out waiting from config.webServer” 失败。
 * 这里强制把回环地址排除在代理之外，测试就不必再依赖外部环境变量。
 */
const loopback = '127.0.0.1,localhost,::1';
process.env.NO_PROXY = [process.env.NO_PROXY, loopback].filter(Boolean).join(',');
process.env.no_proxy = process.env.NO_PROXY;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    channel: 'chrome',
    launchOptions: { args: ['--no-proxy-server'] },
    /*
     * 每个测试上下文都预置 `moodbox-force-local=1`。
     *
     * 原因：这套用例断言的是"广场在本机模式下"的行为（待审核 → 放行、拥抱 +1 …）。
     * 如果开发者本地在 .env.local 里配了真实的 Supabase，应用会切到云端：
     * 口令变成数据库里的那个、数据也不再是本机的，用例就会因为环境而红。
     * 测试必须只依赖代码，不依赖"你有没有配云端"。
     *
     * 云端路径由 tests/unit/supabase.test.ts 覆盖（打桩 RPC，不依赖网络）。
     */
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [{ name: 'moodbox-force-local', value: '1' }],
        },
      ],
    },
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
