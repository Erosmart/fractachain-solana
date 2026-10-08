/** @type {import('next').NextConfig} */

/**
 * `/api/*` and `/health` are proxied at **runtime** by App Router handlers
 * (`src/app/api/[...path]/route.ts`, `src/app/health/route.ts`) using
 * BACKEND_URL. Do not bake Docker Compose hostname `backend` into rewrites —
 * that hostname does not resolve on Railway and caused ENOTFOUND.
 */
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
