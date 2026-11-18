'use client';

/**
 * 匿名访客身份。
 *
 * 树洞广场没有账号体系，但「能删掉自己发的东西」需要一个稳定的身份。
 * 这里用「IP 归属地 + 一段哈希」来近似：
 *
 * - `key`：由 IP 派生的稳定哈希（16 位十六进制），只在本地与提交时使用，
 *   云端也只会把它再哈希一次存进 `visitor_hash`，不会展示给任何人；
 * - `suffix`：从同一个种子里取 4 位字母数字，用作「匿名·K7Q2」的后缀。
 *   同一个 IP 在同一段时间里拿到的后缀是一致的，别人能认出「这是同一个人」，
 *   但无法反推出 IP；
 * - `region`：IP 归属地，只到城市（如「广东·深圳」），用于在帖子旁边标一个位置。
 *
 * 如果取不到 IP（断网、被拦截、脚本环境），就退回一个存在本机随机种子上，
 * 后缀依然是稳定的，只是 `region` 为空 —— 功能不因此失效。
 *
 * 隐私说明：归属地查询走 `ipwho.is` 的公开接口，只发送请求本身，不携带任何
 * 本地内容。设置 `NEXT_PUBLIC_MOODBOX_NO_GEO=1` 可以整段关掉这次外部请求，
 * 此时只有本机随机身份。
 */

export interface VisitorIdentity {
  /** 稳定标识，用于判断「这条是不是我发的」，不要展示 */
  key: string;
  /** 4 位字母数字后缀，用于「匿名·K7Q2」 */
  suffix: string;
  /** 展示用昵称：匿名·K7Q2 */
  alias: string;
  /** IP 归属地（城市级），拿不到时为 null */
  region: string | null;
  /** 身份来源：解析到了 IP / 只能退回本机随机 */
  source: 'ip' | 'device';
}

const CACHE_KEY = 'moodbox:visitor:v1';
const DEVICE_KEY = 'moodbox:device:v1';
const CACHE_TTL = 12 * 60 * 60 * 1000;
const GEO_TIMEOUT = 3500;
const GEO_ENDPOINT = 'https://ipwho.is/?lang=zh-CN';

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

function buildRegion(country?: unknown, province?: unknown, city?: unknown): string | null {
  const countryName = typeof country === 'string' ? country.trim() : '';
  const provinceName = typeof province === 'string' ? shortenPlace(province.trim()) : '';
  const cityName = typeof city === 'string' ? shortenPlace(city.trim()) : '';

  // 国内只显示「省·市」，去掉「中国」两个字：这一栏是给"同城的人"看的
  const parts = countryName === '中国' || countryName === 'China'
    ? [provinceName, cityName]
    : [countryName, provinceName];

  const cleaned = Array.from(new Set(parts.filter((part) => part && part !== '未知'))).join('·');
  return cleaned ? cleaned.slice(0, 20) : null;
}

async function lookupGeo(): Promise<GeoLookup> {
  const empty: GeoLookup = { ip: null, region: null };
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return empty;
  if (process.env.NEXT_PUBLIC_MOODBOX_NO_GEO === '1') return empty;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), GEO_TIMEOUT);
  try {
    const response = await window.fetch(GEO_ENDPOINT, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok) return empty;
    const data = (await response.json()) as {
      success?: boolean;
      ip?: unknown;
      country?: unknown;
      region?: unknown;
      city?: unknown;
    };
    if (!data || data.success === false) return empty;
    return {
      ip: typeof data.ip === 'string' && data.ip.trim() ? data.ip.trim() : null,
      region: buildRegion(data.country, data.region, data.city),
    };
  } catch {
    // 超时、断网、被 CORS 拦住都走这里：不影响发帖，只是没有归属地
    return empty;
  } finally {
    window.clearTimeout(timer);
  }
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
 */
export function resolveVisitor(): Promise<VisitorIdentity> {
  if (typeof window === 'undefined') {
    return Promise.resolve(identityFromSeed('server', null, 'device'));
  }

  const cached = readCache();
  if (cached) return Promise.resolve(cached);

  if (!pending) {
    pending = (async () => {
      const geo = await lookupGeo();
      const identity = identityFromSeed(
        geo.ip ?? `device:${readDeviceSeed()}`,
        geo.region,
        geo.ip ? 'ip' : 'device',
      );
      writeCache(identity);
      return identity;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}
