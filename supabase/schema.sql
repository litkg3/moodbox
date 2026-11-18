-- ============================================================================
--  情绪盒子 MoodBox · 树洞广场 Supabase Schema
--  ---------------------------------------------------------------------------
--  用法：Supabase Dashboard → SQL Editor → 新建查询 → 整段粘贴 → Run。
--  脚本是幂等的（create if not exists / create or replace），重复执行不会报错，
--  也不会清掉已有帖子。
--
--  安全模型（很重要，先看这段再改）：
--
--    anon（浏览器里的匿名访客）对三张表都**没有任何直接权限**。
--    RLS 已开启且不建任何策略 —— 也就是说：
--      · select / insert / update / delete 直接发到表上，一律被拒绝；
--      · 唯一入口是下面这组 `security definer` 函数，函数内部决定谁能做什么。
--
--    为什么这么设计：如果把「插入帖子」直接开放给 anon，客户端就能自己把
--    status 写成 approved，审核形同不存在；如果把「更新」开放给 anon，
--    任何人都能把别人的心事改掉。所以写操作一律收进函数里。
--
--    匿名身份：发帖/回复时前端会给一个匿名 key（由 IP 或本机随机值派生），
--    这里只存它的 md5 指纹（visitor_hash），不存 IP 原文。列表接口只回
--    `mine: true/false`，指纹不下发，所以「删自己的」这条规则在服务端成立。
--    归属地（region）是城市级文字，由前端解析后带上，仅用于展示。
--
--    版本：v5（2026-11）
--      v5 新增：发帖/回复的内容安全拦截（黄赌毒、联系方式、硬广告）
--               与每日配额（每人每天 3 条帖子、20 条回复，按 Asia/Shanghai 自然日）。
--      升级方式：把本文件**整段**重新执行一次即可，不会清掉已有内容。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 帖子
-- ---------------------------------------------------------------------------
create table if not exists public.square_posts (
  id            text        primary key,
  nickname      text        not null default '匿名的人',
  content       text        not null check (char_length(btrim(content)) between 1 and 600),
  -- 三态：待审核 / 已通过 / 已拒绝。默认 pending，且只有函数能改。
  status        text        not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected')),
  hugs          integer     not null default 0 check (hugs >= 0),
  -- 命中自伤相关表达时置 true：不拦截发布，只是让管理员优先看到
  needs_support boolean     not null default false,
  -- 发布者的匿名指纹（不存 IP 原文，只存哈希）与归属地文字
  visitor_hash  text,
  region        text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);

-- 老库升级：幂等补列
alter table public.square_posts add column if not exists visitor_hash text;
alter table public.square_posts add column if not exists region       text;

comment on table public.square_posts is '树洞广场的帖子；所有读写都只能经 moodbox_* 函数';
comment on column public.square_posts.visitor_hash is '发布者匿名指纹：只用于让本人删掉自己的帖子，不存 IP';

create index if not exists square_posts_status_created_idx
  on public.square_posts (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. 回复
-- ---------------------------------------------------------------------------
create table if not exists public.square_replies (
  id            text        primary key,
  post_id       text        not null references public.square_posts (id) on delete cascade,
  nickname      text        not null default '匿名的人',
  -- 回复最多 200 字（前端 maxLength、接口层、这里三处一致）
  content       text        not null check (char_length(btrim(content)) between 1 and 200),
  needs_support boolean     not null default false,
  visitor_hash  text,
  region        text,
  created_at    timestamptz not null default now()
);

alter table public.square_replies add column if not exists visitor_hash text;
alter table public.square_replies add column if not exists region       text;

-- 老库的回复上限是 400，这里改成 200。
-- 用 not valid 是为了不因为历史长回复导致整段脚本失败；新写入一律按 200 校验。
alter table public.square_replies drop constraint if exists square_replies_content_check;
alter table public.square_replies
  add constraint square_replies_content_check
  check (char_length(btrim(content)) between 1 and 200) not valid;

create index if not exists square_replies_post_created_idx
  on public.square_replies (post_id, created_at);

-- ---------------------------------------------------------------------------
-- 2.1 拥抱记录：一个访客对同一条只能抱一次
--     主键 (post_id, visitor_hash) 就是去重规则本身 —— 重复插入会被 on conflict 挡掉，
--     所以「一个 IP 只能抱一次」不靠前端自觉。同样只存哈希，不存 IP。
-- ---------------------------------------------------------------------------
create table if not exists public.square_hugs (
  post_id      text        not null references public.square_posts (id) on delete cascade,
  visitor_hash text        not null,
  created_at   timestamptz not null default now(),
  primary key (post_id, visitor_hash)
);

create index if not exists square_hugs_post_idx on public.square_hugs (post_id);

comment on table public.square_hugs is '拥抱记录：同一访客对同一条帖子只能抱一次（主键去重）';

-- ---------------------------------------------------------------------------
-- 3. 私有配置：管理员口令存在这里
--    这张表同样开了 RLS 且没有策略，anon 读不到；只有 definer 函数能查。
-- ---------------------------------------------------------------------------
create table if not exists public.moodbox_config (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- 4. 关掉所有直接访问
-- ---------------------------------------------------------------------------
alter table public.square_posts    enable row level security;
alter table public.square_replies  enable row level security;
alter table public.square_hugs     enable row level security;
alter table public.moodbox_config  enable row level security;

-- 兜底：即使有人在 Dashboard 里手滑加了策略，也不给 anon 表级权限
revoke all on public.square_posts   from anon, authenticated;
revoke all on public.square_replies from anon, authenticated;
revoke all on public.square_hugs    from anon, authenticated;
revoke all on public.moodbox_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. 内部工具函数
-- ---------------------------------------------------------------------------

-- 统一成前端认识的 ISO 字符串（带 Z），避免时区偏移把排序搞乱
create or replace function public.moodbox_iso(ts timestamptz)
returns text
language sql
stable
as $$
  select case
    when ts is null then null
    else to_char(ts at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  end;
$$;

-- 口令是否等于配置里的管理员口令
create or replace function public.moodbox_is_admin(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select cfg.value = coalesce(p_token, '')
      from public.moodbox_config cfg
      where cfg.key = 'admin_token'
    ),
    false
  )
  and length(coalesce(p_token, '')) >= 8;
$$;

-- 把客户端给的匿名标识收敛成一个固定长度的指纹。
-- 存的是哈希，不是 key 原文，更不是 IP。
create or replace function public.moodbox_visitor_hash(p_visitor text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(btrim(p_visitor), '') = '' then null
    else substr(md5(btrim(p_visitor) || ':moodbox-square'), 1, 16)
  end;
$$;

-- 把一条帖子（含回复）拼成前端要的 jsonb
create or replace function public.moodbox_post_json(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id',           p.id,
    'nickname',     p.nickname,
    'content',      p.content,
    'status',       p.status,
    'hugs',         p.hugs,
    -- 具体值由 moodbox_mine() 按访客重新算，这里先给个安全的默认
    'hugged',       false,
    'needsSupport', p.needs_support,
    'region',       p.region,
    'createdAt',    public.moodbox_iso(p.created_at),
    'reviewedAt',   public.moodbox_iso(p.reviewed_at),
    -- 只在服务端内部流转：moodbox_mine() 用它算 mine，然后删掉
    'visitorId',    p.visitor_hash,
    'replies', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',           r.id,
            'nickname',     r.nickname,
            'content',      r.content,
            'needsSupport', r.needs_support,
            'region',       r.region,
            'visitorId',    r.visitor_hash,
            'createdAt',    public.moodbox_iso(r.created_at)
          )
          order by r.created_at asc
        )
        from public.square_replies r
        where r.post_id = p.id
      ),
      '[]'::jsonb
    )
  )
  from public.square_posts p
  where p.id = p_id;
$$;

/*
 * 给一条帖子（含回复）标上「是不是当前访客发的」，并抹掉 visitorId。
 *
 * 这样做的好处：匿名指纹**从不下发给浏览器**，别人就算抓包也拿不到
 * 你的标识去冒充；而界面只需要 `mine: true/false` 就能决定显示不显示删除按钮。
 */
create or replace function public.moodbox_mine(p_post jsonb, p_visitor text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_set(
    jsonb_set(
      jsonb_set(
        p_post,
        '{mine}',
        to_jsonb(
          coalesce(p_post ->> 'visitorId', '') <> ''
          and p_post ->> 'visitorId' = coalesce(public.moodbox_visitor_hash(p_visitor), '')
        )
      ),
      -- 这个访客抱过没有：查拥抱记录表，同样只回布尔，不回任何指纹
      '{hugged}',
      to_jsonb(
        coalesce(public.moodbox_visitor_hash(p_visitor), '') <> ''
        and exists (
          select 1
            from public.square_hugs h
           where h.post_id = p_post ->> 'id'
             and h.visitor_hash = public.moodbox_visitor_hash(p_visitor)
        )
      )
    ) - 'visitorId',
    '{replies}',
    coalesce(
      (
        select jsonb_agg(
          (jsonb_set(
            r,
            '{mine}',
            to_jsonb(
              coalesce(r ->> 'visitorId', '') <> ''
              and r ->> 'visitorId' = coalesce(public.moodbox_visitor_hash(p_visitor), '')
            )
          ) - 'visitorId')
          order by r ->> 'createdAt'
        )
        from jsonb_array_elements(coalesce(p_post -> 'replies', '[]'::jsonb)) as r
      ),
      '[]'::jsonb
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. 对外 RPC
-- ---------------------------------------------------------------------------

-- 读者视角：只看 approved；带上正确的管理员口令时能看到全部（含待审核）
-- 第二个参数是访客自己的匿名 key，只用来算 mine，不会存也不会回传
--
-- 先删掉历史版本：Postgres 认「函数名 + 参数类型」为同一个函数，
-- 老库里还留着 list(text) 这种少参数的版本时，直接 create or replace
-- 会创出两个重载，前端按新签名调用可能撞上歧义（42725）。
drop function if exists public.moodbox_square_list(text);
drop function if exists public.moodbox_square_list(text, text);
create or replace function public.moodbox_square_list(
  p_token   text default null,
  p_visitor text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(public.moodbox_mine(public.moodbox_post_json(p.id), p_visitor)
              order by p.created_at desc),
    '[]'::jsonb
  )
  from public.square_posts p
  where p.status = 'approved'
     or public.moodbox_is_admin(p_token);
$$;

/*
 * 内容安全关键词（与服务端拦截共用）。
 *
 * 前端 lib/sensitive.ts 里那份词表的**子集**，只放「写了就肯定不该发」
 * 的黄赌毒与硬广告。服务端这层的意义是：前端 JS 可以被绕过，
 * 这里被绕过需要直接调 RPC —— 至少拦住脚本批量灌广告。
 *
 * 匹配方式与前端对齐：把文本里的空白和标点去掉，再做包含匹配。
 * 只放短语，不放单字，避免误伤正常倾诉。
 */
create or replace function public.moodbox_blocked_terms()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    -- 赌博
    '博彩', '网赌', '六合彩', '时时彩', '百家乐', '棋牌代理', '下注赢', '下注平台',
    -- 色情
    '约炮', '裸聊', '援交', '包养', '成人视频', '色情服务', '上门服务', '楼凤', '同城约',
    -- 毒品 / 违禁品
    '冰毒', '摇头丸', 'k粉', '麻古', '制毒', '炸药配方', '枪支买卖', '迷药', '听话水',
    -- 诈骗引流 / 硬广告
    '加微信', '加vx', '加v信', '刷单', '日赚', '躺赚', '高额返利', '稳赚不赔',
    '贷款秒批', '高利贷', '裸贷', '洗钱', '跑分', '代开发票', '办假证',
    -- 辱骂
    '傻逼', '煞笔', '沙比', '脑残', '智障', '婊子'
  ];
$$;

/*
 * 归一化：全角标点 / 空白 / 常见符号都会被去掉。
 *
 * 为什么不用 regexp_replace(..., '[[:space:][:punct:]]', ...)：
 * 那是按**服务器 locale** 判定的，C locale 下中文全角逗号「，」不算 punct，
 * 于是一句「加，微，信」就能绕过去。translate 是逐字符查表，
 * 与数据库的 locale 无关，结果稳定。
 */
create or replace function public.moodbox_normalize(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(translate(
    coalesce(p_text, ''),
    '，。！？；：“”‘’（）【】《》、…—～·　 ,.;:!?"''()[]<>/\|_=+*&^%$#@~`-',
    ''
  ));
$$;

/*
 * 每日发布配额：一个访客（同一匿名指纹）每天最多 3 条帖子、20 条回复。
 *
 * 为什么放在数据库里数：前端那份统计只存在于当前浏览器，
 * 清一下 localStorage 或者直接调 RPC 就绕过去了。这里按 visitor_hash
 * 数「今天已经落库的条数」，才是真正拦得住的那一层。
 *
 * 「今天」按 Asia/Shanghai 的自然日算 —— 广场是中文社区，
 * 用 UTC 的话，早上 8 点前发的东西会被算到前一天，用户很难理解。
 *
 * 删帖不退额度：数的是"今天发出过多少条"，不是"现在还剩多少条"。
 * 否则「发三条 → 全删 → 再发三条」就是免费无限发。
 */
create or replace function public.moodbox_daily_post_limit()
returns integer language sql immutable
set search_path = public, pg_temp
as $$ select 3 $$;

create or replace function public.moodbox_daily_reply_limit()
returns integer language sql immutable
set search_path = public, pg_temp
as $$ select 20 $$;

-- 今天的起点（含）：Asia/Shanghai 的 0 点，换算成 timestamptz
create or replace function public.moodbox_day_start()
returns timestamptz language sql stable
set search_path = public, pg_temp
as $$
  select date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
$$;

-- 某个访客今天已发 / 已回复的条数
create or replace function public.moodbox_quota_used(p_visitor text)
returns table (posts integer, replies integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::int
       from public.square_posts
      where visitor_hash = public.moodbox_visitor_hash(p_visitor)
        and created_at >= public.moodbox_day_start()),
    (select count(*)::int
       from public.square_replies
      where visitor_hash = public.moodbox_visitor_hash(p_visitor)
        and created_at >= public.moodbox_day_start());
$$;

/*
 * 给前端查「今天还能发几条」。
 *
 * 只回数字，不回任何帖子内容，所以它泄漏不了别人的东西 ——
 * 就算有人拿别人的 visitor key 来查，也只能知道"这个人今天发了几条"，
 * 而这本来就是公开信息（数一下广场上的帖子就知道了）。
 * 匿名指纹取不到时返回 0/0，界面据此不显示剩余额度。
 */
create or replace function public.moodbox_quota(p_visitor text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_posts   integer;
  v_replies integer;
begin
  if public.moodbox_visitor_hash(p_visitor) is null then
    return jsonb_build_object('posts', 0, 'replies', 0);
  end if;
  select q.posts, q.replies into v_posts, v_replies
    from public.moodbox_quota_used(p_visitor) q;
  return jsonb_build_object(
    'posts', coalesce(v_posts, 0),
    'replies', coalesce(v_replies, 0),
    'postLimit', public.moodbox_daily_post_limit(),
    'replyLimit', public.moodbox_daily_reply_limit()
  );
end;
$$;

-- 这段文本里有没有不该出现的内容（布尔）
create or replace function public.moodbox_content_blocked(p_text text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_norm  text;
  v_terms text[] := public.moodbox_blocked_terms();
  v_term  text;
begin
  if p_text is null or btrim(p_text) = '' then
    return false;
  end if;
  -- 去掉空白与标点，保留字母数字（与前端 normalizeForScan 一致）
  v_norm := public.moodbox_normalize(p_text);
  -- 词表本身也要归一化：像「加vx」这种带字母的短语，不归一化就永远匹配不上
  foreach v_term in array v_terms
  loop
    if position(public.moodbox_normalize(v_term) in v_norm) > 0 then
      return true;
    end if;
  end loop;
  -- 中国大陆手机号：不留联系方式
  if v_norm ~ '(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)' then
    return true;
  end if;
  return false;
end;
$$;

-- 发帖：发出即公开（status 直接写 approved）。
-- 之前的「先审后发」已经取消：广场是给人倾诉的地方，等审反而劝退。
-- 管理员仍可以事后删除，见 moodbox_square_delete。
-- p_visitor / p_region：匿名指纹与归属地，前者只存哈希，后者只存城市级文字
drop function if exists public.moodbox_square_create(text, text, boolean);
drop function if exists public.moodbox_square_create(text, text, boolean, text);
drop function if exists public.moodbox_square_create(text, text, boolean, text, text);
create or replace function public.moodbox_square_create(
  p_content       text,
  p_nickname      text default null,
  p_needs_support boolean default false,
  p_visitor       text default null,
  p_region        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      text;
  v_content text := btrim(coalesce(p_content, ''));
  -- 昵称最多 16 个字，超出的部分截断（与前端 maxLength 对齐）
  v_nick    text := nullif(left(btrim(coalesce(p_nickname, '')), 16), '');
begin
  if char_length(v_content) = 0 then
    raise exception '写点什么再发出去吧。';
  end if;
  if char_length(v_content) > 600 then
    raise exception '太长了，600 字以内更容易被读完。';
  end if;
  -- 内容安全：黄赌毒、硬广告、联系方式。前端已经拦过一遍，
  -- 这里是为了防止绕过前端直接调接口。
  if public.moodbox_content_blocked(v_content) or public.moodbox_content_blocked(v_nick) then
    raise exception '这段内容里有不适合出现在广场上的部分，换个说法再发吧。';
  end if;

  -- 每日配额：每人每天 3 条。没有 visitor 的调用方无从统计，这里放行
  -- （前端一定会带；老客户端不带，也不能因此让它完全发不了）
  if public.moodbox_visitor_hash(p_visitor) is not null then
    if (select q.posts from public.moodbox_quota_used(p_visitor) q)
         >= public.moodbox_daily_post_limit() then
      raise exception '今天已经发满 % 条了。额度按自然日算，明天 0 点会重新给满 % 条 —— 现在可以先去看看别人的心事。',
        public.moodbox_daily_post_limit(), public.moodbox_daily_post_limit();
    end if;
  end if;

  v_id := 'post_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.square_posts (id, nickname, content, status, needs_support, visitor_hash, region)
  values (
    v_id,
    left(coalesce(v_nick, '匿名的人'), 24),
    v_content,
    'approved',
    coalesce(p_needs_support, false),
    public.moodbox_visitor_hash(p_visitor),
    left(btrim(coalesce(p_region, '')), 20)
  );

  return public.moodbox_mine(public.moodbox_post_json(v_id), p_visitor);
end;
$$;

/*
 * 抱一下：只能给已通过的帖子加。
 *
 * 一个访客对同一条只能抱一次 —— 去重靠 square_hugs 的主键，不靠前端。
 * 重复抱不会报错，只是不再累加（幂等），返回值里 hugged = true，
 * 界面据此把按钮变成「已抱」并禁用。
 */
drop function if exists public.moodbox_square_hug(text);
create or replace function public.moodbox_square_hug(p_id text, p_visitor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash    text := public.moodbox_visitor_hash(p_visitor);
  v_inserted boolean := false;
begin
  if not exists (
    select 1 from public.square_posts where id = p_id and status = 'approved'
  ) then
    raise exception '这条帖子已经不在了。';
  end if;

  if v_hash is null then
    -- 老客户端没带 visitor：只能老实 +1，服务端无从去重
    update public.square_posts set hugs = hugs + 1 where id = p_id;
  else
    insert into public.square_hugs (post_id, visitor_hash)
    values (p_id, v_hash)
    on conflict (post_id, visitor_hash) do nothing;

    v_inserted := found;

    if v_inserted then
      update public.square_posts set hugs = hugs + 1 where id = p_id;
    end if;
  end if;

  return public.moodbox_mine(public.moodbox_post_json(p_id), p_visitor);
end;
$$;

-- 回复：只能回复已通过的帖子；最多 200 字
drop function if exists public.moodbox_square_reply(text, text, text, boolean);
create or replace function public.moodbox_square_reply(
  p_post_id       text,
  p_content       text,
  p_nickname      text default null,
  p_needs_support boolean default false,
  p_visitor       text default null,
  p_region        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_content text := btrim(coalesce(p_content, ''));
  -- 昵称最多 16 个字，超出的部分截断（与前端 maxLength 对齐）
  v_nick    text := nullif(left(btrim(coalesce(p_nickname, '')), 16), '');
begin
  if char_length(v_content) = 0 then
    raise exception '回复不能是空的。';
  end if;
  if char_length(v_content) > 200 then
    raise exception '回复最多 200 字，再精简一点吧。';
  end if;
  if not exists (
    select 1 from public.square_posts where id = p_post_id and status = 'approved'
  ) then
    raise exception '这条帖子已经不在了。';
  end if;

  -- 内容安全与配额：回复同样不能夹带联系方式，
  -- 也不能成为绕过发帖额度的灌水通道
  if public.moodbox_content_blocked(v_content) or public.moodbox_content_blocked(v_nick) then
    raise exception '这段内容里有不适合出现在广场上的部分，换个说法再发吧。';
  end if;
  if public.moodbox_visitor_hash(p_visitor) is not null then
    if (select q.replies from public.moodbox_quota_used(p_visitor) q)
         >= public.moodbox_daily_reply_limit() then
      raise exception '今天已经回复满 % 条了。说得太多也累，明天 0 点之后再来吧。',
        public.moodbox_daily_reply_limit();
    end if;
  end if;

  insert into public.square_replies (id, post_id, nickname, content, needs_support, visitor_hash, region)
  values (
    'reply_' || replace(gen_random_uuid()::text, '-', ''),
    p_post_id,
    left(coalesce(v_nick, '匿名的人'), 24),
    v_content,
    coalesce(p_needs_support, false),
    public.moodbox_visitor_hash(p_visitor),
    left(btrim(coalesce(p_region, '')), 20)
  );

  return public.moodbox_mine(public.moodbox_post_json(p_post_id), p_visitor);
end;
$$;

-- 审核：必须带对的管理员口令
create or replace function public.moodbox_square_review(
  p_id     text,
  p_status text,
  p_token  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.moodbox_is_admin(p_token) then
    raise exception '管理员口令不对，这次审核没有生效。';
  end if;
  if p_status not in ('approved', 'pending', 'rejected') then
    raise exception '未知的审核状态：%', p_status;
  end if;

  update public.square_posts
     set status = p_status,
         reviewed_at = now()
   where id = p_id;

  if not found then
    raise exception '这条帖子已经不在了。';
  end if;

  return public.moodbox_mine(public.moodbox_post_json(p_id), null);
end;
$$;

-- 删帖：必须带对的管理员口令（回复会跟着级联删除）
create or replace function public.moodbox_square_delete(p_id text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.moodbox_is_admin(p_token) then
    raise exception '管理员口令不对，这条帖子没有被删除。';
  end if;

  delete from public.square_posts where id = p_id;

  if not found then
    raise exception '这条帖子已经不在了。';
  end if;
end;
$$;

-- 删回复：同样要口令
drop function if exists public.moodbox_square_delete_reply(text, text, text);
create or replace function public.moodbox_square_delete_reply(
  p_post_id  text,
  p_reply_id text,
  p_token    text,
  p_visitor  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.moodbox_is_admin(p_token) then
    raise exception '管理员口令不对，这条回复没有被删除。';
  end if;

  delete from public.square_replies where id = p_reply_id and post_id = p_post_id;

  return public.moodbox_mine(public.moodbox_post_json(p_post_id), p_visitor);
end;
$$;

/*
 * 匿名访客删自己的帖子 / 回复。
 *
 * 不要求口令，但要求「发布时留下的指纹」与这次请求带来的匿名标识一致。
 * 指纹只存在服务端，列表接口也只会回 `mine: true/false`，
 * 所以别人拿不到你的指纹，也就删不掉你的东西。
 */
create or replace function public.moodbox_square_delete_own(p_id text, p_visitor text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text := public.moodbox_visitor_hash(p_visitor);
begin
  if v_hash is null then
    raise exception '没能确认这是你发的帖子。';
  end if;

  delete from public.square_posts
   where id = p_id
     and visitor_hash = v_hash;

  if not found then
    raise exception '这条帖子不是你发的，删不了。';
  end if;
end;
$$;

create or replace function public.moodbox_square_delete_own_reply(
  p_post_id  text,
  p_reply_id text,
  p_visitor  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text := public.moodbox_visitor_hash(p_visitor);
begin
  if v_hash is null then
    raise exception '没能确认这是你写的回复。';
  end if;

  delete from public.square_replies
   where id = p_reply_id
     and post_id = p_post_id
     and visitor_hash = v_hash;

  if not found then
    raise exception '这条回复不是你写的，删不了。';
  end if;

  return public.moodbox_mine(public.moodbox_post_json(p_post_id), p_visitor);
end;
$$;

-- 让前端能问一句"这个口令对不对"，只回 boolean，不泄露任何别的东西
create or replace function public.moodbox_admin_check(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.moodbox_is_admin(p_token);
$$;

-- 健康检查：前端/运维可以拿它确认 schema 是否已经装好
create or replace function public.moodbox_ping()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- version 4：发帖改为「发出即公开」（取消先审后发）
  -- 前端可以拿它判断库是不是最新（旧版本是 1 / 2 / 3）
  select jsonb_build_object('ok', true, 'version', 4, 'at', public.moodbox_iso(now()));
$$;

-- ---------------------------------------------------------------------------
-- 7. 只把这些函数开放给匿名访客
-- ---------------------------------------------------------------------------
revoke all on function public.moodbox_iso(timestamptz)              from public;
revoke all on function public.moodbox_is_admin(text)                 from public;
revoke all on function public.moodbox_post_json(text)                from public;
revoke all on function public.moodbox_visitor_hash(text)             from public;
revoke all on function public.moodbox_mine(jsonb, text)              from public;

grant execute on function public.moodbox_square_list(text, text)                                   to anon, authenticated;
grant execute on function public.moodbox_square_create(text, text, boolean, text, text)            to anon, authenticated;
grant execute on function public.moodbox_square_hug(text, text)                                    to anon, authenticated;
grant execute on function public.moodbox_square_reply(text, text, text, boolean, text, text)       to anon, authenticated;
grant execute on function public.moodbox_square_review(text, text, text)                           to anon, authenticated;
grant execute on function public.moodbox_square_delete(text, text)                                 to anon, authenticated;
grant execute on function public.moodbox_square_delete_own(text, text)                             to anon, authenticated;
grant execute on function public.moodbox_square_delete_reply(text, text, text, text)               to anon, authenticated;
grant execute on function public.moodbox_square_delete_own_reply(text, text, text)                 to anon, authenticated;
grant execute on function public.moodbox_admin_check(text)                                         to anon, authenticated;
grant execute on function public.moodbox_ping()                                                    to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. 设置管理员口令（改掉 'moodbox2026' 再执行）
--    这一步只能在 SQL Editor 里跑，anon 永远读不到这张表。
-- ---------------------------------------------------------------------------
insert into public.moodbox_config (key, value)
values ('admin_token', 'moodbox2026')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- 9. 自检：跑完这段应该看到 16 行 moodbox_* 函数、4 行 relrowsecurity（true）
-- ---------------------------------------------------------------------------
-- select routine_name from information_schema.routines
--  where routine_schema = 'public' and routine_name like 'moodbox%' order by 1;
--
-- select relname, relrowsecurity from pg_class
--  where relname in ('square_posts', 'square_replies', 'square_hugs', 'moodbox_config');
