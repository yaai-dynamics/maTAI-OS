'use client';

import { useState, useTransition } from 'react';
import { Upload, X, Wand2, Image as ImageIcon, Video, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui/primitives';
import type { GalleryMedia } from '@/lib/types';

interface MediaGalleryUploaderProps {
  pageId: string;
  media: GalleryMedia[];
  onAdd: (pageId: string, type: 'IMAGE' | 'VIDEO', url: string, thumbnailUrl?: string) => Promise<any>;
  onRemove: (pageId: string, mediaId: string) => Promise<any>;
  onEnhance: (pageId: string, mediaId: string) => Promise<any>;
}

export function MediaGalleryUploader({ pageId, media, onAdd, onRemove, onEnhance }: MediaGalleryUploaderProps) {
  const [isPending, startTransition] = useTransition();
  const [enhancingId, setEnhancingId] = useState<string | null>(null);

  // Mock uploading
  const handleUpload = () => {
    const isVideo = Math.random() > 0.7; // randomly mock a video
    const type = isVideo ? 'VIDEO' : 'IMAGE';
    
    // Generate some mock URLs from unsplash / stock videos
    const randomId = Math.floor(Math.random() * 1000);
    const url = isVideo 
      ? 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' 
      : `https://picsum.photos/seed/${randomId}/800/600`;
    
    const thumbnailUrl = isVideo 
      ? `https://picsum.photos/seed/${randomId}/400/300` 
      : url;

    startTransition(async () => {
      await onAdd(pageId, type, url, thumbnailUrl);
    });
  };

  const handleRemove = (mediaId: string) => {
    startTransition(async () => {
      await onRemove(pageId, mediaId);
    });
  };

  const handleEnhance = (mediaId: string) => {
    setEnhancingId(mediaId);
    startTransition(async () => {
      await onEnhance(pageId, mediaId);
      setEnhancingId(null);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-ink-900">Media Gallery</h3>
        <button
          type="button"
          onClick={handleUpload}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-md bg-brand-50 px-3 py-1.5 text-[13px] font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
        >
          <Upload size={14} />
          Upload
        </button>
      </div>

      {!media || media.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line p-8 text-center">
          <ImageIcon className="mb-2 text-ink-300" size={24} />
          <p className="text-[13px] font-medium text-ink-700">No media yet</p>
          <p className="text-[12px] text-ink-500">Upload images and videos to showcase your offering.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {media.map((item) => (
            <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-2">
              <img
                src={item.thumbnailUrl || item.url}
                alt=""
                className={cn(
                  "h-full w-full object-cover transition-all duration-300",
                  enhancingId === item.id ? "scale-105 blur-sm brightness-50" : "group-hover:scale-105"
                )}
              />
              
              {/* Type indicator */}
              <div className="absolute left-2 top-2 rounded-md bg-black/60 p-1 backdrop-blur-sm">
                {item.type === 'VIDEO' ? <Video size={14} className="text-white" /> : <ImageIcon size={14} className="text-white" />}
              </div>

              {/* Actions */}
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                {item.type === 'IMAGE' && (
                  <button
                    type="button"
                    onClick={() => handleEnhance(item.id)}
                    disabled={isPending || enhancingId === item.id}
                    className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-brand-500 disabled:opacity-50"
                    title="AI Enhance"
                  >
                    {enhancingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  disabled={isPending}
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-risk-500 disabled:opacity-50"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Enhancing overlay */}
              {enhancingId === item.id && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                  <Loader2 size={24} className="animate-spin text-brand-400" />
                  <span className="text-[11px] font-medium tracking-wide">Enhancing...</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
