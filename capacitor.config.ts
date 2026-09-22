import type { CapacitorConfig } from '@capacitor/cli';

// maTAI needs its Next.js server (API routes, Prisma, AI provider), so the
// Android app is a native shell that loads the deployed site.
// Set CAP_SERVER_URL at build time (GitHub Actions variable or local env).
// Without it, the app shows the offline shell in mobile/www.
//
// The app opens the mobile tourist view (/m). A bare site URL gets /m
// appended; a URL with a path is used as given.
function appUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/m';
    return url.toString();
  } catch {
    return value;
  }
}

const serverUrl = appUrl(process.env.CAP_SERVER_URL);

const config: CapacitorConfig = {
  appId: 'in.matai.app',
  appName: 'maTAI',
  webDir: 'mobile/www',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
        androidScheme: 'https',
      }
    : { androidScheme: 'https' },
};

export default config;
