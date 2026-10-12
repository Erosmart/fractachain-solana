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
  // Legacy root paths → real routes (the demo was removed).
  async redirects() {
    return [
      { source: '/emision', destination: '/admin/emision', permanent: false },
      { source: '/licitaciones', destination: '/mercado', permanent: false },
      { source: '/portfolio', destination: '/dashboard', permanent: false },
      { source: '/demo/:path*', destination: '/mercado', permanent: false },
    ];
  },
};

module.exports = nextConfig;
