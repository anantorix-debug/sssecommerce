import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
const isProd = process.env.NODE_ENV === 'production';

const csp = [
  "default-src 'self'",
  // Razorpay Checkout is the only third-party script. Google sign-in is a plain redirect, so it needs no script here.
  `script-src 'self' 'unsafe-inline' ${isProd ? '' : "'unsafe-eval'"} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // Don't generate AGENTS.md / CLAUDE.md files in the project.
  agentRules: false,
  // Development only: lets phones and laptops on the same Wi-Fi load the dev server's files.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    localPatterns: [{ pathname: '/media/**' }, { pathname: '/images/**' }, { pathname: '/brand/**' }],
    formats: ['image/avif', 'image/webp'],
    qualities: [60, 75, 85],
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1600, 1920, 2560],
    imageSizes: [64, 96, 128, 256, 384],
    minimumCacheTTL: 31_536_000,
  },
  async rewrites() {
    // In production Nginx routes /api and /media directly; these keep development to one origin.
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
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")' },
          ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
