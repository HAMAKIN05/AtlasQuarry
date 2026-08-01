import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker イメージを小さく保つため standalone 出力にする（技術仕様書 §12.5）
  output: 'standalone',
  // ネイティブモジュールと pg は bundle させずに実体を require させる
  serverExternalPackages: ['@node-rs/argon2', 'pg'],
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
