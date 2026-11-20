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
 * - `region`：IP 归属地，精确到市（如「广东·深圳」），用于在帖子旁边标一个位置。
 *
 * 归属地**每次打开页面都重新查一遍**，不做任何缓存：换了网络（公司 → 手机热点、
 * 北京 → 深圳出差）之后刷新一下就该显示新的城市。查询只发一个 GET，
 * 不携带任何本地内容；设置 `NEXT_PUBLIC_MOODBOX_NO_GEO=1` 可以整段关掉。
 *
 * 注意缓存的是「身份」而不是「归属地」：同一次页面会话里多处调用只查一次，
 * 但刷新页面一定会重查 —— `region` 不写进 localStorage 就是这个意思。
 */

export interface VisitorIdentity {
  /** 稳定标识，用于判断「这条是不是我发的」，不要展示 */
  key: string;
  /** 4 位字母数字后缀，用于「匿名·K7Q2」 */
  suffix: string;
  /** 展示用昵称：匿名·K7Q2 */
  alias: string;
  /** IP 归属地（市级，如「广东·深圳」），拿不到时为 null */
  region: string | null;
  /** 身份来源：解析到了 IP 归属地 / 只能退回本机 */
  source: 'ip' | 'device';
}

const DEVICE_KEY = 'moodbox:device:v1';

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
 * 拼成「省·市」，没有市就只写省。
 *
 * 只说省份等于没说 —— 「广东」下面几千万人，标在帖子上没有任何"同乡"的意思。
 * 城市一级才有用，所以这里保留 city。代价是准确性不如省级：手机流量、
 * 企业专线、加速器都可能让城市判偏，这一点在界面的 title 里如实写了。
 */
export function buildRegion(country?: unknown, province?: unknown, city?: unknown): string | null {
  const countryName = typeof country === 'string' ? country.trim() : '';
  const provinceName = typeof province === 'string' ? shortenPlace(province.trim()) : '';
  const cityName = typeof city === 'string' ? shortenPlace(city.trim()) : '';

  // 国内只显示省市，去掉「中国」两个字：这一栏是给"同乡的人"看的
  if (countryName === '中国' || countryName === 'China') {
    const parts = [provinceName, cityName !== provinceName ? cityName : ''].filter(
      (part) => part && part !== '未知',
    );
    const joined = Array.from(new Set(parts)).join('·');
    return joined ? joined.slice(0, 20) : null;
  }

  const parts = [countryName, provinceName, cityName].filter(
    (part) => part && part !== '未知',
  );
  // 去重（Tokyo / Tokyo 只留一个），但保留国家名 —— 否则只剩「Tokyo」，
  // 与国内那条「广东·深圳」的写法不对齐
  const cleaned = Array.from(new Set(parts)).join('·');
  return cleaned ? cleaned.slice(0, 20) : null;
}

/**
 * 归属地只看一个源：`api.ip.sb`。
 *
 * 之前是三家并行竞速，谁快用谁 —— 快是快了，代价是同一个人的归属地会在
 * 「广东」和「广东·深圳」之间来回跳，城市一级更是三家各说各的。
 * 既然要精确到市，就只能固定一个源，不然连自己都对不上自己。
 *
 * `api.ip.sb/geoip` 不需要 key、允许浏览器直连，返回里有 city 字段。
 */
interface GeoSource {
  url: string;
  /** 超时上限：不让一次查询把广场首屏拖住 */
  timeout: number;
  read: (data: Record<string, unknown>) => {
    ip: unknown;
    country: unknown;
    region: unknown;
    city: unknown;
  };
}

const GEO_SOURCE: GeoSource = {
  url: 'https://api.ip.sb/geoip',
  timeout: 3000,
  read: (data) => ({
    ip: data.ip,
    country: data.country,
    // ip.sb 的 region 就是省、city 就是市
    region: data.region,
    city: data.city,
  }),
};

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
    // 既没有 IP 也没有归属地，等于这次什么都没拿到
    if (!ip && !region) return null;
    return { ip, region };
  } catch {
    // 超时、断网、被 CORS 拦住都走这里：当作没有归属地
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function lookupGeo(): Promise<GeoLookup> {
  const empty: GeoLookup = { ip: null, region: null };
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return empty;
  if (process.env.NEXT_PUBLIC_MOODBOX_NO_GEO === '1') return empty;
  return (await fetchGeo(GEO_SOURCE)) ?? empty;
}

let pending: Promise<VisitorIdentity> | null = null;
/** 本次页面会话的身份；刷新页面就没了，所以每次刷新都会重查归属地 */
let resolved: VisitorIdentity | null = null;

/**
 * 拿到当前访客身份。
 *
 * 同一个页面里多处调用只解析一次（含网络请求）；**不写 localStorage**，
 * 因此每次刷新都会用 ip.sb 的最新结果重新算一遍归属地。
 *
 * key 与 region 是分开来的：key 来自本机种子（永远稳定，换台设备才变），
 * region 来自网络（可能为空、每次刷新都可能不同）。这样"归属地查不到"
 * 只会让帖子少一个城市标签，不会让一个人变成另一个人。
 */
export function resolveVisitor(): Promise<VisitorIdentity> {
  if (typeof window === 'undefined') {
    return Promise.resolve(identityFromSeed('server', null, 'device'));
  }

  if (resolved) return Promise.resolve(resolved);

  if (!pending) {
    pending = (async () => {
      const seed = readDeviceSeed();
      const geo = await lookupGeo();
      const identity = identityFromSeed(seed, geo.region, geo.ip ? 'ip' : 'device');
      resolved = identity;
      return identity;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

/**
 * 只在测试里用：丢掉当前会话的身份。
 * 正常运行时不调用 —— 想换归属地，刷新页面就够了。
 */
export function RESET_VISITOR_FOR_TESTS(): void {
  resolved = null;
  pending = null;
}
