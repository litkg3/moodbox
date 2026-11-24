'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowUp,
  HeartHandshake,
  MessageCircleMore,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { EMOTIONS } from '@/data/emotions';
import { parseSseBuffer } from '@/lib/chat/sse';
import {
  clearAllSessions,
  isSaveEnabled,
  loadSessions,
  newSessionId,
  persistSession,
  setSaveEnabled,
  titleOf,
} from '@/lib/chat/store';
import type { CarePayload, ChatMessage, ChatSession } from '@/lib/chat/types';
import { cn } from '@/lib/utils';

/** 离底部多近算"已经在底部"——只有在这个范围内新消息才自动滚动 */
const BOTTOM_GAP = 80;
/** 输入框最多长到几行 */
const MAX_ROWS = 6;

const QUICK_STARTS = ['想说说今天', '帮我平静下来', '只想有人听听'] as const;

export function ChatView() {
  const params = useSearchParams();
  const { showToast } = useToast();

  const emotionId = params.get('emotion');
  const emotionLabel = useMemo(
    () => EMOTIONS.find((item) => item.id === emotionId)?.label ?? null,
    [emotionId],
  );

  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [care, setCare] = useState<CarePayload | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [save, setSave] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState(() => newSessionId());

  const messagesRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const skipSaveRef = useRef(false);
  const createdAtRef = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const atBottomRef = useRef(true);
  /** 上一次发送失败的那句话，用于「重试」 */
  const lastSendRef = useRef<string | null>(null);

  messagesRef.current = messages;

  /* ---------------- 初始化：历史 / 情绪开场 ---------------- */

  useEffect(() => {
    const savedOn = isSaveEnabled();
    setSave(savedOn);

    if (savedOn) {
      const list = loadSessions();
      setSessions(list);
      const latest = list[0];
      if (latest && latest.messages.length > 0) {
        setMessages(latest.messages);
        setSessionId(latest.id);
        createdAtRef.current = latest.createdAt;
        setReady(true);
        return;
      }
    }

    if (emotionLabel) {
      setMessages([
        {
          id: newSessionId(),
          role: 'assistant',
          content: `你带着「${emotionLabel}」来到这里。不用急着说清楚，从哪一刻开始都行。`,
          createdAt: Date.now(),
        },
      ]);
    }
    setReady(true);
  }, [emotionLabel]);

  /* ---------------- 键盘：visualViewport ---------------- */

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty('--chat-vv-h', `${Math.round(vv.height)}px`);
      /*
       * `offsetTop` 才是真正把聊天页顶出屏幕的那个值。
       *
       * `position: fixed` 是相对**布局视口**定位的，而 iOS 弹出键盘时把
       * **可视视口**整个向上平移（offsetTop 变成几百像素）。布局视口没动，
       * fixed 层也没动，但人眼看到的窗口已经滑到下面去了 —— 于是输入栏
       * 出现在可见区靠上的位置，下方留下一大片背景。
       *
       * 把 offsetTop 也写进变量，让聊天层跟着可见窗口一起下移。
       */
      root.style.setProperty('--chat-vv-top', `${Math.round(vv.offsetTop)}px`);
      /*
       * 再单独写一份 `--app-vv-h`：`--chat-vv-h` 只管聊天页自己变矮，
       * 但 `body` 还挂着 `min-height: 100dvh`（812），文档照样可滚。
       * 键盘一弹，iOS 会把整个文档上滚，fixed 的聊天页跟着被推出屏幕 ——
       * 上方只剩纯色底、输入栏沉到屏幕外。这份变量给布局层用，
       * 让 body / html 的高度也认键盘。
       */
      root.style.setProperty('--app-vv-h', `${Math.round(vv.height)}px`);
      root.style.setProperty(
        '--chat-kb',
        `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`,
      );
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);

    /*
     * 有些 iOS 版本收起键盘时只把可视视口还原，**不补一次 resize**。
     * 那样 `--chat-vv-h` / `--chat-vv-top` 会停在键盘还在时的值，页面
     * 就卡在偏移状态里。失焦之后隔一拍再同步一次，成本几乎为零。
     */
    let blurTimer = 0;
    const onFocusOut = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(sync, 140);
    };
    document.addEventListener('focusout', onFocusOut);

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      document.removeEventListener('focusout', onFocusOut);
      window.clearTimeout(blurTimer);
      root.style.removeProperty('--chat-vv-h');
      root.style.removeProperty('--app-vv-h');
      root.style.removeProperty('--chat-vv-top');
      root.style.removeProperty('--chat-kb');
    };
  }, []);

  /* ---------------- 自动滚动 ---------------- */

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_GAP;
  }, []);

  useEffect(() => {
    if (!atBottomRef.current) return;
    const id = requestAnimationFrame(() => scrollToBottom(false));
    return () => cancelAnimationFrame(id);
  }, [messages, care, scrollToBottom]);

  useEffect(() => {
    if (!ready) scrollToBottom(false);
  }, [ready, scrollToBottom]);

  /*
   * 键盘弹出 / 收起时补一次贴底。
   *
   * 可视视口变矮只会让容器跟着变矮，浏览器**不会**顺手把"贴底"重新算一遍 ——
   * 原本停在最底下的对话，会忽然差一行没到底。只在用户本来就在底部时才补，
   * 往上翻旧消息的时候不去抢滚动位置。
   */
  const [kbTick, setKbTick] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const bump = () => setKbTick((n) => n + 1);
    vv.addEventListener('resize', bump);
    return () => vv.removeEventListener('resize', bump);
  }, []);

  useEffect(() => {
    if (!atBottomRef.current) return;
    const id = requestAnimationFrame(() => scrollToBottom(false));
    return () => cancelAnimationFrame(id);
  }, [kbTick, scrollToBottom]);

  /* ---------------- 输入框高度 ---------------- */

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = 22;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS + 20)}px`;
  }, []);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  /* ---------------- 发送 ---------------- */

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const runStream = useCallback(
    async (history: ChatMessage[]) => {
      const assistantId = newSessionId();
      setStreaming(true);
      streamingRef.current = true;
      setError(null);
      setCare(null);

      // 先放一条空消息：它就是"输入中"的三个点，也是后面逐字填充的容器
      setMessages([...history, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() }]);

      const controller = new AbortController();
      abortRef.current = controller;
      let produced = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.map((message) => ({ role: message.role, content: message.content })),
            emotion: emotionLabel,
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? '刚才没接上，试一次看看。');
        }
        if (!response.body) throw new Error('没有收到回应。');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseBuffer(buffer);
          buffer = parsed.rest;

          for (const event of parsed.events) {
            if (event.type === 'delta') {
              produced = true;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + event.text }
                    : message,
                ),
              );
            } else if (event.type === 'care') {
              setMessages((prev) => prev.filter((message) => message.id !== assistantId));
              setCare(event.care);
            } else if (event.type === 'notice') {
              produced = true;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId ? { ...message, content: event.text } : message,
                ),
              );
            } else if (event.type === 'error') {
              setError(event.message ?? '刚才没接上，试一次看看。');
            }
          }
        }

        if (!produced) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId && !message.content
                ? { ...message, content: '我在，只是这会儿没组织好语言。你再说一句？' }
                : message,
            ),
          );
        }
      } catch (caught) {
        if (controller.signal.aborted) {
          // 用户按了停止：保留已经吐出来的部分，标一句"已停止"
          setMessages((prev) =>
            prev
              .map((message) =>
                message.id === assistantId ? { ...message, stopped: true } : message,
              )
              .filter((message) => message.id !== assistantId || message.content.length > 0),
          );
        } else {
          setMessages((prev) => prev.filter((message) => message.id !== assistantId));
          setError(caught instanceof Error ? caught.message : '刚才没接上，试一次看看。');
        }
      } finally {
        setStreaming(false);
        streamingRef.current = false;
        abortRef.current = null;
      }
    },
    [emotionLabel],
  );

  const send = useCallback(
    (raw: string) => {
      const content = raw.trim();
      if (!content || streamingRef.current) return;

      lastSendRef.current = content;
      const userMessage: ChatMessage = {
        id: newSessionId(),
        role: 'user',
        content,
        createdAt: Date.now(),
      };
      const history = [...messagesRef.current, userMessage];
      setMessages(history);
      setInput('');
      void runStream(history);
    },
    [runStream],
  );

  const submit = useCallback(() => {
    send(input);
  }, [input, send]);

  const retry = useCallback(() => {
    const text = lastSendRef.current;
    if (!text) return;
    setError(null);
    // 重试不该把同一句话再说一遍：把最后一条用户消息之后的空回复重跑
    const history = messagesRef.current.filter(
      (message) => !(message.role === 'assistant' && message.content.length === 0),
    );
    const hasLast = history.at(-1)?.role === 'user' && history.at(-1)?.content === text;
    if (hasLast) {
      void runStream(history);
      return;
    }
    send(text);
  }, [runStream, send]);

  /* ---------------- Esc 停止 ---------------- */

  useEffect(() => {
    if (!streaming) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        stop();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [streaming, stop]);

  /* ---------------- 本地保存 ---------------- */

  useEffect(() => {
    if (!ready || !save) return;
    if (skipSaveRef.current) return;
    if (messages.length === 0) return;

    const list = persistSession({
      id: sessionId,
      title: titleOf(messages),
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
      messages,
    });
    if (list.length > 0) setSessions(list);
  }, [messages, save, ready, sessionId]);

  const toggleSave = useCallback(() => {
    const next = !save;
    setSave(next);
    setSaveEnabled(next);
    if (next) {
      showToast('已开启保存，对话只存在这台设备上。', 'calm');
    } else {
      setSessions([]);
      showToast('已关闭保存，本机上的对话记录也删掉了。', 'calm');
    }
  }, [save, showToast]);

  const startNew = useCallback(() => {
    stop();
    skipSaveRef.current = true;
    setMessages([]);
    setCare(null);
    setError(null);
    setSessionId(newSessionId());
    createdAtRef.current = Date.now();
    lastSendRef.current = null;
    window.setTimeout(() => {
      skipSaveRef.current = false;
    }, 0);
    inputRef.current?.focus();
  }, [stop]);

  const openSession = useCallback(
    (session: ChatSession) => {
      stop();
      setMessages(session.messages);
      setSessionId(session.id);
      createdAtRef.current = session.createdAt;
      setCare(null);
      setError(null);
    },
    [stop],
  );

  const clearEverything = useCallback(() => {
    stop();
    clearAllSessions();
    setSessions([]);
    setMessages([]);
    setCare(null);
    setError(null);
    setSessionId(newSessionId());
    createdAtRef.current = Date.now();
    showToast('已删除这台设备上的全部对话记录。', 'calm');
  }, [stop, showToast]);

  /* ---------------- 输入框按键 ---------------- */

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      // 中文输入法组词期间按 Enter 是"选词"，不是"发送"
      if (composingRef.current || event.nativeEvent.isComposing) return;
      event.preventDefault();
      submit();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const busy = streaming || !ready;
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');

  return (
    <div className="mb-chat-page">
      <div className="mb-chat-grid">
        {/* 桌面 ≥1200 才出现的侧栏 */}
        <aside className="mb-chat-side" aria-label="对话历史">
          <button type="button" onClick={startNew} className="mb-chat-new">
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
            新对话
          </button>

          <div className="mb-chat-side-list">
            {save ? (
              sessions.length > 0 ? (
                <ul>
                  {sessions.map((session) => (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => openSession(session)}
                        aria-current={session.id === sessionId ? 'true' : undefined}
                        className={cn(
                          'mb-chat-history',
                          session.id === sessionId && 'is-active',
                        )}
                      >
                        <span className="truncate">{session.title || '新的对话'}</span>
                        <span className="mb-chat-history-date">
                          {formatDate(session.updatedAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-chat-side-empty">还没有存下来的对话。</p>
              )
            ) : (
              <p className="mb-chat-side-empty">
                对话默认不保存。打开上面的开关，这里才会出现历史。
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={clearEverything}
            className="mb-chat-clear"
            disabled={!save && sessions.length === 0}
          >
            <Trash2 size={13} strokeWidth={1.7} aria-hidden="true" />
            删除全部记录
          </button>
        </aside>

        <div className="mb-chat-main">
          {/* 常驻提示：不随消息滚走 */}
          <div className="mb-chat-top">
            <p className="mb-chat-disclaimer">AI 陪伴，不是真人，不能替代专业帮助</p>
            <button
              type="button"
              onClick={toggleSave}
              aria-pressed={save}
              className={cn('mb-chat-save', save && 'is-on')}
            >
              <span className="mb-chat-save-dot" aria-hidden="true" />
              {save ? '已保存' : '不保存'}
            </button>
          </div>

          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="mb-chat-scroll mb-chat-scroller"
            role="log"
            aria-live="polite"
          >
            {messages.length === 0 && !care ? (
              <div className="mb-chat-empty">
                <span className="mb-chat-empty-icon">
                  <MessageCircleMore size={22} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <h1 className="mb-chat-empty-title">想说点什么都可以</h1>
                <p className="mb-chat-empty-sub">
                  我先听着。这里不会评价你，也不用把话说得很完整。
                </p>
                <div className="mb-chat-quick">
                  {QUICK_STARTS.map((item) => (
                    <button key={item} type="button" onClick={() => send(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) => (
              <Bubble
                key={message.id}
                message={message}
                typing={streaming && message.id === lastAssistant?.id && !message.content}
              />
            ))}

            {care ? <CareCard care={care} /> : null}

            {error ? (
              <div className="mb-chat-error" role="alert">
                <p>{error}</p>
                <button type="button" onClick={retry}>
                  <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" />
                  重试
                </button>
              </div>
            ) : null}
          </div>

          <form className="mb-chat-composer" onSubmit={onSubmit}>
            <div className="mb-chat-field">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                rows={1}
                maxLength={2000}
                placeholder="说点什么…"
                aria-label="输入消息"
                className="mb-chat-input"
              />
              {streaming ? (
                <button type="button" onClick={stop} className="mb-chat-send is-stop" aria-label="停止生成">
                  <Square size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || busy}
                  className="mb-chat-send"
                  aria-label="发送"
                >
                  <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="mb-chat-hint">
              Enter 发送 · Shift + Enter 换行{save ? ' · 对话只存在这台设备上' : ' · 不保存对话'}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 气泡 ---------------- */

function Bubble({ message, typing }: { message: ChatMessage; typing: boolean }) {
  const mine = message.role === 'user';
  return (
    <div className={cn('mb-chat-row', mine ? 'is-user' : 'is-ai')}>
      {!mine ? (
        <span className="mb-chat-avatar" aria-hidden="true">
          <Sparkles size={13} strokeWidth={1.8} />
        </span>
      ) : null}
      <div className={cn('mb-chat-bubble', mine ? 'mb-chat-bubble-user' : 'mb-chat-bubble-ai')}>
        {typing ? (
          <span className="mb-chat-typing" aria-label="正在输入">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <p>{message.content}</p>
        )}
        {message.stopped ? <span className="mb-chat-stopped">已停止</span> : null}
      </div>
    </div>
  );
}

/* ---------------- 关怀卡片 ---------------- */

function CareCard({ care }: { care: CarePayload }) {
  return (
    <section className="mb-care-card" aria-label="关怀提示">
      <span className="mb-care-icon" aria-hidden="true">
        <HeartHandshake size={18} strokeWidth={1.6} />
      </span>
      <h2>{care.title}</h2>
      <p>{care.body}</p>
      {care.resources.length > 0 ? (
        <ul className="mb-care-list">
          {care.resources.map((resource) => (
            <li key={`${resource.name}-${resource.contact}`}>
              <span className="mb-care-name">{resource.name}</span>
              <a href={`tel:${resource.contact.replace(/[^\d+]/g, '')}`} className="mb-care-phone">
                {resource.contact}
              </a>
              {resource.note ? <span className="mb-care-note">{resource.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function formatDate(value: number): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
