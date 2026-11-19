'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Database,
  Heart,
  MapPin,
  MessageCircle,
  MessagesSquare,
  PenLine,
  Send,
  Trash2,
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
import { useSquare, squareStore, useQuotaUsage } from '@/lib/content-stores';
import { scanForCrisis } from '@/lib/crisis';
import { formatClock, formatRelativeDay } from '@/lib/date';
import { NICKNAME_MAX, readNickname, saveNickname } from '@/lib/nickname';
import { quotaHint, quotaMessage, quotaState } from '@/lib/quota';
import { MAX_REPLY_LENGTH, charLength, sortPostsForView, type SquareSortMode } from '@/lib/square-repo';
import { describeSensitive, scanSensitive } from '@/lib/sensitive';
import { resolveVisitor, type VisitorIdentity } from '@/lib/visitor';
import type { SquarePost, SquareReply } from '@/types';
import { cn } from '@/lib/utils';

type PendingAction =
  | { kind: 'post'; content: string; nickname: string }
  | { kind: 'reply'; postId: string; content: string; nickname: string };

/** 广场的两种排序方式：按时间（默认）与按热度 */
type SortMode = SquareSortMode;

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

  /** 排序方式只影响这一屏的展示顺序，不写进存储：下次进来还是「按时间」。 */
  const [sort, setSort] = useState<SortMode>('time');

  /**
   * 本机记住的昵称。设过一次之后，之后每次发帖默认都用它，
   * 不用每次都重新想一个名字。
   */
  const [nickname, setNickname] = useState('');
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  useEffect(() => {
    setNickname(readNickname());
  }, []);

  /** 展示与发帖都走这个名字：自己设过就用它，否则用「匿名·XXXX」。 */
  const myName = nickname || visitor?.alias || '匿名的人';

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

  // 发帖输入框里的实时检查：命中就让用户当场看到原因，而不是点了才被拒
  const draftScan = useMemo(() => scanSensitive(draft.content), [draft.content]);

  /**
   * 今天的额度：每个访客每天最多 3 条帖子。
   *
   * 这里只是把「还能发几条」摆在按钮旁边，真正的拦截在 `requestPublish`
   * 与后端（云端是数据库函数）里 —— 界面上的数字是提示，不是边界。
   */
  const usage = useQuotaUsage();
  const postQuota = quotaState('post', usage);
  const replyQuota = quotaState('reply', usage);

  /**
   * 广场列表只显示「已公开且没有命中内容安全规则」的帖子。
   *
   * 过滤放在渲染这一层，而不是发帖那一层：既有的旧帖、别人从别的设备发的，
   * 或者规则将来加严，都会被这条兜住。判断是纯函数，放在 useMemo 里没有副作用。
   */
  const approved = useMemo(
    () => posts.filter((post) => post.status === 'approved' && !scanSensitive(post.content).hit),
    [posts],
  );

  /**
   * 按当前排序方式排一遍（默认按时间）。
   *
   * 排序逻辑放在 `square-repo` 里：这是个纯函数，单元测试能直接覆盖，
   * 不用把组件挂起来。
   */
  const listed = useMemo(() => sortPostsForView(approved, sort), [approved, sort]);

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
      showToast('发出去了，广场上已经能看到。');
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
    // 额度先判：发满了就没必要再去解释内容问题，否则用户改完措辞
    // 才发现今天根本发不出去
    if (!postQuota.allowed) {
      showToast(quotaMessage('post'), 'caution');
      return;
    }
    // 顺序与回复一致：先挡不适内容（黄赌毒、广告、引战、联系方式），
    // 再走自伤提醒 —— 后者是"我听见了"，不该被前者顶掉
    const sensitive = scanSensitive(content);
    if (sensitive.hit) {
      showToast(describeSensitive(sensitive), 'caution');
      return;
    }
    // 对话框里没填就落回「记住的昵称」，最后才是匿名代号
    const author = draft.nickname.trim() || nickname;
    if (scanForCrisis(content).flagged) {
      setPendingAction({ kind: 'post', content, nickname: author });
      setCrisisOpen(true);
      return;
    }
    void publishPost(content, author);
  }

  /** 打开写一条：昵称预先填好，想改这一次的可以就地改。 */
  function openCompose() {
    setDraft({ content: '', nickname });
    setComposeOpen(true);
  }

  function commitNickname() {
    const saved = saveNickname(nicknameDraft);
    setNickname(saved);
    setNicknameOpen(false);
    showToast(saved ? `记住了，以后发帖默认叫「${saved}」。` : '已经改回匿名代号。');
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
    // 额度先判：每天最多 20 条回复
    if (!replyQuota.allowed) {
      showToast(quotaMessage('reply'), 'caution');
      return;
    }
    // 先挡敏感词，再走自伤提醒：前者是"换个说法"，后者是"我听见了"
    const sensitive = scanSensitive(content);
    if (sensitive.hit) {
      showToast(describeSensitive(sensitive), 'caution');
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
          {/* 昵称在页面上就能改，改完记住；不用等到发帖那一步才想起来 */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px]">
            <span className="text-ink-ghost">我的昵称</span>
            <span className="text-ink-faint">{myName}</span>
            <button
              type="button"
              onClick={() => {
                setNicknameDraft(nickname);
                setNicknameOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/50 px-2.5 py-0.5 text-[11px] text-ink-soft transition-colors hover:text-ink"
            >
              <PenLine size={11} strokeWidth={1.8} aria-hidden="true" />
              修改
            </button>
          </div>
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
              <AdminBar ability="可以删除不合适的帖子" buttonOnly />
              <p className="w-full pl-[18px]">{source.detail}</p>
            </div>
          ) : null}
        </div>
        <Button variant="primary" size="md" onClick={openCompose} className="shrink-0">
          <PenLine size={15} strokeWidth={1.7} />
          写一条
        </Button>
      </header>

      <section aria-labelledby="square-title">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="square-title" className="text-[13px] tracking-[0.1em] text-ink">
            广场
          </h2>
          <span className="text-[11px] text-ink-ghost">{approved.length} 条</span>
          {/*
            两种排序是互斥的，所以用「单选」语义（aria-pressed）而不是 tab：
            点一下就是切换，不需要再点第二次确认。
          */}
          <div
            className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-white/70 bg-white/45 p-0.5"
            role="group"
            aria-label="排序方式"
          >
            {(
              [
                ['time', '按时间'],
                ['hug', '按热度'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value)}
                aria-pressed={sort === value}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] tracking-[0.02em] transition-colors',
                  sort === value
                    ? 'bg-white/85 text-ink shadow-[0_1px_2px_rgba(90,72,120,0.08)]'
                    : 'text-ink-ghost hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
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
            {listed.map((post) => (
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
                  replyAllowed={replyQuota.allowed}
                  replyRemaining={replyQuota.remaining}
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
        description="不会公开你的身份，也不需要登录。发出后会立刻出现在广场上。"
        width="md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] tabular-nums leading-[1.8] text-ink-ghost">
              {draft.content.length} / 1000
              <span aria-hidden="true" className="mx-1.5 opacity-40">
                ·
              </span>
              {quotaHint('post', usage)}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" size="md" onClick={() => setComposeOpen(false)}>
                先不写了
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={requestPublish}
                disabled={!draft.content.trim() || working || draftScan.hit || !postQuota.allowed}
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
              placeholder={myName}
              className="mb-field mt-2"
              maxLength={NICKNAME_MAX}
            />
          </label>
          <p className="-mt-1 text-[11px] leading-[1.85] text-ink-ghost">
            留空就用「{myName}」这个名字，之后也能在广场页改。
            {visitor?.region
              ? `您的 IP 定位显示为「${visitor.region}」，定位结果可能存在一定偏差，仅供参考。`
              : '您发帖时会带上一个按 IP 估算的省份，定位结果可能存在一定偏差，仅供参考。'}
          </p>
          <label className="block">
            <span className="text-[12px] text-ink-soft">说点什么</span>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
              placeholder="今天发生了什么？不用说得很完整。"
              rows={7}
              className="mb-field mt-2 resize-y leading-[2]"
              maxLength={1000}
            />
          </label>
          {/* 边写边查：命中就给一句具体的说明，并把「发出去」置灰 */}
          {draftScan.hit ? (
            <p
              role="status"
              className="rounded-2xl border border-[rgba(200,128,118,0.3)] bg-[rgba(247,226,220,0.6)] px-4 py-3 text-[11.5px] leading-[1.9] text-[#8a4a45]"
            >
              {describeSensitive(draftScan)} 改好之后就能发出去了。
            </p>
          ) : null}
          {/* 额度用完时替换掉下面那句温馨提示：这才是此刻真正要知道的事 */}
          {!postQuota.allowed ? (
            <p
              role="status"
              className="rounded-2xl border border-[rgba(200,128,118,0.3)] bg-[rgba(247,226,220,0.6)] px-4 py-3 text-[11.5px] leading-[1.9] text-[#8a4a45]"
            >
              {quotaMessage('post')}
            </p>
          ) : (
            <p className="rounded-2xl border border-white/60 bg-white/40 px-4 py-3 text-[11.5px] leading-[1.9] text-ink-faint">
              如果内容里出现了可能和伤害自己有关的表达，我们会在发送前先轻轻问一句。
              那不是要拦你，只是不想装作没看见。
            </p>
          )}
        </div>
      </Dialog>

      {/* 改昵称：改完记在本机，发帖时默认带上 */}
      <Dialog
        open={nicknameOpen}
        onClose={() => setNicknameOpen(false)}
        title="改个昵称"
        description="昵称会记在这台设备上，之后发帖默认用它。留空就回到「匿名·XXXX」。"
        width="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="md" onClick={() => setNicknameOpen(false)}>
              先不改
            </Button>
            <Button variant="primary" size="md" onClick={commitNickname}>
              记住这个昵称
            </Button>
          </div>
        }
      >
        <label className="block">
          <span className="text-[12px] text-ink-soft">昵称（最多 {NICKNAME_MAX} 个字）</span>
          <input
            value={nicknameDraft}
            onChange={(event) => setNicknameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitNickname();
            }}
            placeholder={visitor?.alias ?? '匿名的人'}
            className="mb-field mt-2"
            maxLength={NICKNAME_MAX}
            autoFocus
          />
        </label>
        <p className="mt-2 text-[11px] leading-[1.85] text-ink-ghost">
          只是显示名，不涉及账号，换一台设备不会同步。
        </p>
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
  replyAllowed,
  replyRemaining,
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
  /** 今天还有没有回复额度；没有时把回复入口关掉，省得写完才被拒 */
  replyAllowed: boolean;
  replyRemaining: number;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  /** 每抱一次加一；大于 0 时播放一次拥抱动画，播完归零 */
  const [burst, setBurst] = useState(0);
  // 回复同样过滤：命中了就不出现在列表里
  const visibleReplies = useMemo(
    () => post.replies.filter((reply) => !scanSensitive(reply.content).hit),
    [post.replies],
  );
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
            title="按 IP 估算，只到省份；手机流量或加速器可能让这里不准，仅供参考"
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
          onClick={() => {
            if (hugged) return;
            onHug();
            setBurst((value) => value + 1);
          }}
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
          {/* 抱下去的那一下要让手有反馈：心先跳一下，再弹一层光 */}
          <motion.span
            key={burst}
            animate={burst > 0 ? { scale: [1, 1.4, 1] } : { scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex"
          >
            <Heart
              size={13}
              strokeWidth={1.7}
              aria-hidden="true"
              className={cn('transition-colors duration-400', hugged && 'fill-current')}
            />
          </motion.span>
          {hugged ? `已抱 · ${post.hugs}` : post.hugs > 0 ? post.hugs : '抱抱'}
        </button>

        <button
          type="button"
          onClick={() => setReplyOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(141,133,152,0.2)] px-3 py-1.5 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
        >
          <MessageCircle size={13} strokeWidth={1.7} aria-hidden="true" />
          {visibleReplies.length > 0 ? `${visibleReplies.length} 条回复` : '回复'}
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
                placeholder="说一句就好，让 TA 知道有人在。"
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
                ) : !replyAllowed ? (
                  <p className="text-[11px] leading-relaxed text-[#8a4a45]" aria-live="polite">
                    {quotaMessage('reply')}
                  </p>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-ghost">
                  {replyRemaining > 0 ? `今天还剩 ${replyRemaining} 条 · ` : ''}
                  {replyLength} / {MAX_REPLY_LENGTH}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={submitReply}
                  disabled={!replyText.trim() || blocked || working || !replyAllowed}
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
        {visibleReplies.length > 0 ? (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {visibleReplies.map((reply) => (
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

      {burst > 0 ? <HugBurst onDone={() => setBurst(0)} /> : null}
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
          <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-ghost" title="按 IP 估算，只到省份；手机流量或加速器可能让这里不准，仅供参考">
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

/* ---------------- 抱抱动画 ---------------- */

/**
 * 点「抱抱」后的一小段动画。
 *
 * 做得克制但要有分量：几颗心从中心散开往上飘，中间浮出一张小卡片
 * 「抱住你了 / 这条心事，有人接住了」，1.6 秒后自己消失，
 * 不打断阅读，也不需要点「关闭」。
 *
 * 挂在 body 上（portal）：帖子卡片在滚动容器里，动画要落在屏幕中央，
 * 不能被任何祖先的 `overflow` 或 `transform` 裁掉。
 * 用户开了「减少动态效果」就只留卡片，不做位移。
 */
function HugBurst({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();

  useEffect(() => {
    const timer = window.setTimeout(onDone, reduced ? 1100 : 1650);
    return () => window.clearTimeout(timer);
  }, [onDone, reduced]);

  /*
   * 心形按「一圈炸开」的方式分布，而不是全往上飘：
   * 往上飘容易被误读成「加载动画」，向四周散开才像抱住了一下。
   * 角度用黄金角错开，保证疏密均匀，又不会是死板的对称。
   */
  const hearts = useMemo(() => {
    const count = 14;
    const golden = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: count }, (_, index) => {
      const angle = index * golden - Math.PI / 2;
      const radius = 62 + (index % 3) * 24;
      return {
        id: index,
        x: Math.cos(angle) * radius * 1.15,
        // 整体上浮一点：抱抱的落点在上方，不是脚边
        y: Math.sin(angle) * radius - 26,
        delay: index * 0.04,
        size: 15 + (index % 4) * 5,
        rotate: (index % 2 === 0 ? 1 : -1) * (14 + index * 3),
      };
    });
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      {/* 一圈很淡的光晕：让「抱住」有一个体积感 */}
      <motion.span
        className="absolute h-40 w-40 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(201,182,232,0.52) 0%, rgba(201,182,232,0.18) 52%, rgba(201,182,232,0) 70%)',
        }}
        initial={{ scale: reduced ? 1 : 0.45, opacity: 0.9 }}
        animate={{ scale: reduced ? 1 : 2.6, opacity: 0 }}
        transition={{ duration: reduced ? 0.7 : 1.2, ease: [0.22, 1, 0.36, 1] }}
      />

      {!reduced
        ? hearts.map((heart) => (
            <motion.span
              key={heart.id}
              className="mb-hug-heart absolute"
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
              animate={{
                opacity: [0, 1, 0.85, 0],
                x: heart.x,
                y: heart.y,
                scale: 1,
                rotate: heart.rotate,
              }}
              transition={{ duration: 1.35, delay: heart.delay, ease: [0.16, 1, 0.3, 1] }}
            >
              <Heart size={heart.size} strokeWidth={1.5} fill="currentColor" />
            </motion.span>
          ))
        : null}

      {/* 文字要压在心上，不能只留一行裸字飘在页面中间 */}
      <motion.div
        className="mb-hug-pill relative flex flex-col items-center gap-1 rounded-[22px] px-5 py-3.5"
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: [0, 1, 1, 0], y: reduced ? 0 : -6, scale: 1 }}
        transition={{ duration: reduced ? 1 : 1.5, times: [0, 0.16, 0.72, 1] }}
      >
        <span className="flex items-center gap-1.5 text-lavender-deep">
          <Heart size={14} strokeWidth={1.7} fill="currentColor" />
          <span className="text-[13px] tracking-[0.18em] text-ink">抱住你了</span>
        </span>
        <span className="text-[10.5px] tracking-[0.06em] text-ink-faint">
          这条心事，有人接住了
        </span>
      </motion.div>
    </div>,
    document.body,
  );
}
