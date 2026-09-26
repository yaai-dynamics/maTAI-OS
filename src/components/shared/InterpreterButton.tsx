'use client';

import { Languages } from 'lucide-react';
import { cn } from '@/components/ui/primitives';

export function InterpreterButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-[13px] font-semibold text-slate-700 shadow-raised transition-transform hover:scale-[1.03] hover:bg-slate-50 border border-slate-200',
        className,
      )}
      title="Live Interpreter"
    >
      <Languages aria-hidden size={18} className="text-brand-600" />
      Interpreter
    </button>
  );
}
