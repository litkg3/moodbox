import { describe, expect, it } from 'vitest';
import { buildRegion, identityFromSeed, visitorKey, visitorSuffix } from '@/lib/visitor';

/**
 * 匿名身份的纯函数部分。
 *
 * 这里不碰网络也不碰 localStorage：归属地解析是尽力而为的，
 * 真正必须稳定的是「同一个种子 → 同一个后缀 / 同一个 key」。
 */
describe('匿名访客身份', () => {
  it('同一个种子永远得到同一个后缀，长度固定为 4', () => {
    const first = visitorSuffix('1.2.3.4');
    expect(first).toHaveLength(4);
    expect(visitorSuffix('1.2.3.4')).toBe(first);
    // 只允许大写字母与数字，且不含容易看错的 I / O / 0 / 1
    expect(first).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });

  it('不同种子会落到不同后缀（抽样检查，不追求绝对无碰撞）', () => {
    const seeds = ['1.1.1.1', '2.2.2.2', '3.3.3.3', 'device:abc', 'device:def'];
    const suffixes = new Set(seeds.map((seed) => visitorSuffix(seed)));
    expect(suffixes.size).toBeGreaterThanOrEqual(4);
  });

  it('key 是 16 位十六进制，且与后缀互不重复推导', () => {
    expect(visitorKey('1.2.3.4')).toMatch(/^[0-9a-f]{16}$/);
    expect(visitorKey('1.2.3.4')).not.toBe(visitorKey('1.2.3.5'));
  });

  it('默认昵称是一个软名，不再带编号', () => {
    const identity = identityFromSeed('1.2.3.4', '广东·深圳', 'ip');
    // 不是「匿名·K7Q2」这种工单号：没有分隔点、没有大写字母数字串
    expect(identity.alias).not.toMatch(/·/);
    expect(identity.alias).not.toMatch(/^匿名/);
    expect(identity.alias.length).toBeGreaterThanOrEqual(2);
    expect(identity.alias.length).toBeLessThanOrEqual(8);
    // 同一种子永远同名，能认出自己发过的帖子
    expect(identityFromSeed('1.2.3.4', null, 'device').alias).toBe(identity.alias);
    expect(identity.region).toBe('广东·深圳');
    expect(identity.source).toBe('ip');
  });

  it('软名随种子变化，不会所有人都叫同一个名字', () => {
    const names = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => identityFromSeed(seed, null, 'device').alias),
    );
    expect(names.size).toBeGreaterThanOrEqual(3);
  });

  it('拿不到归属地时不是报错，只是 region 为空', () => {
    const identity = identityFromSeed('device:xyz', null, 'device');
    expect(identity.region).toBeNull();
    expect(identity.alias).toBeTruthy();
  });
});

describe('归属地拼装', () => {
  it('国内拼成「省·市」，市与省同名时只留一个', () => {
    expect(buildRegion('中国', '广东省', '深圳市')).toBe('广东·深圳');
    expect(buildRegion('中国', '北京市', '北京市')).toBe('北京');
  });

  it('直辖市只有省一级时也能用', () => {
    expect(buildRegion('中国', '上海市', '')).toBe('上海');
  });

  it('接口只给英文城市名时转成中文', () => {
    expect(buildRegion('China', 'Beijing', 'Beijing')).toBe('北京');
    // 省份是英文、城市有对照：城市转中文，省份原样保留（不猜）
    expect(buildRegion('中国', 'Guangdong', 'Shenzhen')).toBe('Guangdong·深圳');
  });

  it('国外保留国家名，不带「中国」这种多余前缀', () => {
    expect(buildRegion('Japan', 'Tokyo', 'Tokyo')).toBe('Japan·Tokyo');
  });

  it('什么都没拿到时返回 null', () => {
    expect(buildRegion(undefined, undefined, undefined)).toBeNull();
    expect(buildRegion('中国', '未知', '未知')).toBeNull();
  });
});
