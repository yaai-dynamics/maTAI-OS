'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Mic, MicOff, Volume2, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/components/ui/primitives';

type Message = {
  id: string;
  speaker: 'me' | 'other';
  originalText: string;
  translatedText: string;
  language: string;
};

const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'mni', name: 'Meitei/Manipuri' },
  { id: 'hi', name: 'Hindi' },
  { id: 'fr', name: 'French' },
];

const MOCK_CONVERSATION = [
  {
    speaker: 'me',
    text: 'Hello, can you help me find the nearest heritage site?',
    translation: 'ꯈꯨꯔꯨꯝꯖꯔꯤ, ꯈ꯭ꯋꯥꯏꯗꯒꯤ ꯅꯛꯄꯥ ꯍꯦꯔꯤꯇꯦꯖ ꯁꯥꯏꯠꯇꯥ ꯆꯠꯅꯕꯥ ꯃꯇꯦꯡ ꯄꯥꯡꯕꯤꯕꯥ ꯌꯥꯒꯗ꯭ꯔꯥ?',
  },
  {
    speaker: 'other',
    text: 'Yes, Kangla Fort is just 2 kilometers away from here.',
    translation: 'Yes, Kangla Fort is just 2 kilometers away from here.', // Mock: English translation for the user
    original: 'ꯍꯣꯌ, ꯀꯪꯂꯥ ꯐꯣꯔꯠ ꯃꯐꯝ ꯑꯁꯤꯗꯒꯤ ꯀꯤꯂꯣꯃꯤꯇꯔ ꯲ ꯈꯛꯇꯃꯛ ꯂꯥꯞꯅꯥ ꯂꯩ꯫',
  },
  {
    speaker: 'me',
    text: 'Thank you! How do I get there?',
    translation: 'ꯌꯥꯝꯅꯥ ꯅꯨꯡꯉꯥꯏꯖꯔꯦ! ꯑꯩꯅꯥ ꯃꯐꯝ ꯑꯗꯨꯗꯥ ꯀꯔꯝꯅꯥ ꯆꯠꯀꯗꯒꯦ?',
  },
];

export function InterpreterModule({ onClose, className }: { onClose: () => void; className?: string }) {
  const [myLang, setMyLang] = useState('en');
  const [otherLang, setOtherLang] = useState('hi');
  const [isMicOn, setIsMicOn] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mockIndex, setMockIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const playAudio = (text: string, lang: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const langMap: Record<string, string> = {
        en: 'en-US',
        hi: 'hi-IN',
        fr: 'fr-FR',
        mni: 'hi-IN'
      };
      utterance.lang = langMap[lang] || lang;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in this browser.");
    }
  };

  const translateText = async (text: string, from: string, to: string) => {
    // Mockup overrides for perfect demo experience
    const lowerText = text.toLowerCase().trim();
    if (lowerText.includes('khana kha liya') || lowerText.includes('खाना खा लिया')) {
      if (to === 'en') return 'Have you eaten?';
    }
    if (lowerText === 'hello' || lowerText === 'hi') {
      if (to === 'hi') return 'नमस्ते';
      if (to === 'mni') return 'ꯈꯨꯔꯨꯝꯖꯔꯤ';
    }
    if (lowerText.includes('how are you')) {
      if (to === 'hi') return 'आप कैसे हैं?';
    }
    if (lowerText === 'एस आई एम' || lowerText === 'sim') {
      if (to === 'en') return 'Yes, I am';
    }

    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
      const data = await res.json();
      if (data && data.responseData && data.responseData.translatedText && data.responseData.match > 0.5) {
        return data.responseData.translatedText;
      }
      return `${text} [Mock Translation]`;
    } catch (e) {
      console.error('Translation failed', e);
      return `${text} [Mock Translation]`;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          handleRealSpeech(transcript);
        };
        
        recognition.onend = () => {
          setIsMicOn(false);
        };
        
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsMicOn(false);
        };
        
        recognitionRef.current = recognition;
      }
    }
  }, []);

  const detectLanguage = (text: string, langA: string, langB: string) => {
    const hindiWords = ['khana', 'kha', 'liya', 'hai', 'kya', 'kaise', 'ho', 'namaste', 'aap', 'mera', 'naam', 'खाना', 'खा', 'लिया', 'एस', 'आई', 'एम'];
    const englishWords = ['hello', 'hi', 'how', 'are', 'you', 'what', 'is', 'your', 'name', 'good', 'morning', 'sim'];
    
    const lowerText = text.toLowerCase();
    
    let aScore = 0;
    let bScore = 0;
    
    if (langA === 'hi') aScore += hindiWords.filter(w => lowerText.includes(w)).length;
    if (langB === 'hi') bScore += hindiWords.filter(w => lowerText.includes(w)).length;
    
    if (langA === 'en') aScore += englishWords.filter(w => lowerText.includes(w)).length;
    if (langB === 'en') bScore += englishWords.filter(w => lowerText.includes(w)).length;

    if (aScore > bScore) return langA;
    if (bScore > aScore) return langB;
    
    // Fallback: assume Latin characters without Hindi keywords is English
    const isLatin = /^[a-zA-Z\s.,!?']+$/.test(text);
    if (isLatin && (langA === 'en' || langB === 'en')) return 'en';
    
    return langA;
  };

  const handleRealSpeech = (transcript: string) => {
    setMessages((prev) => {
      // Auto-detect which of the two selected languages was spoken
      const spokenLang = detectLanguage(transcript, myLang, otherLang);
      
      // Map to speaker
      const speaker = spokenLang === myLang ? 'me' : 'other';
      const sourceLang = spokenLang;
      const targetLang = spokenLang === myLang ? otherLang : myLang;
      
      const newMessageId = Date.now().toString();
      
      // Call API in background
      translateText(transcript, sourceLang, targetLang).then(translated => {
        setMessages(current => current.map(m => 
          m.id === newMessageId ? { ...m, translatedText: translated } : m
        ));
      });

      return [
        ...prev,
        {
          id: newMessageId,
          speaker,
          originalText: transcript,
          translatedText: 'Translating...',
          language: targetLang,
        },
      ];
    });
  };

  const toggleMic = () => {
    if (isMicOn) {
      recognitionRef.current?.stop();
      setIsMicOn(false);
    } else {
      if (recognitionRef.current) {
        // We do NOT set recognitionRef.current.lang here.
        // Leaving it undefined lets the browser use the OS default, 
        // which gives us the best chance to capture "khana kha liya" (Hinglish) or English natively.
        recognitionRef.current.lang = ''; 
        try {
          recognitionRef.current.start();
          setIsMicOn(true);
        } catch (e) {
          console.error(e);
        }
      } else {
        alert("Microphone recording is not supported in this browser. You can still use Simulate Audio.");
        setIsMicOn(true);
      }
    }
  };

  const simulateSpeech = () => {
    if (mockIndex >= MOCK_CONVERSATION.length) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          speaker: 'other',
          originalText: '...',
          translatedText: 'End of mock conversation.',
          language: myLang,
        },
      ]);
      return;
    }

    const nextMock = MOCK_CONVERSATION[mockIndex];
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        speaker: nextMock.speaker as 'me' | 'other',
        originalText: nextMock.speaker === 'me' ? nextMock.text : (nextMock.original || nextMock.text),
        translatedText: nextMock.speaker === 'me' ? nextMock.translation : nextMock.translation,
        language: nextMock.speaker === 'me' ? otherLang : myLang,
      },
    ]);
    setMockIndex((prev) => prev + 1);
  };

  return (
    <div className={cn("flex flex-col bg-slate-50 shadow-xl overflow-hidden rounded-2xl border border-slate-200", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <ArrowRightLeft size={18} className="text-brand-600" />
          Live Interpreter
        </h2>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      {/* Language Selectors */}
      <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 border-b border-slate-200 shadow-sm z-10">
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">My Language</label>
          <select
            value={myLang}
            onChange={(e) => setMyLang(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>{lang.name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Other Person</label>
          <select
            value={otherLang}
            onChange={(e) => setOtherLang(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>{lang.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#e5ddd5]"
        style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4 opacity-60">
            <div className="bg-slate-800/10 rounded-full p-4 mb-3">
              <ArrowRightLeft size={32} className="text-slate-600" />
            </div>
            <p className="text-sm text-slate-600 font-medium bg-white/60 px-4 py-2 rounded-lg">
              Turn on the mic to start speaking, or click Simulate Audio for a demo conversation.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={cn(
                "flex max-w-[85%] flex-col gap-1", 
                msg.speaker === 'me' ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div 
                className={cn(
                  "relative rounded-2xl px-4 py-3 shadow-sm",
                  msg.speaker === 'me' 
                    ? "bg-[#d9fdd3] text-slate-800 rounded-tr-none" 
                    : "bg-white text-slate-800 rounded-tl-none"
                )}
              >
                <div className="text-[11px] text-slate-500 mb-1 font-medium">
                  {msg.speaker === 'me' ? 'You' : 'Other'}
                </div>
                
                <p className="text-sm text-slate-600 mb-2 italic">
                  "{msg.originalText}"
                </p>
                <div className="h-px w-full bg-slate-200/60 my-2" />
                <p className="text-[15px] font-medium leading-snug">
                  {msg.translatedText}
                </p>
                
                <button 
                  className={cn(
                    "absolute -bottom-2 flex items-center justify-center rounded-full bg-white p-1.5 shadow-md border border-slate-100 text-brand-600 hover:bg-brand-50 transition-colors",
                    msg.speaker === 'me' ? "-left-2" : "-right-2"
                  )}
                  title="Listen"
                  onClick={() => playAudio(msg.translatedText, msg.language)}
                >
                  <Volume2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-center gap-4 relative">
        {isMicOn && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg animate-pulse flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            Listening (Auto-detecting)...
          </div>
        )}
        
        <button
          onClick={toggleMic}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 z-10",
            isMicOn 
              ? "bg-red-500 text-white hover:bg-red-600 ring-4 ring-red-500/20" 
              : "bg-white text-slate-600 hover:bg-slate-50"
          )}
          title="Record Audio"
        >
          {isMicOn ? <Mic size={24} className="animate-pulse" /> : <MicOff size={24} />}
        </button>

        <button
          onClick={simulateSpeech}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-brand-700 active:scale-95 flex items-center justify-center gap-2"
        >
          Simulate Audio
        </button>
      </div>
    </div>
  );
}
