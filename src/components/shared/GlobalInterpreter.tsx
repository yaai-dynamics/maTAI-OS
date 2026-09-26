'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Headphones } from 'lucide-react';
import { InterpreterModule } from './InterpreterModule';

export function GlobalInterpreter() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-brand-600 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        title="AI Interpreter"
      >
        <Bot aria-hidden size={16} />
        Interpreter
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <InterpreterModule 
            onClose={() => setIsOpen(false)} 
            className="w-full max-w-sm max-h-[85vh] h-full shadow-2xl"
          />
        </div>,
        document.body
      )}
    </>
  );
}
