/**
 * Two-way interpreting between a visitor and a local host.
 *
 * The visitor speaks English or Hindi; the local speaks Manipuri (Meiteilon).
 * Manipuri is written in Meitei Mayek here, because that is what the
 * platform's own speech models read and write.
 *
 * These types are shared with the browser, so nothing here may touch server
 * configuration (CLAUDE.md section 9).
 */

export const SPEECH_LANGUAGES = ['en', 'hi', 'mni'] as const;
export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number];

export const LANGUAGE_LABEL: Record<SpeechLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mni: 'ꯃꯤꯇꯩꯂꯣꯟ',
};

/** The English name, for interface text that is not the language itself. */
export const LANGUAGE_NAME: Record<SpeechLanguage, string> = {
  en: 'English',
  hi: 'Hindi',
  mni: 'Manipuri',
};

export const isSpeechLanguage = (value: unknown): value is SpeechLanguage =>
  typeof value === 'string' && (SPEECH_LANGUAGES as readonly string[]).includes(value);

/** Which half of the screen a turn came from. */
export type Side = 'visitor' | 'local';

/**
 * What the interpreter could not do, in terms a traveller can act on. The
 * interface never blames the user for a model that is not connected.
 */
export type InterpreterFailure =
  | 'NOT_CONFIGURED'
  | 'NO_SPEECH'
  | 'ASR_FAILED'
  | 'TRANSLATION_FAILED'
  | 'SPEECH_FAILED'
  | 'TOO_LONG'
  | 'TIMEOUT';

export const FAILURE_MESSAGE: Record<InterpreterFailure, string> = {
  NOT_CONFIGURED: 'The Manipuri speech models are not connected to this build yet.',
  NO_SPEECH: 'Nothing was heard. Hold the button while speaking, close to the phone.',
  ASR_FAILED: 'That could not be transcribed. Try again, a little slower.',
  TRANSLATION_FAILED: 'The words were heard but could not be translated.',
  SPEECH_FAILED: 'Translated, but the spoken version could not be produced.',
  TOO_LONG: 'That was too long. Keep each turn under half a minute.',
  TIMEOUT: 'The language service did not answer in time. Try once more.',
};

/** One completed turn of a conversation, as the interface shows it. */
export interface InterpreterTurn {
  id: string;
  side: Side;
  from: SpeechLanguage;
  to: SpeechLanguage;
  /** What the speaker said, in their own language. */
  heard: string;
  /** The interpretation, in the listener's language. */
  said: string;
  /** Spoken interpretation, as a data URL. Absent when only text was produced. */
  audio?: string;
  /** Which models did the work, for the provenance line. */
  by: { asr: string; translation: string; tts: string };
  latencyMs: number;
  at: string;
}

/** The answer from POST /api/interpreter/turn. */
export type TurnResponse =
  | { ok: true; turn: InterpreterTurn }
  | { ok: false; failure: InterpreterFailure; detail?: string };

/** A phrase kept on the device, so the interpreter is useful with no network. */
export interface Phrase {
  id: string;
  /** What it is for, in the visitor's interface. */
  en: string;
  hi: string;
  /**
   * Meitei Mayek. Null until a Manipuri speaker has checked it: a tourism
   * platform does not put words in a community's mouth (CLAUDE.md section 3).
   */
  mni: string | null;
}

export interface PhraseGroup {
  id: string;
  title: string;
  phrases: Phrase[];
}
