/**
 * 背景氛围层。
 *
 * 白日：柔光渐变 + 缓慢漂移的极光 + 极细噪点。
 * 星空：深靛蓝夜空 + 星点 + 一层薄月亮，与白日共用同一套空间关系。
 *
 * 星点位置用固定种子的伪随机数生成，函数在模块作用域内执行一次，
 * 因此服务端与客户端拿到的坐标完全一致（本组件是 Server Component，
 * 不参与水合，这样做也顺带让每次构建的星图保持稳定）。
 */

/** 极简 LCG：只为了得到可复现的随机数，不用于任何安全场景。 */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  bright: boolean;
}

function buildStars(count: number): Star[] {
  const random = makeRandom(20261112);
  const stars: Star[] = [];
  for (let index = 0; index < count; index += 1) {
    const bright = random() > 0.86;
    stars.push({
      id: index,
      x: Math.round(random() * 1000) / 10,
      y: Math.round(random() * 1000) / 10,
      size: bright ? 2.2 + random() * 1.5 : 1 + random() * 1.2,
      duration: 3.6 + random() * 5.4,
      delay: Math.round(random() * 70) / 10,
      bright,
    });
  }
  return stars;
}

const STARS = buildStars(132);

export function AmbientBackground() {
  return (
    <>
      <div className="mb-stage" aria-hidden="true">
        <span className="mb-aurora mb-aurora--one" />
        <span className="mb-aurora mb-aurora--two" />
        <span className="mb-aurora mb-aurora--three" />
        <span className="mb-milkyway" />

        <div className="mb-starfield">
          {STARS.map((star) => (
            <span
              key={star.id}
              className="mb-stardot"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                boxShadow: star.bright ? '0 0 8px 1px rgba(226, 220, 255, 0.75)' : 'none',
                ['--star-duration' as string]: `${star.duration}s`,
                ['--star-delay' as string]: `${star.delay}s`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="mb-grain" aria-hidden="true" />
    </>
  );
}
