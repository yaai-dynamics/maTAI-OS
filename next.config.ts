import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // CLAUDE.md is the authoritative product specification for this repository.
  // Next.js otherwise appends its own agent-rules block to it on every dev run.
  agentRules: false,
  // The hackathon demo must run without external services. Remote images are
  // therefore not used anywhere in the MVP; all visuals are generated locally.
  images: { remotePatterns: [] },
  env: {
    NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? 'true',
  },
  // Development only: `next dev` refuses its live-reload connection from any
  // origin but localhost, so a phone opening http://<LAN IP>:3000/m gets the
  // page but never the updates. The emulator reaches the host as 10.0.2.2.
  // Add another machine's address with DEV_ORIGINS=192.168.1.20,192.168.1.21.
  allowedDevOrigins: [
    '192.168.1.16',
    '10.0.2.2',
    ...(process.env.DEV_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? []),
  ],
  // The tourist experience is the front door. The product overview lives at
  // /about. Temporary (307), so the choice can change without browsers having
  // cached a permanent redirect. Phones get the mobile app (/m); tablets and
  // computers the responsive site. Only the root: /explore stays reachable on
  // a phone for anyone who wants it.
  async redirects() {
    return [
      {
        source: '/',
        has: [{ type: 'header', key: 'user-agent', value: '.*(iPhone|iPod|Android.+Mobile|Windows Phone).*' }],
        destination: '/m',
        permanent: false,
      },
      { source: '/', destination: '/explore', permanent: false },
    ];
  },
};

export default nextConfig;
