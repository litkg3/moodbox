# 背景音乐

本目录存放站点的背景音乐，随项目一起分发。

## 当前曲目

| 项 | 内容 |
| --- | --- |
| 曲名 | 《Long Day》 |
| 作者 | PurrpleCat（发布在 [Pixabay](https://pixabay.com/music/)） |
| 文件 | `public/audio/long-day.mp3` |
| 授权 | Pixabay Content License（可免费用于商业与非商业项目，无需署名） |

配置在 `src/lib/audio-config.ts`：

```ts
export const AUDIO_TRACK: AudioTrackConfig = {
  title: 'Long Day',
  artist: 'PurrpleCat · Pixabay',
  src: '/audio/long-day.mp3',
  defaultVolume: 0.35,
  loop: true,
};
```

## 更换曲目

1. 把新的音频放到本目录，例如 `public/audio/xxx.mp3`；
2. 修改上面的 `title`、`artist`、`src` 三行；
3. 刷新页面，点击右上角「音乐」按钮开启。

## 没有音频文件时会怎样

- 播放器在页面加载时就会探测音源并提前缓冲（`<audio preload="auto">`），不需要等你点播放才发现；
- 右上角「音乐」按钮上会出现一个 5px 的暖色小圆点，展开面板后状态徽标显示「没能加载」，并给出文件路径说明；
- 此时点击播放不会卡在「准备中」，而是立刻回到「没能加载」；
- 浏览器控制台会出现一条 `/audio/xxx.mp3` 的 404 —— 这是「文件没有随项目分发」的事实，不是程序错误；放入文件后该报错消失；
- 网站其它功能完全不受影响，也不会假装正在播放。

## 建议

- 使用 128kbps 的 mp3 / m4a，文件控制在 3MB 以内（本站这首《Long Day》就是 128kbps、约 2.9MB，全程 3 分钟）；
- 音乐应当是无人声、低起伏的氛围音乐，避免打断阅读文案；
- 首次进入不会自动播放（浏览器策略 + 尊重用户），需要用户主动点击。
