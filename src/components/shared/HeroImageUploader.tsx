'use client';

import { useState, useTransition } from 'react';
import { Upload, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui/primitives';

interface HeroImageUploaderProps {
  pageId: string;
  hasHeroImage: boolean;
  onEnhance: (pageId: string) => Promise<any>;
  onUpload: (pageId: string) => Promise<any>;
}

export function HeroImageUploader({ pageId, hasHeroImage, onEnhance, onUpload }: HeroImageUploaderProps) {
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<'upload' | 'enhance' | null>(null);

  const handleUpload = () => {
    setActiveAction('upload');
    startTransition(async () => {
      await onUpload(pageId);
      setActiveAction(null);
    });
  };

  const handleEnhance = () => {
    setActiveAction('enhance');
    startTransition(async () => {
      await onEnhance(pageId);
      setActiveAction(null);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      <button
        type="button"
        onClick={handleUpload}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md bg-white border border-line px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-surface-2 disabled:opacity-50 transition-colors"
      >
        {activeAction === 'upload' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {activeAction === 'upload' ? 'Uploading…' : 'Upload custom banner'}
      </button>

      {hasHeroImage && (
        <button
          type="button"
          onClick={handleEnhance}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-md bg-brand-50 border border-brand-100 px-3 py-1.5 text-[12px] font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors"
        >
          {activeAction === 'enhance' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {activeAction === 'enhance' ? 'Enhancing…' : 'AI Enhance banner'}
        </button>
      )}
    </div>
  );
}
