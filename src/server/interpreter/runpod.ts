import { isSpeechLanguage, type SpeechLanguage } from '@/lib/types';
import {
  InterpreterError,
  type InterpreterProvider,
  type Speech,
  type Transcription,
  type Translation,
} from '@/server/interpreter/provider';

/**
 * The project's own Manipuri speech models, hosted on RunPod, plus whatever
 * translates between Manipuri and the visitor's language.
 *
 * Environment (server only):
 *   RUNPOD_API_KEY        bearer token for the endpoints
 *   RUNPOD_ASR_URL        speech  -> text   (Meitei Mayek)
 *   RUNPOD_TTS_URL        text    -> speech (Meitei Mayek)
 *   RUNPOD_MT_URL         text    -> text   (translation), when it is its own service
 *   RUNPOD_ASR_LANGUAGES  what the ASR accepts; default "mni"
 *   INTERPRETER_TIMEOUT_MS per call; default 45s, because a cold serverless
 *                          worker can take half a minute to answer
 *
 * The request and response shapes live in ENVELOPE and FIELDS below. RunPod's
 * serverless endpoints take {input: …} and answer {output: …}; a plain HTTP
 * service takes and returns the payload itself (RUNPOD_API_STYLE=plain).
 * Confirm the field names against the real service before relying on it: this
 * is written to the documented convention, not to a service I have called.
 */

const FIELDS = {
  asr: { audio: 'audio_base64', language: 'language', text: 'text' },
  tts: { text: 'text', language: 'language', audio: 'audio_base64', mime: 'audio/wav' },
  mt: { text: 'text', from: 'source_language', to: 'target_language', out: 'text' },
} as const;

const DEFAULT_TIMEOUT_MS = 45_000;

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined;

const wrapped = (): boolean => (env('RUNPOD_API_STYLE') ?? 'runsync') !== 'plain';

const timeoutMs = (): number => Number(env('INTERPRETER_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS);

function languages(): readonly SpeechLanguage[] {
  const configured = (env('RUNPOD_ASR_LANGUAGES') ?? 'mni').split(',').map((value) => value.trim());
  return configured.filter(isSpeechLanguage);
}

async function call(
  stage: 'asr' | 'translation' | 'tts',
  url: string | undefined,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!url) throw new InterpreterError(stage, `No endpoint configured for ${stage}.`);
  const key = env('RUNPOD_API_KEY');

  const timeout = AbortSignal.timeout(timeoutMs());
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(wrapped() ? { input: payload } : payload),
    signal: AbortSignal.any([signal, timeout]),
  }).catch((error: unknown) => {
    throw new InterpreterError(stage, error instanceof Error ? error.message : 'Request failed.');
  });

  if (!response.ok) {
    throw new InterpreterError(stage, `${stage} endpoint answered ${response.status}.`);
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!body || typeof body !== 'object') throw new InterpreterError(stage, `${stage} endpoint returned no result.`);

  const envelope = body as Record<string, unknown>;
  // A RunPod job that failed answers 200 with its own status.
  if (typeof envelope.status === 'string' && envelope.status.toUpperCase() === 'FAILED') {
    throw new InterpreterError(stage, `${stage} job failed.`);
  }
  const output = wrapped() ? envelope.output : envelope;
  if (!output || typeof output !== 'object') throw new InterpreterError(stage, `${stage} endpoint returned no output.`);
  return output as Record<string, unknown>;
}

const text = (output: Record<string, unknown>, field: string, stage: 'asr' | 'translation' | 'tts'): string => {
  const value = output[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InterpreterError(stage, `${stage} output had no "${field}".`);
  }
  return value.trim();
};

async function base64Of(audio: Blob): Promise<string> {
  return Buffer.from(await audio.arrayBuffer()).toString('base64');
}

export function runpodProvider(): InterpreterProvider {
  const asrUrl = env('RUNPOD_ASR_URL');
  const ttsUrl = env('RUNPOD_TTS_URL');
  const mtUrl = env('RUNPOD_MT_URL');

  return {
    name: 'runpod',
    ready: Boolean(asrUrl && ttsUrl),
    languages: languages(),

    async transcribe(audio: Blob, language: SpeechLanguage, signal: AbortSignal): Promise<Transcription> {
      const output = await call(
        'asr',
        asrUrl,
        { [FIELDS.asr.audio]: await base64Of(audio), [FIELDS.asr.language]: language, mime_type: audio.type },
        signal,
      );
      return { text: text(output, FIELDS.asr.text, 'asr'), model: 'runpod-asr' };
    },

    async translate(value: string, from: SpeechLanguage, to: SpeechLanguage, signal: AbortSignal): Promise<Translation> {
      const output = await call(
        'translation',
        mtUrl,
        { [FIELDS.mt.text]: value, [FIELDS.mt.from]: from, [FIELDS.mt.to]: to },
        signal,
      );
      return { text: text(output, FIELDS.mt.out, 'translation'), model: 'runpod-mt' };
    },

    async speak(value: string, language: SpeechLanguage, signal: AbortSignal): Promise<Speech> {
      const output = await call(
        'tts',
        ttsUrl,
        { [FIELDS.tts.text]: value, [FIELDS.tts.language]: language },
        signal,
      );
      const audio = text(output, FIELDS.tts.audio, 'tts');
      const mime = typeof output.mime_type === 'string' ? output.mime_type : FIELDS.tts.mime;
      return { audio: audio.startsWith('data:') ? audio : `data:${mime};base64,${audio}`, model: 'runpod-tts' };
    },

    /**
     * A tiny request to each endpoint, to start a serverless worker while the
     * visitor is still reading the screen. Failures are ignored: warming is an
     * optimisation, never a reason to stop.
     */
    async warm(signal: AbortSignal): Promise<void> {
      const ping = (url: string | undefined) =>
        url
          ? fetch(url, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                ...(env('RUNPOD_API_KEY') ? { authorization: `Bearer ${env('RUNPOD_API_KEY')}` } : {}),
              },
              body: JSON.stringify(wrapped() ? { input: { warm: true } } : { warm: true }),
              signal,
            }).catch(() => undefined)
          : Promise.resolve(undefined);
      await Promise.allSettled([ping(asrUrl), ping(ttsUrl), ping(mtUrl)]);
    },
  };
}
