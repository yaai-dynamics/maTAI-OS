import type { SpeechLanguage } from '@/lib/types';
import { InterpreterError, type InterpreterProvider } from '@/server/interpreter/provider';

/**
 * The provider used until the speech models are connected.
 *
 * It refuses every capability rather than returning invented words. The
 * interpreter screen still runs end to end — recording, permissions, the
 * conversation layout, the phrasebook — and says plainly that the models are
 * not connected, which is also what a reviewer should see in a build that has
 * no endpoints configured.
 */
export function mockProvider(): InterpreterProvider {
  const refuse = (stage: 'asr' | 'translation' | 'tts') => {
    throw new InterpreterError(stage, 'No interpreter models are configured (INTERPRETER_PROVIDER=mock).');
  };

  return {
    name: 'mock',
    ready: false,
    languages: [] as readonly SpeechLanguage[],
    transcribe: async () => refuse('asr'),
    translate: async () => refuse('translation'),
    speak: async () => refuse('tts'),
    warm: async () => {},
  };
}
