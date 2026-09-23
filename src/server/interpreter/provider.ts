import type { SpeechLanguage } from '@/lib/types';

/**
 * Server-side speech and translation provider.
 *
 * Nothing here may be imported from a client component: the endpoints and
 * their key are read from the server environment (CLAUDE.md section 9). The
 * browser sends audio to our own route, which calls the models; the key never
 * reaches the phone, where an APK would hand it to anyone who unzips it.
 *
 * Three capabilities, deliberately separate, because they are three different
 * models and any of them can be swapped:
 *
 *   transcribe  speech  -> text, in the language spoken
 *   translate   text    -> text, in the listener's language
 *   speak       text    -> audio, in the listener's language
 *
 * INTERPRETER_PROVIDER picks the implementation:
 *   mock    (default) no models; the interface runs and says so plainly
 *   meitei  the project's own Meitei speech service (ASR, TTS, denoising)
 *
 * The mock never invents a translation. An interpreter that guesses is worse
 * than one that admits it cannot help: a visitor would repeat the guess to a
 * person in front of them.
 */

export type InterpreterProviderName = 'mock' | 'meitei';

export interface Transcription {
  text: string;
  /** The model that produced it, for the provenance line. */
  model: string;
}

export interface Translation {
  text: string;
  model: string;
}

export interface Speech {
  /** Audio as a data URL, so it can be played without a second request. */
  audio: string;
  model: string;
}

export interface InterpreterProvider {
  readonly name: InterpreterProviderName;
  /** False when the endpoints are not configured; the route then answers NOT_CONFIGURED. */
  readonly ready: boolean;
  /**
   * Whether anything can translate between languages. The speech service
   * hears and speaks but does not translate, so this can be false while the
   * rest works: the interface then shows what was said and says plainly that
   * it cannot carry it across.
   */
  readonly translates: boolean;
  /** Languages this provider can listen to and speak. */
  readonly languages: readonly SpeechLanguage[];
  transcribe(audio: Blob, language: SpeechLanguage, signal: AbortSignal): Promise<Transcription>;
  translate(text: string, from: SpeechLanguage, to: SpeechLanguage, signal: AbortSignal): Promise<Translation>;
  speak(text: string, language: SpeechLanguage, signal: AbortSignal): Promise<Speech>;
  /**
   * Wakes a serverless endpoint before the first real turn. Cold starts are
   * the difference between a conversation and an awkward silence.
   */
  warm(signal: AbortSignal): Promise<void>;
}

/** Thrown by a provider when a capability is missing or a call fails. */
export class InterpreterError extends Error {
  constructor(
    readonly stage: 'asr' | 'translation' | 'tts',
    message: string,
  ) {
    super(message);
    this.name = 'InterpreterError';
  }
}

export function providerName(): InterpreterProviderName {
  const configured = process.env.INTERPRETER_PROVIDER?.trim().toLowerCase();
  return configured === 'meitei' ? 'meitei' : 'mock';
}

/** The provider for this environment. Built per call: configuration can change between requests on a serverless host. */
export async function interpreterProvider(): Promise<InterpreterProvider> {
  if (providerName() === 'meitei') {
    const { meiteiProvider } = await import('@/server/interpreter/meitei');
    return meiteiProvider();
  }
  const { mockProvider } = await import('@/server/interpreter/mock');
  return mockProvider();
}
