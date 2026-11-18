'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Database,
  HeartHandshake,
  MapPin,
  MessageCircle,
  MessagesSquare,
  PenLine,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { AdminBar } from '@/components/admin/admin-bar';
import { CrisisNoticeDialog } from '@/components/square/crisis-notice-dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { LoadingBar } from '@/components/ui/loading-bar';
import { useToast } from '@/components/ui/toast';
import { useAdmin } from '@/lib/admin';
import { describeBackend } from '@/lib/backend';
import { useSquare, squareStore } from '@/lib/content-stores';
import { scanForCrisis } from '@/lib/crisis';
import { formatClock, formatRelativeDay } from '@/lib/date';
import { MAX_REPLY_LENGTH, charLength } from '@/lib/square-repo';
import { scanSensitive } from '@/lib/sensitive';
import { resolveVisitor, type VisitorIdentity } from '@/lib/visitor';
import type { SquarePost, SquareReply } from '@/types';
import { cn } from '@/lib/utils';

type PendingAction =
  | { kind: 'post'; content: string; nickname: string }
  | { kind: 'reply'; postId: string; content: string; nickname: string };

export function SquareView() {
  const { items: posts, status, error } = useSquare();
  const { isAdmin } = useAdmin();
  const { showToast } = useToast();

  /**
   * 数据来源要挂载后再算。
   *
   * 它取决于"这个浏览器有没有被强制走本机"（localStorage），服务端渲染时读不到；
   * 在渲染里直接算会让首帧文案对不上、控制台报水合不一致。
   */
  const [source, setSource] = useState<{ label: string; detail: string } | null>(null);
  useEffect(() => {
    const info = describeBackend();
    setSource({ label: info.label, detail: info.detail });
  }, []);

  /**
   * 访客身份：决定「匿名·XXXX」这个后缀，以及能不能删自己发的东西。
   * 解析可能要等一次归属地查询，所以拿到之后要通知 store 重算 mine。
   */
  const [visitor, setVisitor] = useState<VisitorIdentity | null>(null);
  useEffect(() => {
    let alive = true;
    void resolveVisitor().then((identity) => {
      if (!alive) return;
      setVisitor(identity);
      squareStore.setViewer(identity.key);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState({ content: '', nickname: '' });
  const [crisisOpen, setCrisisOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SquarePost | null>(null);

  /**
   * 管理员解锁 / 退出时重新拉一次列表。
   *
   * 云端模式下「待审核」只有带着正确口令才返回给前端，
   * 所以解锁之后必须刷新，否则管理员会看到一个空空的待审核区。
   */
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void squareStore.reload();
  }, [isAdmin]);

  const approved = useMemo(() => posts.filter((post) => post.status === 'approved'), [posts]);
  const pending = useMemo(() => posts.filter((post) => post.status === 'pending'), [posts]);

  /* ---------------- 发布 ---------------- */

  async function publishPost(content: string, nickname: string) {
    setWorking(true);
    try {
      await squareStore.publish({
        content,
        nickname,
        alias: visitor?.alias,
        visitorId: visitor?.key,
        region: visitor?.region ?? null,
        needsSupport: scanForCrisis(content).flagged,
      });
      setComposeOpen(false);
      setDraft({ content: '', nickname: '' });
      showToast('发出去了。它会先经过一次审核，然后出现在广场上。');
    } catch (publishError) {
      showToast(
        publishError instanceof Error ? publishError.message : '没能发出去，请稍后再试。',
        'caution',
      );
    } finally {
      setWorking(false);
    }
  }

  function requestPublish() {
    const content = draft.content.trim();
    if (!content) return;
    if (scanForCrisis(content).flagged) {
      setPendingAction({ kind: 'post', content, nickname: draft.nickname.trim() });
      setCrisisOpen(true);
      return;
    }
    void publishPost(content, draft.nickname.trim());
  }

  async function publishReply(postId: string, content: string) {
    setWorking(true);
    try {
      await squareStore.reply(postId, {
        content,
        alias: visitor?.alias,
        visitorId: visitor?.key,
        region: visitor?.region ?? null,
        needsSupport: scanForCrisis(content).flagged,
      });
      showToast('回复已经送达。');
    } catch (replyError) {
      showToast(
        replyError instanceof Error ? replyError.message : '回复失败，请稍后再试。',
        'caution',
      );
    } finally {
      setWorking(false);
    }
  }

  function requestReply(postId: string, content: string) {
    // 先挡敏感词，再走自伤提醒：前者是"换个说法"，后者是"我听见了"
    const sensitive = scanSensitive(content);
    if (sensitive.hit) {
      showToast(
        `这段话里有不适合出现在广场上的词（${sensitive.masked.join('、')}），换个说法再发吧。`,
        'caution',
      );
      return;
    }
    if (charLength(content) > MAX_REPLY_LENGTH) {
      showToast(`回复最多 ${MAX_REPLY_LENGTH} 字，再精简一点吧。`, 'caution');
      return;
    }
    if (scanForCrisis(content).flagged) {
      setPendingAction({ kind: 'reply', postId, content, nickname: '' });
      setCrisisOpen(true);
      return;
    }
    void publishReply(postId, content);
  }

  async function handleCrisisPublish() {
    const action = pendingAction;
    setCrisisOpen(false);
    setPendingAction(null);
    if (!action) return;
    if (action.kind === 'post') await publishPost(action.content, action.nickname);
    else await publishReply(action.postId, action.content);
  }

  /* ---------------- 管理 ---------------- */

  async function review(postId: string, next: 'approved' | 'rejected') {
    try {
      await squareStore.review(postId, next);
      showToast(next === 'approved' ? '已经放到广场上了。' : '这条先不放出去了。');
    } catch (reviewError) {
      showToast(
        reviewError instanceof Error ? reviewError.message : '操作失败，请稍后再试。',
        'caution',
      );
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      // 管理员走管理删除；匿名游客只能删自己发的，接口层会再校验一次
      if (isAdmin) await squareStore.remove(deleteTarget.id);
      else await squareStore.removeOwn(deleteTarget.id);
      showToast('这条帖子已经删掉了。');
      setDeleteTarget(null);
    } catch (deleteError) {
      showToast(
        deleteError instanceof Error ? deleteError.message : '删除失败，请稍后再试。',
        'caution',
      );
      setDeleteTarget(null);
    }
  }

  /** 删一条回复：管理员能删任意一条，匿名游客只能删自己写的。 */
  async function handleDeleteReply(postId: string, replyId: string) {
    try {
      if (isAdmin) await squareStore.removeReply(postId, replyId);
      else await squareStore.removeOwnReply(postId, replyId);
      showToast('这条回复已经删掉了。');
    } catch (deleteError) {
      showToast(
        deleteError instanceof Error ? deleteError.message : '删除回复失败，请稍后再试。',
        'caution',
      );
    }
  }

  /** 云端模式下拥抱要发请求，失败必须说出来，不能静默吞掉。 */
  async function handleHug(postId: string) {
    try {
      await squareStore.hug(postId);
    } catch (hugError) {
      showToast(
        hugError instanceof Error ? hugError.message : '没能抱住，请稍后再试。',
        'caution',
      );
    }
  }

  const loading = status === 'idle' || status === 'loading';

  return (
    <div>
      <header className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-[560px]">
          <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">Hollow Square</p>
          <h1 className="mt-3 font-display text-[26px] font-light leading-tight tracking-[0.06em] text-ink sm:text-[34px]">
            树洞广场
          </h1>
          <p className="mt-3 max-w-[48ch] text-pretty text-[13.5px] leading-[1.9] text-ink-faint sm:text-sm">
            当小球难以匹配你复杂的心情时，不妨来到树洞广场，欢迎你来倾诉，分享你的故事。
          </p>
          {/* 数据存在哪必须写在页面上，不能让人以为换台设备还能看到 */}
          {source ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px] leading-relaxed text-ink-ghost">
              <span className="inline-flex items-start gap-1.5">
                <Database
                  size={12}
                  strokeWidth={1.6}
                  className="mt-[3px] shrink-0"
                  aria-hidden="true"
                />
                <span className="text-ink-faint">{source.label}</span>
              </span>
              {/* 管理员入口与「已接入 Supabase」同一行展示 */}
              <AdminBar ability="可以审核待发布的内容，删除不合适的帖子" buttonOnly />
              <p className="w-full pl-[18px]">{source.detail}</p>
            </div>
          ) : null}
        </div>
        <Button variant="primary" size="md" onClick={() => setComposeOpen(true)} className="shrink-0">
          <PenLine size={15} strokeWidth={1.7} />
          写一条
        </Button>
      </header>

      <AdminBar ability="可以审核待发布的内容，删除不合适的帖子" hideEntry className="mb-7" />

      {isAdmin ? (
        <section aria-labelledby="pending-title" className="mb-9">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 id="pending-title" className="text-[13px] tracking-[0.1em] text-ink">
              待审核
            </h2>
            <span className="text-[11px] text-ink-ghost">{pending.length} 条</span>
          </div>

          {pending.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[rgba(141,133,152,0.24)] px-4 py-5 text-center text-[12px] text-ink-ghost">
              没有待审核的内容。这里是空的，说明大家现在都还好。
            </p>
          ) : (
            <ul className="space-y-3">
              {pending.map((post) => (
                <li
                  key={post.id}
                  className="rounded-2xl border border-[rgba(201,182,232,0.5)] bg-[rgba(201,182,232,0.1)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-ghost">
                    <span>{post.nickname}</span>
                    <span>·</span>
                    <span>
                      {formatRelativeDay(post.createdAt.slice(0, 10))} {formatClock(post.createdAt)}
                    </span>
                    {post.needsSupport ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(247,222,217,0.7)] px-2 py-0.5 text-[#8a4a45]">
                        <ShieldAlert size={10} strokeWidth={1.8} aria-hidden="true" />
                        包含需要留意的表达
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 whitespace-pre-line text-pretty text-[13px] leading-[1.95] text-ink-soft">
                    {post.content}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" onClick={() => void review(post.id, 'approved')}>
                      <Check size={13} strokeWidth={1.8} />
                      放到广场
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void review(post.id, 'rejected')}>
                      <X size={13} strokeWidth={1.8} />
                      不放出去
                    </Button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(post)}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] text-[#8a4a45] transition-colors hover:bg-[rgba(247,222,217,0.5)]"
                    >
                      <Trash2 size={12} strokeWidth={1.7} aria-hidden="true" />
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="square-title">
        <div className="mb-3 flex items-baseline gap-3">
          <h2 id="square-title" className="text-[13px] tracking-[0.1em] text-ink">
            广场
          </h2>
          <span className="text-[11px] text-ink-ghost">{approved.length} 条</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {/* 进度条放在列表位置，与下面的占位卡片是同一套卡片语言 */}
            <LoadingBar label="正在把广场上的话搬过来…" />
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-[128px] animate-pulse rounded-[22px] border border-white/50 bg-white/30"
              />
            ))}
          </div>
        ) : status === 'error' || status === 'unavailable' ? (
          <p className="rounded-2xl border border-[rgba(158,95,92,0.2)] bg-[rgba(247,231,228,0.4)] px-4 py-3 text-[13px] text-[#8a6360]">
            {error ?? '暂时读不到广场的内容。'}
          </p>
        ) : approved.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-[rgba(201,182,232,0.18)]">
              <MessagesSquare
                size={20}
                strokeWidth={1.4}
                className="text-lavender-deep"
                aria-hidden="true"
              />
            </span>
            <p className="text-[14px] text-ink-soft">广场上还什么都没有。</p>
            <p className="mt-2 max-w-[30ch] text-[12.5px] leading-[1.9] text-ink-faint">
              可以坐一会儿，也可以写下第一句。这里没有认识你的人。
            </p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            {approved.map((post) => (
              <li key={post.id}>
                <PostCard
                  post={post}
                  isAdmin={isAdmin}
                  canDelete={isAdmin || Boolean(post.mine)}
                  working={working}
                  onHug={() => void handleHug(post.id)}
                  onReply={(content) => requestReply(post.id, content)}
                  onDelete={() => setDeleteTarget(post)}
                  onDeleteReply={(replyId) => void handleDeleteReply(post.id, replyId)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 写一条 */}
      <Dialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="写一条"
        description="不会公开你的身份，也不需要登录。发出后需要经过一次审核。"
        width="md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-ink-ghost">
              {draft.content.length} / 800
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" size="md" onClick={() => setComposeOpen(false)}>
                先不写了
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={requestPublish}
                disabled={!draft.content.trim() || working}
              >
                <Send size={14} strokeWidth={1.7} />
                {working ? '正在发送…' : '发出去'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="text-[12px] text-ink-soft">想叫什么都可以（可留空）</span>
            <input
              value={draft.nickname}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, nickname: event.target.value }))
              }
              placeholder={visitor?.alias ?? '匿名的人'}
              className="mb-field mt-2"
              maxLength={16}
            />
          </label>
          <p className="-mt-1 text-[11px] leading-[1.85] text-ink-ghost">
            留空就用「{visitor?.alias ?? '匿名的人'}」这个名字。
            {visitor?.region
              ? `你的帖子旁会标「${visitor.region}」，这是按 IP 归属地取的，只到城市。`
              : '你的帖子旁会标一个 IP 归属地，只到城市。'}
          </p>
          <label className="block">
            <span className="text-[12px] text-ink-soft">说点什么</span>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
              placeholder="今天发生了什么？不用说得很完整。"
              rows={7}
              className="mb-field mt-2 resize-y leading-[2]"
              maxLength={800}
            />
          </label>
          <p className="rounded-2xl border border-white/60 bg-white/40 px-4 py-3 text-[11.5px] leading-[1.9] text-ink-faint">
            如果内容里出现了可能和伤害自己有关的表达，我们会在发送前先轻轻问一句。
            那不是要拦你，只是不想装作没看见。
          </p>
        </div>
      </Dialog>

      <CrisisNoticeDialog
        open={crisisOpen}
        onClose={() => {
          setCrisisOpen(false);
          setPendingAction(null);
        }}
        onPublish={() => void handleCrisisPublish()}
        publishLabel={pendingAction?.kind === 'reply' ? '仍然回复' : '仍然发出去'}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="删除这条帖子？"
        description={
          isAdmin
            ? '删除后无法恢复，包括它收到的拥抱和回复。'
            : '这是你发的帖子，删除后无法恢复，包括它收到的拥抱和回复。'
        }
        confirmLabel="删除"
      />
    </div>
  );
}

/* ---------------- 单条帖子 ---------------- */

function PostCard({
  post,
  isAdmin,
  canDelete,
  working,
  onHug,
  onReply,
  onDelete,
  onDeleteReply,
}: {
  post: SquarePost;
  isAdmin: boolean;
  /** 管理员，或这条帖子就是自己发的 */
  canDelete: boolean;
  working: boolean;
  onHug: () => void;
  onReply: (content: string) => void;
  onDelete: () => void;
  onDeleteReply: (replyId: string) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const hugged = Boolean(post.hugged);

  // 边打字边检查：命中就提示并禁用发送，不用等按下按钮才被拦
  const replyScan = useMemo(() => scanSensitive(replyText), [replyText]);
  const replyLength = charLength(replyText);
  const blocked = replyScan.hit || replyLength > MAX_REPLY_LENGTH;

  function submitReply() {
    const content = replyText.trim();
    if (!content || blocked) return;
    onReply(content);
    setReplyText('');
    setReplyOpen(false);
  }

  return (
    <article className="rounded-[22px] border border-white/70 bg-white/50 p-5 transition-colors duration-500 hover:bg-white/60 sm:p-6">
      <header className="flex flex-wrap items-center gap-2 text-[11px] text-ink-ghost">
        <span className="text-ink-faint">{post.nickname}</span>
        {post.region ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[rgba(141,133,152,0.1)] px-1.5 py-[1px] text-[10.5px] text-ink-ghost"
            title="按 IP 归属地显示，只到城市"
          >
            <MapPin size={10} strokeWidth={1.7} aria-hidden="true" />
            {post.region}
          </span>
        ) : null}
        <span aria-hidden="true">·</span>
        <span>
          {formatRelativeDay(post.createdAt.slice(0, 10))} {formatClock(post.createdAt)}
        </span>
        {post.isDemo ? (
          <span className="rounded-full bg-[rgba(141,133,152,0.12)] px-2 py-0.5 tracking-[0.1em]">
            示例
          </span>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="删除这条帖子"
            className="ml-auto grid h-7 w-7 place-items-center rounded-full text-ink-ghost transition-colors hover:bg-[rgba(247,222,217,0.6)] hover:text-[#8a4a45]"
          >
            <Trash2 size={13} strokeWidth={1.7} />
          </button>
        ) : null}
      </header>

      <p className="mt-2.5 whitespace-pre-line text-pretty text-[13.5px] leading-[2] text-ink-soft">
        {post.content}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/*
          一个 IP 对同一条只能抱一次：抱过之后按钮变成「已抱」，并禁用。
          `post.hugged` 是服务端算的（按匿名指纹去重），不是本地点一下就算 ——
          刷新、换标签页都不会重新变成可抱。
        */}
        <button
          type="button"
          onClick={onHug}
          disabled={hugged}
          aria-label={
            hugged ? `你已经抱过这条心事了，共 ${post.hugs} 个拥抱` : `抱抱这条心事，目前 ${post.hugs} 个拥抱`
          }
          title={hugged ? '一个 IP 对同一条只能抱一次' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] transition-all duration-400',
            hugged
              ? 'cursor-default border-[rgba(201,182,232,0.6)] bg-[rgba(201,182,232,0.22)] text-ink'
              : 'border-[rgba(141,133,152,0.2)] text-ink-faint hover:border-[rgba(201,182,232,0.5)] hover:text-ink',
          )}
        >
          <HeartHandshake
            size={13}
            strokeWidth={1.7}
            aria-hidden="true"
            className={cn('transition-transform duration-400', hugged && 'scale-110')}
          />
          {hugged ? `已抱 · ${post.hugs}` : post.hugs > 0 ? post.hugs : '抱抱'}
        </button>

        <button
          type="button"
          onClick={() => setReplyOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(141,133,152,0.2)] px-3 py-1.5 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
        >
          <MessageCircle size={13} strokeWidth={1.7} aria-hidden="true" />
          {post.replies.length > 0 ? `${post.replies.length} 条回复` : '回复'}
        </button>

      </div>

      <AnimatePresence initial={false}>
        {replyOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3">
              <textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder="写一句就好，不必给建议。"
                rows={3}
                maxLength={MAX_REPLY_LENGTH}
                aria-label="回复内容"
                className="mb-field resize-y text-[12.5px] leading-[1.9]"
              />
              <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                {/* 只在命中敏感词时才出现一行提示；平时的字数交给右下角的计数器 */}
                {replyScan.hit ? (
                  <p
                    className="text-[11px] leading-relaxed text-[#8a4a45]"
                    aria-live="polite"
                  >
                    这段里有不适合出现在广场上的词（{replyScan.masked.join('、')}），换个说法再发吧。
                  </p>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span className="ml-auto text-[11px] tabular-nums text-ink-ghost">
                  {replyLength} / {MAX_REPLY_LENGTH}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={submitReply}
                  disabled={!replyText.trim() || blocked || working}
                >
                  <Send size={12} strokeWidth={1.8} />
                  发送
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {post.replies.length > 0 ? (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {post.replies.map((reply) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                canDelete={isAdmin || Boolean(reply.mine)}
                onDelete={() => onDeleteReply(reply.id)}
              />
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

function ReplyItem({
  reply,
  canDelete,
  onDelete,
}: {
  reply: SquareReply;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <li className="mt-3 border-l-2 border-[rgba(201,182,232,0.45)] pl-3.5">
      <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-ink-ghost">
        <span className="text-ink-faint">{reply.nickname}</span>
        {reply.region ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-ghost" title="按 IP 归属地显示，只到城市">
            <MapPin size={9} strokeWidth={1.7} aria-hidden="true" />
            {reply.region}
          </span>
        ) : null}
        <span aria-hidden="true">·</span>
        <span>{formatClock(reply.createdAt)}</span>
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="删除这条回复"
            className="ml-auto grid h-6 w-6 place-items-center rounded-full text-ink-ghost transition-colors hover:text-[#8a4a45]"
          >
            <Trash2 size={11} strokeWidth={1.7} />
          </button>
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-line text-[12.5px] leading-[1.9] text-ink-soft">
        {reply.content}
      </p>
    </li>
  );
}
