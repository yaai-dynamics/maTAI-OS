import type { SpeechLanguage } from '@/lib/types';
import {
  InterpreterError,
  type InterpreterProvider,
  type Speech,
  type Transcription,
  type Translation,
} from '@/server/interpreter/provider';

/**
 * The project's own Meitei speech service (API_DOCUMENTATION.md).
 *
 * What it does and does not do shapes the interpreter:
 *
 *   ASR   POST /asr/v2/transcribe?language=…  Meitei via N7Speech, and
 *         English, Hindi and ninety-odd more via Whisper. So one service
 *         hears both sides of the conversation.
 *   TTS   POST /tts/meitei   Meitei Mayek, and POST /tts/english (Piper).
 *         There is no Hindi voice: a Hindi listener reads the text, and the
 *         browser may read it aloud in a device voice.
 *   Clean POST /voice/isolator  takes WebM, which is what phones record, and
 *         returns WAV, which is what the ASR takes. It also strips market
 *         noise, which is where this will actually be used.
 *
 *   Translate POST /translator/translate  Manipuri ⇄ a hundred languages,
 *         through Google Translate (an official key when the service has
 *         one, a free fallback otherwise). It takes and returns Meitei
 *         Mayek, so no script conversion is needed between the models.
 *
 * Environment (server only):
 *   SPEECH_API_URL    base URL of the service, no trailing slash
 *   SPEECH_API_KEY    bearer token, when the service is behind one
 *   SPEECH_MT_URL     a different translation endpoint, if it ever moves
 *   SPEECH_ISOLATE    auto (default) | always | never
 *   SPEECH_TIMEOUT_MS per call; default 45s, for a cold GPU worker
 */

const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * The ASR's own language codes. Manipuri is `mni-mtei` there (Meitei Mayek)
 * or `mni-latin`; plain `mni` is rejected with a 400, so the mapping is not
 * optional. `GET /asr/v2/languages` lists all 102.
 */
const ASR_CODE: Record<SpeechLanguage, string> = { mni: 'mni-mtei', en: 'en', hi: 'hi' };

/** The ASR code for one of our languages. Exported for the tests. */
export const asrCode = (language: SpeechLanguage): string => ASR_CODE[language];

/** Formats the ASR takes as they are; anything else goes through the isolator. */
const ASR_READY = /^audio\/(wav|x-wav|wave|mpeg|mp3)$/i;

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

const base = (): string | undefined => env('SPEECH_API_URL')?.replace(/\/+$/, '');

const timeoutMs = (): number => Number(env('SPEECH_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS);

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = env('SPEECH_API_KEY');
  return {
    // An ngrok tunnel otherwise answers a browser-warning page instead of the API.
    'ngrok-skip-browser-warning': 'true',
    ...(key ? { authorization: `Bearer ${key}` } : {}),
    ...extra,
  };
}

async function send(
  stage: 'asr' | 'translation' | 'tts',
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: headers((init.headers as Record<string, string>) ?? {}),
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs())]),
  }).catch((error: unknown) => {
    throw new InterpreterError(stage, error instanceof Error ? error.message : 'Request failed.');
  });
  if (!response.ok) {
    throw new InterpreterError(stage, `${new URL(url).pathname} answered ${response.status}.`);
  }
  return response;
}

/** WebM or MP4 from a phone becomes clean WAV, and loses the market behind it. */
async function isolate(audio: Blob, signal: AbortSignal): Promise<Blob> {
  const mode = env('SPEECH_ISOLATE') ?? 'auto';
  if (mode === 'never') return audio;
  if (mode === 'auto' && ASR_READY.test(audio.type)) return audio;

  const response = await send(
    'asr',
    `${base()}/voice/isolator?sample_rate=16000&output_format=wav`,
    { method: 'POST', body: audio, headers: { 'content-type': audio.type || 'application/octet-stream' } },
    signal,
  ).catch(() => undefined);
  // Cleaning is an improvement, not a requirement: on failure the ASR still
  // gets the original, and may well cope with it.
  if (!response) return audio;
  return new Blob([await response.arrayBuffer()], { type: 'audio/wav' });
}

const asDataUrl = async (response: Response): Promise<string> => {
  const type = response.headers.get('content-type') ?? 'audio/wav';
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new InterpreterError('tts', 'The voice service returned no audio.');
  return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
};

export function meiteiProvider(): InterpreterProvider {
  const url = base();
  const mtUrl = env('SPEECH_MT_URL');

  return {
    name: 'meitei',
    ready: Boolean(url),
    // Translation lives on the same service, so speech and translation
    // arrive together. SPEECH_MT_URL only overrides where it is.
    translates: Boolean(url || mtUrl),
    // Meitei from N7Speech; English and Hindi from Whisper, in the same call.
    languages: ['mni', 'en', 'hi'],

    async transcribe(audio: Blob, language: SpeechLanguage, signal: AbortSignal): Promise<Transcription> {
      if (!url) throw new InterpreterError('asr', 'No speech service configured.');
      const clean = await isolate(audio, signal);
      const response = await send(
        'asr',
        `${url}/asr/v2/transcribe?language=${encodeURIComponent(asrCode(language))}`,
        { method: 'POST', body: clean, headers: { 'content-type': clean.type || 'audio/wav' } },
        signal,
      );
      const body = (await response.json().catch(() => undefined)) as
        | { text?: unknown; engine?: unknown }
        | undefined;
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!text) throw new InterpreterError('asr', 'Nothing was transcribed.');
      return { text, model: typeof body?.engine === 'string' ? body.engine : 'asr' };
    },

    async translate(text: string, from: SpeechLanguage, to: SpeechLanguage, signal: AbortSignal): Promise<Translation> {
      const endpoint = mtUrl ?? (url ? `${url}/translator/translate` : undefined);
      if (!endpoint) throw new InterpreterError('translation', 'No translation service is connected.');

      const response = await send(
        'translation',
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify({ text, source_lang: from, target_lang: to }),
          headers: { 'content-type': 'application/json' },
        },
        signal,
      );
      const body = (await response.json().catch(() => undefined)) as
        | { translated_text?: unknown; text?: unknown }
        | undefined;
      // `translated_text` is what the service documents; `text` is accepted
      // too, so a plain translation endpoint can stand in via SPEECH_MT_URL.
      const raw = typeof body?.translated_text === 'string' ? body.translated_text : body?.text;
      const translated = typeof raw === 'string' ? raw.trim() : '';
      if (!translated) throw new InterpreterError('translation', 'The translation service returned nothing.');
      return { text: translated, model: 'google-translate' };
    },

    async speak(text: string, language: SpeechLanguage, signal: AbortSignal): Promise<Speech> {
      if (!url) throw new InterpreterError('tts', 'No speech service configured.');
      if (language === 'hi') {
        // Piper speaks English, N7Speech Meitei; Hindi has no voice here. The
        // text still arrives, and the browser may read it in a device voice.
        throw new InterpreterError('tts', 'No Hindi voice on this service.');
      }
      const endpoint = language === 'mni' ? '/tts/meitei' : '/tts/english';
      const response = await send(
        'tts',
        `${url}${endpoint}`,
        {
          method: 'POST',
          body: JSON.stringify(language === 'mni' ? { text, format: 'wav', priority: 'realtime' } : { text }),
          headers: { 'content-type': 'application/json' },
        },
        signal,
      );
      return { audio: await asDataUrl(response), model: language === 'mni' ? 'n7speech-tts' : 'piper' };
    },

    /** Both health endpoints, to start a sleeping GPU worker. Failures are ignored. */
    async warm(signal: AbortSignal): Promise<void> {
      if (!url) return;
      const ping = (path: string) => fetch(`${url}${path}`, { headers: headers(), signal }).catch(() => undefined);
      await Promise.allSettled([ping('/health'), ping('/asr/health'), ping('/translator/status')]);
    },
  };
}
