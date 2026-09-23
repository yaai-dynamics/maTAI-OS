'use client';

import { useState } from 'react';

import { cn } from '@/components/ui/primitives';

/**
 * Social sharing for a published landing page. Plain share-intent links —
 * no SDK, no app keys — so it works the same whether or not the visitor is
 * signed into anything. `onShare` is fire-and-forget: a share the platform
 * never hears back about (the visitor closed the share sheet) should not
 * block or error the button.
 */

const CHANNELS = (url: string, title: string) => [
  { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
  { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { id: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
  { id: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
];

export function ShareBar({
  url,
  title,
  onShare,
  className,
}: {
  /** Absolute URL of the page being shared. */
  url: string;
  title: string;
  /** Records that a share was started. Never blocks the click. */
  onShare: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    onShare();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the link is still visible in the address bar.
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {CHANNELS(url, title).map((channel) => (
        <a
          key={channel.id}
          href={channel.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onShare}
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-700 hover:bg-surface-2"
        >
          {channel.label}
        </a>
      ))}
      <button
        type="button"
        onClick={copyLink}
        className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-700 hover:bg-surface-2"
      >
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
}
