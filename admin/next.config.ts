import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  agentRules: false,
  // Development only: lets phones and laptops on the same Wi-Fi load the dev server's files.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    localPatterns: [{ pathname: '/media/**' }],
    formats: ['image/avif', 'image/webp'],
    qualities: [60, 75],
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/v1/:path*` },
      { source: '/media/:path*', destination: `${API}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
