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
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);

comment on table public.square_posts is '树洞广场的帖子；所有读写都只能经 moodbox_* 函数';

create index if not exists square_posts_status_created_idx
  on public.square_posts (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. 回复
-- ---------------------------------------------------------------------------
create table if not exists public.square_replies (
  id            text        primary key,
  post_id       text        not null references public.square_posts (id) on delete cascade,
  nickname      text        not null default '匿名的人',
  content       text        not null check (char_length(btrim(content)) between 1 and 400),
  needs_support boolean     not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists square_replies_post_created_idx
  on public.square_replies (post_id, created_at);

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
alter table public.moodbox_config  enable row level security;

-- 兜底：即使有人在 Dashboard 里手滑加了策略，也不给 anon 表级权限
revoke all on public.square_posts   from anon, authenticated;
revoke all on public.square_replies from anon, authenticated;
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
    'needsSupport', p.needs_support,
    'createdAt',    public.moodbox_iso(p.created_at),
    'reviewedAt',   public.moodbox_iso(p.reviewed_at),
    'replies', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',           r.id,
            'nickname',     r.nickname,
            'content',      r.content,
            'needsSupport', r.needs_support,
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

-- ---------------------------------------------------------------------------
-- 6. 对外 RPC
-- ---------------------------------------------------------------------------

-- 读者视角：只看 approved；带上正确的管理员口令时能看到全部（含待审核）
create or replace function public.moodbox_square_list(p_token text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(public.moodbox_post_json(p.id) order by p.created_at desc),
    '[]'::jsonb
  )
  from public.square_posts p
  where p.status = 'approved'
     or public.moodbox_is_admin(p_token);
$$;

-- 发帖：status 在函数里写死为 pending，客户端无法跳过审核
create or replace function public.moodbox_square_create(
  p_content       text,
  p_nickname      text default null,
  p_needs_support boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      text;
  v_content text := btrim(coalesce(p_content, ''));
  v_nick    text := nullif(btrim(coalesce(p_nickname, '')), '');
begin
  if char_length(v_content) = 0 then
    raise exception '写点什么再发出去吧。';
  end if;
  if char_length(v_content) > 600 then
    raise exception '太长了，600 字以内更容易被读完。';
  end if;

  v_id := 'post_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.square_posts (id, nickname, content, status, needs_support)
  values (v_id, left(coalesce(v_nick, '匿名的人'), 24), v_content, 'pending', coalesce(p_needs_support, false));

  return public.moodbox_post_json(v_id);
end;
$$;

-- 抱一下：只能给已通过的帖子加，且每次 +1
create or replace function public.moodbox_square_hug(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.square_posts
     set hugs = hugs + 1
   where id = p_id
     and status = 'approved';

  if not found then
    raise exception '这条帖子已经不在了。';
  end if;

  return public.moodbox_post_json(p_id);
end;
$$;

-- 回复：只能回复已通过的帖子
create or replace function public.moodbox_square_reply(
  p_post_id       text,
  p_content       text,
  p_nickname      text default null,
  p_needs_support boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_content text := btrim(coalesce(p_content, ''));
  v_nick    text := nullif(btrim(coalesce(p_nickname, '')), '');
begin
  if char_length(v_content) = 0 then
    raise exception '回复不能是空的。';
  end if;
  if char_length(v_content) > 400 then
    raise exception '回复太长了，400 字以内就好。';
  end if;
  if not exists (
    select 1 from public.square_posts where id = p_post_id and status = 'approved'
  ) then
    raise exception '这条帖子已经不在了。';
  end if;

  insert into public.square_replies (id, post_id, nickname, content, needs_support)
  values (
    'reply_' || replace(gen_random_uuid()::text, '-', ''),
    p_post_id,
    left(coalesce(v_nick, '匿名的人'), 24),
    v_content,
    coalesce(p_needs_support, false)
  );

  return public.moodbox_post_json(p_post_id);
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

  return public.moodbox_post_json(p_id);
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
create or replace function public.moodbox_square_delete_reply(
  p_post_id  text,
  p_reply_id text,
  p_token    text
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

  return public.moodbox_post_json(p_post_id);
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
  select jsonb_build_object('ok', true, 'version', 1, 'at', public.moodbox_iso(now()));
$$;

-- ---------------------------------------------------------------------------
-- 7. 只把这些函数开放给匿名访客
-- ---------------------------------------------------------------------------
revoke all on function public.moodbox_iso(timestamptz)              from public;
revoke all on function public.moodbox_is_admin(text)                 from public;
revoke all on function public.moodbox_post_json(text)                from public;

grant execute on function public.moodbox_square_list(text)                      to anon, authenticated;
grant execute on function public.moodbox_square_create(text, text, boolean)      to anon, authenticated;
grant execute on function public.moodbox_square_hug(text)                        to anon, authenticated;
grant execute on function public.moodbox_square_reply(text, text, text, boolean) to anon, authenticated;
grant execute on function public.moodbox_square_review(text, text, text)         to anon, authenticated;
grant execute on function public.moodbox_square_delete(text, text)               to anon, authenticated;
grant execute on function public.moodbox_square_delete_reply(text, text, text)   to anon, authenticated;
grant execute on function public.moodbox_admin_check(text)                       to anon, authenticated;
grant execute on function public.moodbox_ping()                                  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. 设置管理员口令（改掉 'moodbox2026' 再执行）
--    这一步只能在 SQL Editor 里跑，anon 永远读不到这张表。
-- ---------------------------------------------------------------------------
insert into public.moodbox_config (key, value)
values ('admin_token', 'moodbox2026')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- 9. 自检：跑完这段应该看到 9 行函数、2 行 rellssecurity（true）
-- ---------------------------------------------------------------------------
-- select routine_name from information_schema.routines
--  where routine_schema = 'public' and routine_name like 'moodbox%' order by 1;
--
-- select relname, relrowsecurity from pg_class
--  where relname in ('square_posts', 'square_replies', 'moodbox_config');
