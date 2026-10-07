/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // The demo used to live at the root; old links keep working.
  async redirects() {
    return ['emision', 'licitaciones', 'orderbook', 'portfolio'].map((p) => ({
      source: `/${p}`,
      destination: `/demo/${p}`,
      permanent: false,
    }));
  },
};

module.exports = nextConfig;

module.exports = nextConfig;
