import { NextResponse } from 'next/server';

import { isSpeechLanguage, type InterpreterFailure, type SpeechLanguage, type TurnResponse } from '@/lib/types';
import { InterpreterError, interpreterProvider } from '@/server/interpreter/provider';

/**
 * One turn of interpreting: audio in one language, text and audio out in the
 * other.
 *
 * The browser records, posts here, and plays what comes back. The models are
 * called from this route so their endpoints and key stay on the server
 * (CLAUDE.md section 9), and so the phone needs no knowledge of how the
 * interpreting is done.
 *
 * Nothing is stored. The audio lives in memory for the length of the request:
 * a conversation between a visitor and a shopkeeper is not the platform's to
 * keep, and the government views need none of it. The Decision Room learns
 * only that an interpretation happened, and between which languages, which is
 * counted elsewhere from the browser.
 */

export const dynamic = 'force-dynamic';
/** Long enough for a cold serverless worker; Vercel caps this by plan. */
export const maxDuration = 120;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const fail = (failure: InterpreterFailure, detail?: string, status = 200, heard?: string) =>
  NextResponse.json<TurnResponse>(
    { ok: false, failure, ...(detail ? { detail } : {}), ...(heard ? { heard } : {}) },
    { status },
  );

const stageFailure: Record<'asr' | 'translation' | 'tts', InterpreterFailure> = {
  asr: 'ASR_FAILED',
  translation: 'TRANSLATION_FAILED',
  tts: 'SPEECH_FAILED',
};

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => undefined);
  const audio = form?.get('audio');
  const from = form?.get('from');
  const to = form?.get('to');

  if (!(audio instanceof Blob) || !isSpeechLanguage(from) || !isSpeechLanguage(to) || from === to) {
    return fail('ASR_FAILED', 'Malformed request.', 400);
  }
  if (audio.size === 0) return fail('NO_SPEECH');
  if (audio.size > MAX_AUDIO_BYTES) return fail('TOO_LONG');

  const provider = await interpreterProvider();
  if (!provider.ready) return fail('NOT_CONFIGURED');
  if (provider.languages.length > 0 && !provider.languages.includes(from as SpeechLanguage)) {
    return fail('NOT_CONFIGURED', `No speech model for ${from}.`);
  }

  const started = Date.now();
  try {
    const heard = await provider.transcribe(audio, from, request.signal);
    if (heard.text.length === 0) return fail('NO_SPEECH');

    // Hearing can work while translating does not. Returning the transcript
    // is still worth something: the speaker sees they were understood, and
    // the other side can read it into a phone of their own.
    let translated;
    try {
      translated = await provider.translate(heard.text, from, to, request.signal);
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      return fail('TRANSLATION_FAILED', detail, 200, heard.text);
    }

    // Text is the result; the spoken version is the best effort on top of it.
    // A listener who can read still gets the message when the voice fails.
    let audioOut: string | undefined;
    let ttsModel = 'none';
    try {
      const spoken = await provider.speak(translated.text, to, request.signal);
      audioOut = spoken.audio;
      ttsModel = spoken.model;
    } catch {
      ttsModel = 'unavailable';
    }

    return NextResponse.json<TurnResponse>({
      ok: true,
      turn: {
        id: crypto.randomUUID(),
        side: from === 'mni' ? 'local' : 'visitor',
        from,
        to,
        heard: heard.text,
        said: translated.text,
        ...(audioOut ? { audio: audioOut } : {}),
        by: { asr: heard.model, translation: translated.model, tts: ttsModel },
        latencyMs: Date.now() - started,
        at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof InterpreterError) return fail(stageFailure[error.stage], error.message);
    if (error instanceof Error && error.name === 'TimeoutError') return fail('TIMEOUT');
    return fail('ASR_FAILED', error instanceof Error ? error.message : undefined);
  }
}
