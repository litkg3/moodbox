-- ============================================================================
--  清空树洞广场的全部数据（帖子 + 回复）
--  ---------------------------------------------------------------------------
--  用法：Supabase Dashboard → SQL Editor → 粘贴 → Run。
--
--  ⚠️ 这是不可撤销的操作。确认你真的不需要这些内容了再执行。
--  ⚠️ 只动广场的两张表；`moodbox_config`（管理员口令）不会被清掉。
-- ============================================================================

-- truncate 比 delete 快，而且会把自增/统计一起重置；
-- cascade 不需要，因为 square_replies 已经显式列在同一个语句里。
truncate table public.square_replies, public.square_posts;

-- 确认已清空（应该都返回 0）
select
  (select count(*) from public.square_posts)   as posts,
  (select count(*) from public.square_replies) as replies;
