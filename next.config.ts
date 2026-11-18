import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 开发时隐藏 Next 的悬浮指示球，避免遮挡情绪球舞台
  devIndicators: false,
  // 没有任何远程图片域名，所有图片都以 Blob/ObjectURL 形式在本地渲染。
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
