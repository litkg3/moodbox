/**
 * 情绪转盘：8 种情绪，每种情绪「是为了获得……」与「处理方法」。
 *
 * 这 8 个扇形与主页那 12 颗情绪球是两套东西：
 * - 情绪球（data/emotions.ts）是「你此刻是什么心情」，点开给你一段陪伴；
 * - 转盘（本文件）是「这些情绪背后想要什么」，点开教你看见它、安放它。
 *
 * 顺序即转盘上逆时针的排列顺序（从正上方开始），颜色刻意错开相邻色相，
 * 转起来才分得清哪一块是哪一块。
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
    id: 'anger',
    label: '愤怒',
    color: '#BBD6F2',
    edge: '#7EA6D8',
    ink: '#3C5F8C',
    needs: '是为了获得公平，是想守住一条被越过的界限。',
    method: '先给这股劲找个去处：出门快走、深呼吸，等心跳慢下来再决定要不要开口。',
  },
  {
    id: 'tired',
    label: '疲惫',
    color: '#D8E7C8',
    edge: '#A9C78F',
    ink: '#4F7040',
    needs: '是为了获得休息，是身体在说「我需要停下来」。',
    method: '今天就少做一件事。躺一会儿、发会儿呆，都不算浪费时间。',
  },
  {
    id: 'sad',
    label: '悲伤',
    color: '#E4E9B8',
    edge: '#BEC76F',
    ink: '#6B7238',
    needs: '是为了获得看见，是心里有一块地方真的需要被接住。',
    method: '不用急着好起来。允许自己哭一场，或把难过写下来，让它先落地。',
  },
  {
    id: 'helpless',
    label: '无助',
    color: '#CBB6E8',
    edge: '#9C80C8',
    ink: '#594A82',
    needs: '是为了获得依靠，是太想有人搭把手，却不知向谁开口。',
    method: '把「我做不到」改成「我需要一点帮忙」，然后挑一个信得过的人，说一句试试。',
  },
  {
    id: 'lonely',
    label: '孤独',
    color: '#D8D2EE',
    edge: '#A79ED0',
    ink: '#544D84',
    needs: '是为了获得联结，是渴望被理解、被陪伴。',
    method: '给自己约一件小事：给老朋友发条消息，或去广场里说一句今天。',
  },
  {
    id: 'jealous',
    label: '嫉妒',
    color: '#F4DCA0',
    edge: '#D4B26A',
    ink: '#7A6232',
    needs: '是为了获得自己，是它其实照见了你想要却还没拥有的东西。',
    method: '别骂自己。把嫉妒翻译成一句「我其实也想要」，然后为它迈一小步。',
  },
  {
    id: 'shame',
    label: '羞愧',
    color: '#F2C7C9',
    edge: '#D69398',
    ink: '#7E4A50',
    needs: '是为了获得原谅，是那个「做错了」的自己，在等一句没关系。',
    method: '把「我很糟糕」和「这件事没做好」分开。事情可以改，你不必被它定义。',
  },
  {
    id: 'anxious',
    label: '焦虑',
    color: '#BBDDE8',
    edge: '#7FB4C8',
    ink: '#3E6B7C',
    needs: '是为了获得确定，是太想把还没发生的事牢牢抓在手里。',
    method: '只做眼前能控制的那一小步，剩下的交给时间。先喘口气。',
  },
] as const;
