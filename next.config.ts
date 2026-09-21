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
  // The tourist experience is the front door. The product overview lives at
  // /about. Temporary (307), so the choice can change without browsers having
  // cached a permanent redirect.
  async redirects() {
    return [{ source: '/', destination: '/explore', permanent: false }];
  },
};

export default nextConfig;
