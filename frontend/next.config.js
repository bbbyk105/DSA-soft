/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // 開発時の React.StrictMode による useEffect の二重実行を無効化し、
  // Mol* 内部での createRoot 警告を抑制する（必要に応じて有効化してもよい）
  reactStrictMode: false,
  // Next.js 16ではTurbopackがデフォルトのため、webpack設定がある場合はturbopack設定も必要
  turbopack: {},
  webpack: (config, { isServer }) => {
    // ブラウザバンドルで Node.js 組み込みやネイティブモジュールを解決しないようにする
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
      };

      // Mol* が内部で利用する H.264 エンコーダー（ネイティブ依存）をバンドル対象から外す
      // MolstarViewer 側で mp4-export 拡張機能は無効化しているため、ブラウザでは不要
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'h264-mp4-encoder': false,
      };
    }

    return config;
  },
};

module.exports = nextConfig;
