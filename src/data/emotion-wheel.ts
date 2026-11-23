/**
 * 情绪转盘：8 种情绪，每种情绪「是为了获得……」与「处理方法」。
 *
 * 这 8 个扇形与主页那 12 颗情绪球是两套东西：
 * - 情绪球（data/emotions.ts）是「你此刻是什么心情」，点开给你一段陪伴；
 * - 转盘（本文件）是「这些情绪背后想要什么」，点开教你看见它、安放它。
 *
 * 顺序即转盘上顺时针的排列顺序（从正上方开始），颜色与情绪球的氛围色
 * 一一对应，转起来一眼就能认出哪一块是哪一种情绪。
 */
export interface EmotionSlice {
  id: string;
  /** 扇形标题（也出现在放大面板里） */
  label: string;
  /** 扇形主色（填充），全部低饱和、柔和，与全站「雾面」色盘一致 */
  color: string;
  /** 扇形描边/强调色（比主色深一档，用于分隔线与被点中的扇形） */
  edge: string;
  /** 该扇形内的文字颜色（保证在色块上清晰） */
  ink: string;
  /** 「是为了获得……」—— 这个情绪想告诉你、想替你要到的东西 */
  needs: string;
  /** 「处理方法」—— 一句不说道理、只给动作的陪伴 */
  method: string;
}

export const EMOTION_SLICES: readonly EmotionSlice[] = [
  {
    id: 'lost',
    label: '迷茫',
    color: '#C7E3DF',
    edge: '#8FC0BA',
    ink: '#4F8582',
    needs: '是为了获得方向，是站在岔路口，想看清自己真正想去哪。',
    method: '先别急着找答案。把「不知道」写下来，往前走一小步，路会慢慢清晰。',
  },
  {
    id: 'anxiety',
    label: '焦虑',
    color: '#DCC8F2',
    edge: '#B08FD8',
    ink: '#7B61A6',
    needs: '是为了获得确定，是太想把还没发生的事牢牢抓在手里。',
    method: '只做眼前能控制的那一小步，剩下的交给时间。先喘口气。',
  },
  {
    id: 'pain',
    label: '痛苦',
    color: '#E8B8C2',
    edge: '#C98898',
    ink: '#98495A',
    needs: '是为了获得释放，是心里有块地方真的撑不住了。',
    method: '先照顾好身体：睡一觉、吃口热的，或找人说说。你不需要一个人扛。',
  },
  {
    id: 'wronged',
    label: '委屈',
    color: '#EED6B8',
    edge: '#CEAC82',
    ink: '#A8825A',
    needs: '是为了获得公平，是想被看见、被说一句「你没错」。',
    method: '把委屈说出来，而不是咽下去。哪怕先讲给自己听，也算被听见了。',
  },
  {
    id: 'irritation',
    label: '烦躁',
    color: '#F2C4B8',
    edge: '#D99382',
    ink: '#B95F4C',
    needs: '是为了获得安静，是脑子里有太多声音，想让它停一停。',
    method: '离开让你烦的地方一会儿，喝口水、走走，或做一次呼吸放松。',
  },
  {
    id: 'loneliness',
    label: '孤独',
    color: '#B9C4E6',
    edge: '#8B99C8',
    ink: '#455488',
    needs: '是为了获得联结，是渴望被理解、被陪伴。',
    method: '给自己约一件小事：给老朋友发条消息，或去广场里说一句今天。',
  },
  {
    id: 'exhaustion',
    label: '疲惫',
    color: '#CFDCC2',
    edge: '#A0B48A',
    ink: '#788A66',
    needs: '是为了获得休息，是身体在说「我需要停下来」。',
    method: '今天就少做一件事。躺一会儿、发会儿呆，都不算浪费时间。',
  },
  {
    id: 'numbness',
    label: '麻木',
    color: '#D2D4D8',
    edge: '#A5A9B0',
    ink: '#7E828B',
    needs: '是为了获得感受，是想重新确认「我还活着、我还在意」。',
    method: '做一件能带来微小感受的事：喝杯烫的、摸一摸凉的，一点点找回知觉。',
  },
] as const;
