import type { HealingStory } from '@/types';

/**
 * 内置治愈故事。
 *
 * 全部为本项目原创的短篇，写的是"被接住"的具体瞬间，
 * 不讲道理、不给建议、不暗示任何治疗效果。
 * 这几篇在数据库首次创建时写入一次（见 lib/db.ts 的 v2 升级分支），
 * 之后管理员可以把它们删掉，不会再次自动补回。
 */
const SEED_CREATED_AT = '2026-11-01T09:00:00.000Z';

export const SEED_STORIES: readonly HealingStory[] = [
  {
    id: 'seed_story_night_store',
    title: '凌晨三点的便利店',
    theme: 'night',
    author: '情绪盒子',
    content: `值班的人正在把过期的关东煮一个个捞出来，动作很轻。
你买了一罐热牛奶。他没有问你为什么这么晚还醒着，只是把微波炉多按了十秒。

走出门的时候风还是很冷。但那罐牛奶从手心一直暖到手腕。

后来你想，那天其实什么都没被解决。
可有人替你多想了一点点，你就又走回家去了。`,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
    isDemo: true,
  },
  {
    id: 'seed_story_golden_bowl',
    title: '补过金的碗',
    theme: 'growth',
    author: '情绪盒子',
    content: `奶奶有一只摔过的碗，裂缝里补着金。
你说这样不好看，她说，裂过的地方最结实。

你不信。直到有一天你也摔了一跤，
爬起来之后发现，自己在某些地方确实比以前稳了。
不是因为伤好了，是因为你知道了怎么站。

后来你不再急着把裂的地方藏起来。
你只是把它放在桌上，盛一碗热汤。`,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
    isDemo: true,
  },
  {
    id: 'seed_story_stray_cat',
    title: '楼下的那只猫',
    theme: 'company',
    author: '情绪盒子',
    content: `它每天傍晚蹲在同一级台阶上，谁也不知道它在等谁。

你第一次经过，它抬头看了你一眼。
第二次，它挪了挪位置。
第七次，它走过来蹭了一下你的鞋。

你什么都没给它，它也没有要求什么。

有些陪伴不需要理由，也不需要承诺。
它只是恰好在那里，而你也恰好路过。`,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
    isDemo: true,
  },
  {
    id: 'seed_story_fallow',
    title: '允许这块地空着',
    theme: 'rest',
    author: '情绪盒子',
    content: `老周种了三十年地。有一年他说要休耕，让那块地什么都不种。
邻居笑他懒。他说，地也要喘口气，一直种，长出来的东西会越来越小。

那年秋天，他的地里长满了野花。
第二年，收成是这些年最好的。

他蹲在田埂上抽烟，说：人也一样。
空着不是荒废，是在攒下一次生长的力气。`,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
    isDemo: true,
  },
  {
    id: 'seed_story_paper',
    title: '那张没及格的卷子',
    theme: 'courage',
    author: '情绪盒子',
    content: `卷子发下来的时候，你把它揉成一团塞进书包。

晚自习，班主任走过来，没提分数，
只是把一杯热水放在你桌角，说：这道题思路是对的，只是算错了。

你后来才知道，他是全班唯一一个把每个人的错题都重算了一遍的人。

那天你哭得很小声。
但第二天你把卷子展开，抚平，一道一道重新做了一遍。`,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
    isDemo: true,
  },
  {
    id: 'seed_story_tea',
    title: '她记得你喝茶不加糖',
    theme: 'warmth',
    author: '情绪盒子',
    content: `你只在很多年前随口说过一次，喝茶不加糖。

很多年后，在一场乱哄哄的聚会上，
她把杯子递过来，说：你的，没加糖。

你愣了一下。原来有些话，说的人忘了，听的人一直记着。

被记住的感觉很轻。
轻到你走出门才发觉，心里有一个地方被悄悄焐热了。`,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
    isDemo: true,
  },
];
