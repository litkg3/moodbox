'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Music2, Pause, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useAmbientAudio } from '@/hooks/use-ambient-audio';
import { AUDIO_TRACK } from '@/lib/audio-config';
import { cn } from '@/lib/utils';

/**
 * 背景音乐播放器。
 *
 * 挂载在根布局中，因此站内路由切换时音频不会被卸载，可以连续播放。
 * 音源缺失时会明确告知用户，而不是假装在播放。
 */
export function AudioPlayer({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const {
    status,
    volume,
    message,
    toggle,
    setVolume,
    audioRef,
    onAudioError,
    onAudioPlaying,
    onAudioPause,
    onAudioStalled,
    onAudioEnded,
  } = useAmbientAudio();

  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';
  const isMissing = status === 'missing';

  /*
   * 进度停住的两个事件只能原生绑定。
   *
   * `stalled` 与 `waiting` 不冒泡，React 17 之后也不会再把它们代理到根节点，
   * 所以 JSX 里的 onStalled / onWaiting 永远不会被调用。这里直接 addEventListener，
   * 而且只挂一次（回调本身是稳定引用，不必进依赖数组）。
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const handle = () => onAudioStalled();
    audio.addEventListener('stalled', handle);
    audio.addEventListener('waiting', handle);
    return () => {
      audio.removeEventListener('stalled', handle);
      audio.removeEventListener('waiting', handle);
    };
  }, [audioRef, onAudioStalled]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div ref={wrapperRef} className="relative">
      {/* preload="auto"：进页面就开始拉流，点击时直接出声，不必等到点了才下载 */}
      <audio
        ref={audioRef}
        src={AUDIO_TRACK.src}
        loop={AUDIO_TRACK.loop}
        preload="auto"
        onError={onAudioError}
        onPlaying={onAudioPlaying}
        onPause={onAudioPause}
        /*
         * 卡住的两种来源：进度停住（切后台 / 断网 / 休眠唤醒）和
         * loop 偶发失效后停在结尾。两个都接上，才有机会自己恢复。
         *
         * 注意：`stalled` / `waiting` 必须是**原生监听**（见下面的 effect）。
         * React 17 起不再把事件统一代理到根节点，而这两个事件本身不冒泡，
         * 写成 onStalled={...} 是绑不上的 —— 属性根本不会挂到元素上，
         * 表现就是「逻辑写了、永远不触发」，比报错更难查。
         */
        onEnded={onAudioEnded}
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={
          isPlaying
            ? '背景音乐播放中，点击调节'
            : isMissing
              ? '背景音乐没能加载，点击查看说明'
              : '打开背景音乐'
        }
        className={cn(
          'mb-glass-soft group flex h-10 items-center gap-2 rounded-full pl-3 pr-3.5 transition-all duration-500 sm:h-11',
          'hover:bg-white/65',
          isPlaying ? 'text-ink' : 'text-ink-faint',
          /*
           * 窄屏「更多」面板里的那份：按钮缩成图标 + 文字。
           * 播放中换成实底 + 描边的激活态，标签也变成「音乐中」，
           * 否则在手机上根本看不出到底有没有响。
           */
          compact &&
            'h-9 gap-1.5 whitespace-nowrap px-3 text-[11.5px] tracking-[0.04em]',
          compact && isPlaying && 'mb-tool-on text-lavender-deep',
        )}
      >
        <span className="relative grid h-5 w-5 place-items-center">
          {isPlaying ? (
            <Pause size={14} strokeWidth={1.8} className="text-lavender-deep" />
          ) : (
            <Music2 size={15} strokeWidth={1.6} />
          )}
          {isMissing ? (
            <span
              aria-hidden="true"
              className="absolute -right-[1px] -top-[1px] h-[5px] w-[5px] rounded-full bg-[#c58f86]"
            />
          ) : null}
        </span>
        {/* 播放中的三根小竖条：比起只在悬停时才动，这个是一直看得见的信号 */}
        {!compact ? (
          <span className="hidden items-end gap-[2px] sm:flex" aria-hidden="true">
            {[0, 1, 2].map((bar) => (
              <span
                key={bar}
                className={cn(
                  'w-[2px] rounded-full bg-lavender-deep/60 transition-all duration-500',
                  isPlaying ? 'animate-pulse' : 'opacity-40',
                )}
                style={{
                  height: isPlaying ? `${6 + bar * 3}px` : '4px',
                  animationDelay: `${bar * 160}ms`,
                }}
              />
            ))}
          </span>
        ) : null}
        <span
          className={cn(
            'text-[11px] tracking-[0.16em] text-ink-faint',
            compact ? 'inline tracking-[0.04em]' : 'hidden sm:inline',
            compact && isPlaying && 'text-lavender-deep',
          )}
        >
          {isPlaying ? '音乐中' : isLoading ? '准备中' : isMissing ? '没能加载' : '音乐'}
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mb-glass absolute right-0 top-[calc(100%+10px)] z-50 w-[272px] rounded-3xl p-5"
            role="dialog"
            aria-label="背景音乐设置"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-[14px] tracking-[0.08em] text-ink">
                  {AUDIO_TRACK.title}
                </p>
                <p className="mt-1 truncate text-[11px] tracking-[0.05em] text-ink-ghost">
                  {AUDIO_TRACK.artist}
                </p>
              </div>
              <span
                className={cn(
                  'mt-1 shrink-0 rounded-full px-2 py-[3px] text-[10px] tracking-[0.12em]',
                  isPlaying
                    ? 'bg-lavender/35 text-lavender-deep'
                    : isMissing
                      ? 'bg-[#f3dcd6] text-[#8a4a45]'
                      : 'bg-white/60 text-ink-faint',
                )}
              >
                {isPlaying
                  ? '播放中'
                  : isLoading
                    ? '准备中'
                    : isMissing
                      ? '没能加载'
                      : status === 'error'
                        ? '卡住了'
                        : status === 'paused'
                          ? '已暂停'
                          : '待开启'}
              </span>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={toggle}
                aria-label={isPlaying ? '暂停背景音乐' : '播放背景音乐'}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#efe6fa,#f9e8e6)] text-lavender-deep shadow-[0_10px_24px_-16px_rgba(130,105,170,0.9)] transition-transform duration-300 hover:scale-[1.04] active:scale-95"
              >
                {isPlaying ? <Pause size={15} strokeWidth={1.8} /> : <Music2 size={16} strokeWidth={1.6} />}
              </button>

              <div className="flex min-w-0 flex-1 items-center gap-2">
                <VolumeIcon size={14} strokeWidth={1.6} className="shrink-0 text-ink-faint" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(volume * 100)}
                  onChange={(event) => setVolume(Number(event.target.value) / 100)}
                  className="mb-range w-full"
                  aria-label="音量"
                />
              </div>
            </div>

            <p className="mt-4 text-[11px] leading-[1.8] text-ink-ghost">
              {message ?? (isPlaying ? '音乐会在站内页面之间持续播放。' : '点一下左边的圆钮开始播放。')}
            </p>

            {isMissing ? (
              <p className="mt-2 rounded-2xl bg-white/55 px-3 py-2 text-[10.5px] leading-[1.7] text-ink-faint">
                音频文件 <code className="rounded bg-white/70 px-1 py-[1px] text-[10px] text-ink-soft">
                  public{AUDIO_TRACK.src}
                </code>{' '}
                没能加载出来，刷新一下或换个网络再试。
              </p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
