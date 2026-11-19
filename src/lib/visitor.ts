'use client';

/**
 * 匿名访客身份。
 *
 * 树洞广场没有账号体系，但「能删掉自己发的东西」需要一个稳定的身份。
 *
 * ⚠️ 这里的 `key` **只由本机种子派生**，绝不掺 IP。
 * 之前是「IP 优先、拿不到才退回本机种子」，结果刷新页面时归属地接口一旦超时，
 * 种子就从 IP 换成了本机随机值 —— 同一个人的 key 变了，`mine` 全部变 false，
 * 自己刚发的帖子立刻删不掉。把 IP 从种子里摘出去，刷新多少次都是同一个人；
 * IP 只用来估算省份，纯展示。
 *
 * - `key`：由本机种子派生的稳定哈希（16 位十六进制），只在本地与提交时使用，
 *   云端也只会把它再哈希一次存进 `visitor_hash`，不会展示给任何人；
 * - `suffix`：从同一个种子里取 4 位字母数字，用作「匿名·K7Q2」的后缀；
 * - `region`：IP 归属地，只到省份（如「广东」），用于在帖子旁边标一个位置。
 *
 * 隐私说明：归属地查询只发一个 GET，不携带任何本地内容。
 * 设置 `NEXT_PUBLIC_MOODBOX_NO_GEO=1` 可以整段关掉，此时只有本机身份。
 */

export interface VisitorIdentity {
  /** 稳定标识，用于判断「这条是不是我发的」，不要展示 */
  key: string;
  /** 4 位字母数字后缀，用于「匿名·K7Q2」 */
  suffix: string;
  /** 展示用昵称：匿名·K7Q2 */
  alias: string;
  /** IP 归属地（省级），拿不到时为 null */
  region: string | null;
  /** 身份来源：解析到了 IP 归属地 / 只能退回本机 */
  source: 'ip' | 'device';
}

const CACHE_KEY = 'moodbox:visitor:v2';
const DEVICE_KEY = 'moodbox:device:v1';
const CACHE_TTL = 12 * 60 * 60 * 1000;

/** 去掉 I/O/0/1 这些容易看错的字符，避免「这是 l 还是 1」。 */
const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** FNV-1a，32 位。只求稳定，不用于任何安全用途。 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 由种子得到 4 位展示后缀；同一种子永远得到同一结果。 */
export function visitorSuffix(seed: string): string {
  let hash = fnv1a(`suffix:${seed}`);
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += SUFFIX_ALPHABET[hash % SUFFIX_ALPHABET.length];
    // 每取一位再混一次，避免只靠整除导致高位永远用不到
    hash = fnv1a(`${seed}:${index}:${hash}`);
  }
  return suffix;
}

/** 由种子得到 16 位稳定标识。 */
export function visitorKey(seed: string): string {
  const head = fnv1a(`key:${seed}`).toString(16).padStart(8, '0');
  const tail = fnv1a(`key2:${seed}`).toString(16).padStart(8, '0');
  return `${head}${tail}`;
}

/** 纯函数版：给定种子与归属地，直接算出身份（测试与降级都用它）。 */
export function identityFromSeed(
  seed: string,
  region: string | null,
  source: VisitorIdentity['source'],
): VisitorIdentity {
  const suffix = visitorSuffix(seed);
  return {
    key: visitorKey(seed),
    suffix,
    alias: `匿名·${suffix}`,
    region,
    source,
  };
}

function readDeviceSeed(): string {
  try {
    const cached = window.localStorage.getItem(DEVICE_KEY);
    if (cached) return cached;
    const bytes = new Uint8Array(8);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    const seed = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    window.localStorage.setItem(DEVICE_KEY, seed);
    return seed;
  } catch {
    // 无痕模式 / 禁用了存储：每次进页面换一个身份也可以接受
    return `fallback-${Date.now()}`;
  }
}

interface GeoLookup {
  ip: string | null;
  region: string | null;
}

/** 「广东省」→「广东」、「深圳市」→「深圳」，只保留最短的地名。 */
function shortenPlace(name: string): string {
  if (name.length <= 2) return name;
  return name.replace(/(维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治区|省|市)$/u, '') || name;
}

/**
 * 只保留到「省」一级。
 *
 * 各家 IP 库对城市的判定经常差几十上百公里（尤其是手机流量、企业专线、
 * 或者被代理/加速器绕过的线路），写上城市的反而让人一眼看出"这不对"。
 * 省一级的准确率高得多，也够表达"同一个地方的人"这层意思。
 */
function buildRegion(country?: unknown, province?: unknown, city?: unknown): string | null {
  void city;
  const countryName = typeof country === 'string' ? country.trim() : '';
  const provinceName = typeof province === 'string' ? shortenPlace(province.trim()) : '';

  // 国内只显示省份，去掉「中国」两个字：这一栏是给"同乡的人"看的
  const parts = countryName === '中国' || countryName === 'China'
    ? [provinceName]
    : [countryName];

  const cleaned = Array.from(new Set(parts.filter((part) => part && part !== '未知'))).join('·');
  return cleaned ? cleaned.slice(0, 20) : null;
}

/**
 * 归属地查询的候选源，同时发、谁先给结果用谁。
 *
 * 只用一家的时候偏差很明显：单库对移动流量、教育网、云主机的判定经常落到
 * 省会甚至隔壁省。三家串行试的话，最坏要等三个超时（七八秒），
 * 而身份又要等这次查询 —— 发帖会被拖住。并行竞速之后等待时间
 * 只等于"最快那家的响应"，一般几百毫秒。
 *
 * 三家都支持浏览器直连（CORS），也都不需要 key。
 */
interface GeoSource {
  id: string;
  url: string;
  /** 单源超时：串起来最多三秒多，不会把广场首屏拖住 */
  timeout: number;
  read: (data: Record<string, unknown>) => {
    ip: unknown;
    country: unknown;
    region: unknown;
    city: unknown;
  };
}

const GEO_SOURCES: readonly GeoSource[] = [
  {
    id: 'ipapi',
    url: 'https://ipapi.co/json/?lang=zh-CN',
    timeout: 2600,
    read: (data) => ({
      ip: data.ip,
      country: data.country_name,
      region: data.region,
      city: data.city,
    }),
  },
  {
    id: 'ipsb',
    url: 'https://api.ip.sb/geoip',
    timeout: 2600,
    read: (data) => ({
      ip: data.ip,
      country: data.country,
      region: data.region,
      city: data.city,
    }),
  },
  {
    id: 'ipwho',
    url: 'https://ipwho.is/?lang=zh-CN',
    timeout: 2600,
    read: (data) => ({
      ip: data.ip,
      country: data.country,
      region: data.region,
      city: data.city,
    }),
  },
];

async function fetchGeo(source: GeoSource): Promise<GeoLookup | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), source.timeout);
  try {
    const response = await window.fetch(source.url, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    if (!data || data.success === false || data.error === true) return null;
    const parsed = source.read(data);
    const region = buildRegion(parsed.country, parsed.region, parsed.city);
    const ip = typeof parsed.ip === 'string' && parsed.ip.trim() ? parsed.ip.trim() : null;
    // 既没有 IP 也没有省份，等于这个源什么都没给，继续试下一个
    if (!ip && !region) return null;
    return { ip, region };
  } catch {
    // 超时、断网、被 CORS 拦住都走这里：换下一个源
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function lookupGeo(): Promise<GeoLookup> {
  const empty: GeoLookup = { ip: null, region: null };
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return empty;
  if (process.env.NEXT_PUBLIC_MOODBOX_NO_GEO === '1') return empty;

  return new Promise<GeoLookup>((resolve) => {
    let settled = false;
    let outstanding = GEO_SOURCES.length;

    const finish = (value: GeoLookup) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    for (const source of GEO_SOURCES) {
      void fetchGeo(source)
        .then((result) => {
          // 谁先答上来就用谁；还没答的直接放弃，不必等它超时
          if (result) finish(result);
        })
        .finally(() => {
          outstanding -= 1;
          // 全都没结果时，别让 Promise 悬着
          if (outstanding === 0) finish(empty);
        });
    }
  });
}

function readCache(): VisitorIdentity | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisitorIdentity & { at?: number };
    if (!parsed?.key || !parsed?.suffix || !parsed?.alias) return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > CACHE_TTL) return null;
    return {
      key: parsed.key,
      suffix: parsed.suffix,
      alias: parsed.alias,
      region: typeof parsed.region === 'string' ? parsed.region : null,
      source: parsed.source === 'ip' ? 'ip' : 'device',
    };
  } catch {
    return null;
  }
}

function writeCache(identity: VisitorIdentity): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...identity, at: Date.now() }));
  } catch {
    // 存不了就算了，下次再算一遍
  }
}

let pending: Promise<VisitorIdentity> | null = null;

/**
 * 拿到当前访客身份。
 *
 * 同一页面里多处调用只会真正解析一次（含网络请求）；
 * 结果按 12 小时缓存，避免每次进广场都去查 IP。
 *
 * key 与 region 是分开来的：key 来自本机种子（永远稳定），region 来自网络
 * （可能为空）。这样"归属地查不到"只会让帖子少一个省份标签，
 * 不会让一个人变成另一个人。
 */
export function resolveVisitor(): Promise<VisitorIdentity> {
  if (typeof window === 'undefined') {
    return Promise.resolve(identityFromSeed('server', null, 'device'));
  }

  const cached = readCache();
  if (cached) return Promise.resolve(cached);

  if (!pending) {
    pending = (async () => {
      const seed = readDeviceSeed();
      const geo = await lookupGeo();
      const identity = identityFromSeed(seed, geo.region, geo.ip ? 'ip' : 'device');
      writeCache(identity);
      return identity;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}
