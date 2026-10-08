/** @type {import('next').NextConfig} */

/**
 * Server-side proxy target for `/api/*` and `/health`.
 * Browser can use same-origin (empty NEXT_PUBLIC_API_URL) while Next forwards
 * to the Express backend — avoids HTML SPA responses on login.
 */
function backendProxyTarget() {
  const raw =
    process.env.BACKEND_URL ||
    process.env.API_PROXY_URL ||
    // Only fall back to NEXT_PUBLIC when it looks like a real backend, not the UI.
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8080';
  try {
    const u = new URL(raw);
    if (!u.protocol.startsWith('http')) return 'http://localhost:8080';
    return u.origin;
  } catch {
    return 'http://localhost:8080';
  }
}

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
  async rewrites() {
    const backend = backendProxyTarget();
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/health', destination: `${backend}/health` },
    ];
  },
};

module.exports = nextConfig;
