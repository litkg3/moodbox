import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Database, HeartHandshake, Music2, ShieldCheck } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

export const metadata: Metadata = {
  title: '关于',
  description: '情绪盒子的设计理念、创作初衷、数据说明与非诊疗声明。',
};

const STEPS = [
  {
    step: '01',
    title: '选择一个情绪',
    body: '首页漂浮着十一颗颜色不同的球。没有下拉菜单，也没有分值量表，你只需要走近看起来像此刻的那一颗。',
  },
  {
    step: '02',
    title: '得到一段陪伴',
    body: '每颗球里都有十五条不一样的回应。它们不劝你振作，也不替你的感受下定义，只是承认这一刻确实不容易。',
  },
  {
    step: '03',
    title: '收藏一件快乐',
    body: '生活里那些很小的好事——刚好的阳光、一碗温着的汤——可以写下来，放进快乐收藏馆。',
  },
  {
    step: '04',
    title: '在低落时重新遇见',
    body: '点开「我不开心了」，盒子会随机拿出一份你曾经收藏的快乐。那些快乐没有消失，只是等你回来。',
  },
];

export default function AboutPage() {
  return (
    <PageShell width="narrow">
      <header className="mb-14 sm:mb-20">
        <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">About MoodBox</p>
        <h1 className="mt-4 font-display text-[28px] font-light leading-[1.55] tracking-[0.08em] text-ink sm:text-[38px]">
          一个安静的地方，
          <br />
          用来放情绪和快乐。
        </h1>
        <p className="mt-6 max-w-[40ch] text-[13px] leading-[2.05] text-ink-soft/90 sm:text-[14px]">
          情绪盒子不是一份心理测评，也不是一个要求你「变好」的工具。
          它更接近一个抽屉：你把此刻的心情放进去，把舍不得忘的小事收起来，
          需要的时候再打开看看。
        </p>
      </header>

      <Section index="01" title="为什么做这件事">
        <p>
          大部分情绪记录产品都在问你「今天打几分」。分数很好统计，但它留不住任何东西：
          你很难在三个月后因为一个 4 分而想起那天发生了什么。
        </p>
        <p>
          我们想换一种方式。让情绪先变成一种可以看见、可以触碰的东西——
          一颗颜色偏冷的球，一颗边缘发灰的球。你不需要先学会描述自己，
          只需要认出它。
        </p>
        <p>
          同时，我们也想处理一个常被忽略的时刻：当一个人很低落的时候，
          最需要的往往不是新的建议，而是被提醒——
          「你曾经也是快乐的，那些事情真的发生过。」
          于是快乐收藏馆和「我不开心了」构成了这个产品真正的闭环。
        </p>
      </Section>

      <Section index="02" title="它是怎么工作的">
        <ol className="space-y-7">
          {STEPS.map((item) => (
            <li key={item.step} className="flex gap-5">
              <span className="mt-[3px] shrink-0 font-display text-[11px] tracking-[0.2em] text-ink-ghost">
                {item.step}
              </span>
              <div>
                <h3 className="font-display text-[14.5px] font-normal tracking-[0.06em] text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-[12.5px] leading-[2] text-ink-soft/85">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8">
          你主动记录的情绪会出现在情绪日历上，成为一条只属于你的时间线。
          没有记录的日子保持空白——我们不替你猜测那天的心情。
        </p>
      </Section>

      <Section index="03" title="关于你的数据">
        <div className="rounded-[22px] border border-white/70 bg-white/45 p-5 sm:p-6">
          <div className="flex gap-3">
            <Database size={16} strokeWidth={1.6} className="mt-[2px] shrink-0 text-ink-faint" />
            <div className="space-y-3 text-[12.5px] leading-[2] text-ink-soft/90">
              <p>
                所有快乐记忆、图片与情绪记录都保存在你自己浏览器的 IndexedDB 里，
                <strong className="font-medium text-ink">不会上传到任何服务器</strong>，
                也没有账号系统。换一台设备，就看不到这一台设备上的记录。
              </p>
              <p>
                这也意味着：清除网站数据、使用无痕窗口、卸载浏览器，都可能让记录消失。
                建议在「快乐收藏馆 → 备份与隐私」里定期导出一份 JSON 备份。
              </p>
              <p>图片会先在本地压缩，再以二进制形式存进数据库，不会塞进 localStorage。</p>
            </div>
          </div>
        </div>
      </Section>

      <Section index="04" title="它不是心理治疗">
        <div className="flex gap-3 rounded-[22px] border border-[rgba(158,95,92,0.16)] bg-[rgba(247,231,228,0.5)] p-5 sm:p-6">
          <HeartHandshake
            size={16}
            strokeWidth={1.5}
            className="mt-[2px] shrink-0 text-[#9a6660]"
            aria-hidden="true"
          />
          <div className="space-y-3 text-[12.5px] leading-[2] text-[#7d5a58]">
            <p>
              情绪盒子是一款情感陪伴类的网页作品，不具备心理评估、诊断或治疗功能，
              也不能替代心理咨询与医疗帮助。页面中的文字只是陪伴，不是建议或处方。
            </p>
            <p>
              如果你长期被情绪困扰，或出现伤害自己的念头，请尽快联系你信任的人，
              或寻求当地专业的心理援助与紧急救助资源。你不需要一个人扛着。
            </p>
          </div>
        </div>
      </Section>

      <Section index="05" title="关于音乐">
        <div className="flex gap-3">
          <Music2 size={16} strokeWidth={1.6} className="mt-[3px] shrink-0 text-ink-faint" />
          <p>
            背景音乐是 <strong className="font-medium text-ink">《Long Day》</strong>，作者 PurrpleCat，
            发布于 <strong className="font-medium text-ink">Pixabay</strong>。这是一首无人声的纯音乐，
            起伏很轻，放在这里只是为了给页面垫一层安静的气味，不抢文字的位置。
          </p>
          <p className="mt-3">
            音乐不会自动播放，需要你点右上角的「音乐」按钮；音量和开关都会被记住，
            下次进来还是你上次的选择。不想听的时候关掉就好，不影响其它任何功能。
          </p>
        </div>
      </Section>

      <Section index="06" title="关于这个作品">
        <p>
          情绪盒子是一个参赛作品，使用 Next.js（App Router）、React、TypeScript 与 Tailwind CSS 构建，
          动画由 Motion for React 与 CSS 关键帧共同完成，数据层基于浏览器原生 IndexedDB。
          全站不依赖任何远程字体、图片或第三方统计脚本。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['Next.js', 'React 19', 'TypeScript', 'Tailwind CSS', 'Motion', 'IndexedDB', 'date-fns'].map(
            (tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/70 bg-white/50 px-3 py-1 text-[10.5px] tracking-[0.08em] text-ink-faint"
              >
                {tag}
              </span>
            ),
          )}
        </div>
        <div className="mt-9 flex items-center gap-2 text-[11.5px] tracking-[0.06em] text-ink-ghost">
          <ShieldCheck size={13} strokeWidth={1.6} />
          没有广告、没有追踪、没有数据买卖。
        </div>
      </Section>

      <footer className="mt-14 border-t border-[rgba(141,133,152,0.16)] pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[12px] tracking-[0.08em] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.6} />
          回到情绪空间
        </Link>
        <p className="mt-8 font-display text-[13px] font-light tracking-[0.1em] text-ink-faint">
          让情绪有处安放，让快乐有迹可循。
        </p>
      </footer>
    </PageShell>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14 sm:mb-16">
      <div className="mb-5 flex items-baseline gap-3">
        <span className="font-display text-[10.5px] tracking-[0.24em] text-ink-ghost">{index}</span>
        <h2 className="font-display text-[16px] font-normal tracking-[0.1em] text-ink sm:text-[18px]">
          {title}
        </h2>
      </div>
      <div className="space-y-4 text-[13px] leading-[2.05] text-ink-soft/88">{children}</div>
    </section>
  );
}
