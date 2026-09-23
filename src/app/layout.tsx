import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'OneStop Manipur',
    template: '%s — OneStop Manipur',
  },
  description:
    'An intelligent tourism ecosystem connecting tourists, local tourism businesses, creators and the Tourism Department through a shared Manipur tourism knowledge and intelligence layer.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#452b63',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Browser extensions (ColorZilla, Grammarly…) add attributes to <body>
          before React hydrates. This ignores mismatches on this element only. */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
