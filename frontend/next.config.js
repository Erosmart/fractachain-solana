/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // The demo used to live at the root; old links keep working. /orderbook is
  // now the real Manifest book, so it is no longer redirected.
  async redirects() {
    return ['emision', 'licitaciones', 'portfolio'].map((p) => ({
      source: `/${p}`,
      destination: `/demo/${p}`,
      permanent: false,
    }));
  },
};

module.exports = nextConfig;
