'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Play, Image as ImageIcon, Video } from 'lucide-react';
import type { GalleryMedia } from '@/lib/types/landing-page';
import { cn } from '@/components/ui/primitives';

interface MediaGalleryLightboxProps {
  media: GalleryMedia[];
}

export function MediaGalleryLightbox({ media }: MediaGalleryLightboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') setIsOpen(false);
      if (e.key === 'ArrowLeft') showPrev();
      if (e.key === 'ArrowRight') showNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex]);

  if (!media || media.length === 0) return null;

  const showNext = () => setCurrentIndex((i) => (i + 1) % media.length);
  const showPrev = () => setCurrentIndex((i) => (i - 1 + media.length) % media.length);
  
  const currentItem = media[currentIndex];

  return (
    <div className="mt-8 space-y-4">
      <h3 className="text-[18px] font-semibold text-ink-900">Gallery</h3>
      
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setCurrentIndex(index);
              setIsOpen(true);
            }}
            className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2 transition-transform hover:scale-[1.02] hover:shadow-md"
          >
            <img
              src={item.thumbnailUrl || item.url}
              alt=""
              className="h-full w-full object-cover"
            />
            {item.type === 'VIDEO' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink-900 backdrop-blur-sm">
                  <Play size={20} className="ml-1" />
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm">
          {/* Controls */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X size={24} />
          </button>

          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={showPrev}
                className="absolute left-4 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ChevronLeft size={32} />
              </button>
              <button
                type="button"
                onClick={showNext}
                className="absolute right-4 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <ChevronRight size={32} />
              </button>
            </>
          )}

          {/* Main content */}
          <div className="relative flex h-full max-h-[85vh] w-full max-w-5xl items-center justify-center p-4">
            {currentItem.type === 'VIDEO' ? (
              <video
                src={currentItem.url}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-lg shadow-2xl"
              />
            ) : (
              <img
                src={currentItem.url}
                alt=""
                className="max-h-full max-w-full rounded-lg shadow-2xl object-contain"
              />
            )}
            
            {/* Status indicator for mocked AI edits */}
            {currentItem.url.includes('enhanced=true') && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-brand-500/90 px-4 py-1.5 text-[13px] font-medium text-white backdrop-blur-md">
                ✨ AI Enhanced
              </div>
            )}
          </div>

          {/* Thumbnails at bottom */}
          {media.length > 1 && (
            <div className="absolute bottom-4 inset-x-0 flex justify-center gap-2 px-4 overflow-x-auto pb-2">
              {media.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md transition-all",
                    index === currentIndex ? "ring-2 ring-white scale-110 opacity-100" : "opacity-50 hover:opacity-100"
                  )}
                >
                  <img src={item.thumbnailUrl || item.url} alt="" className="h-full w-full object-cover" />
                  {item.type === 'VIDEO' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play size={12} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
