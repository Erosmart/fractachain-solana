/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Legacy demo paths at the root. `/orderbook` is live now — do not redirect it.
  async redirects() {
    return ['emision', 'licitaciones', 'portfolio'].map((p) => ({
      source: `/${p}`,
      destination: `/demo/${p}`,
      permanent: false,
    }));
  },
};

module.exports = nextConfig;
