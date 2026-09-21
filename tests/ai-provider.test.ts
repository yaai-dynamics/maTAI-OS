import { afterEach, describe, expect, it, vi } from 'vitest';

import { narrate, providerModel, resolveProvider, strayFigures, type NarrationRequest } from '@/lib/ai/provider';

/**
 * The provider adapters, against a stubbed network. Nothing here calls a real
 * API: each test answers fetch the way that vendor would, and checks what was
 * sent and what the application gets back.
 */

const request: NarrationRequest = {
  promptId: 'government-analyst',
  system: 'Write the answer paragraph.',
  deterministicText: 'Ukhrul is growing fastest, up 38.2% on the previous 28 days, from 1,284 interactions.',
  evidence: { evidence: [{ label: 'Ukhrul', value: '+38.2%' }, { label: 'Sample', value: 1284 }] },
  task: 'Write the answer.',
  maxTokens: 500,
};

const GROUNDED = 'Ukhrul leads, with interest up 38.2% over the previous 28 days, across 1,284 interactions.';

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Stubs fetch with one JSON reply and records what was sent. */
function reply(payload: unknown, status = 200): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
  return sent;
}

const use = (provider: string, key: string, value = 'test-key-not-real') => {
  vi.stubEnv('AI_PROVIDER', provider);
  vi.stubEnv(key, value);
};

const gemini = (text: string, finishReason = 'STOP') => ({
  candidates: [{ finishReason, content: { parts: [{ text: 'thinking aloud 99', thought: true }, { text }] } }],
});
const openai = (text: string, status = 'completed') => ({
  status,
  ...(status === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
  output: [
    { type: 'reasoning', content: [] },
    { type: 'message', content: [{ type: 'output_text', text }] },
  ],
});
const anthropic = (text: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('choosing a provider', () => {
  it('stays on the deterministic provider in the test suite', () => {
    expect(resolveProvider()).toBe('mock');
    expect(providerModel()).toBe('deterministic');
  });

  it('uses a named provider only when its key is present', () => {
    use('gemini', 'GEMINI_API_KEY');
    expect(resolveProvider()).toBe('gemini');
    vi.stubEnv('GEMINI_API_KEY', '  ');
    expect(resolveProvider()).toBe('mock');
  });

  it('reads the name without regard to case, and ignores one it does not know', () => {
    use('OpenAI', 'OPENAI_API_KEY');
    expect(resolveProvider()).toBe('openai');
    vi.stubEnv('AI_PROVIDER', 'mistral');
    expect(resolveProvider()).toBe('mock');
  });

  it('defaults each provider to its model, and an empty setting keeps the default', () => {
    use('gemini', 'GEMINI_API_KEY');
    vi.stubEnv('GEMINI_MODEL', '');
    expect(providerModel()).toBe('gemini-3.8-flash');
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.5-flash-lite');
    expect(providerModel()).toBe('gemini-3.5-flash-lite');

    use('openai', 'OPENAI_API_KEY');
    vi.stubEnv('OPENAI_MODEL', '');
    expect(providerModel()).toBe('gpt-5.5');

    use('anthropic', 'ANTHROPIC_API_KEY');
    vi.stubEnv('ANTHROPIC_MODEL', '');
    expect(providerModel()).toBe('claude-sonnet-5');
  });
});

describe('the grounding check', () => {
  it('accepts figures from the evidence however their thousands are grouped', () => {
    expect(strayFigures(GROUNDED, request)).toEqual([]);
    expect(strayFigures('About 1,20,000 visits.', { evidence: { visits: 120000 }, deterministicText: '' })).toEqual([]);
  });

  it('treats a rounded or invented figure as new', () => {
    expect(strayFigures('Interest rose 38% across 1,284 interactions.', request)).toEqual(['38']);
    expect(strayFigures('Up 38.2%, with 45 new homestays.', request)).toEqual(['45']);
  });
});

describe('Gemini', () => {
  it('sends the key in a header, keeps thinking low, and returns only the answer text', async () => {
    use('gemini', 'GEMINI_API_KEY', 'gm-secret');
    const sent = reply(gemini(GROUNDED));

    const result = await narrate(request);
    expect(result).toMatchObject({ text: GROUNDED, provider: 'gemini', model: 'gemini-3.8-flash', fallback: false });

    const [call] = sent;
    expect(call!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(call!.url).not.toContain('gm-secret');
    expect(call!.headers['x-goog-api-key']).toBe('gm-secret');
    expect(call!.body.systemInstruction).toEqual({ parts: [{ text: request.system }] });
    expect(JSON.stringify(call!.body.contents)).toContain('38.2%');
    expect(call!.body.generationConfig).toEqual({ maxOutputTokens: 500 + 1024, thinkingConfig: { thinkingLevel: 'low' } });
  });

  it('falls back when the answer is cut off or stopped for safety', async () => {
    use('gemini', 'GEMINI_API_KEY');
    reply(gemini('Ukhrul leads with', 'MAX_TOKENS'));
    expect(await narrate(request)).toMatchObject({ text: request.deterministicText, fallback: true });

    reply(gemini('', 'SAFETY'));
    const safety = await narrate(request);
    expect(safety.fallback).toBe(true);
    expect(safety.fallbackReason).toMatch(/SAFETY/);
  });
});

describe('OpenAI', () => {
  it('asks a reasoning model for low effort, and does not keep the response', async () => {
    use('openai', 'OPENAI_API_KEY', 'sk-secret');
    const sent = reply(openai(GROUNDED));

    const result = await narrate(request);
    expect(result).toMatchObject({ text: GROUNDED, provider: 'openai', model: 'gpt-5.5', fallback: false });

    const [call] = sent;
    expect(call!.url).toBe('https://api.openai.com/v1/responses');
    expect(call!.headers.authorization).toBe('Bearer sk-secret');
    expect(call!.body).toMatchObject({
      model: 'gpt-5.5',
      instructions: request.system,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 500 + 1024,
    });
    expect(call!.body).not.toHaveProperty('temperature');
  });

  it('sends a temperature, and no reasoning setting, to an older chat model', async () => {
    use('openai', 'OPENAI_API_KEY');
    vi.stubEnv('OPENAI_MODEL', 'gpt-4.1-mini');
    const sent = reply(openai(GROUNDED));
    await narrate(request);
    expect(sent[0]!.body).toMatchObject({ temperature: 0.4, max_output_tokens: 500 });
    expect(sent[0]!.body).not.toHaveProperty('reasoning');
  });

  it('falls back on an incomplete response', async () => {
    use('openai', 'OPENAI_API_KEY');
    reply(openai('Ukhrul leads', 'incomplete'));
    const result = await narrate(request);
    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toMatch(/max_output_tokens/);
  });
});

describe('Anthropic', () => {
  it('sends the message and falls back if it hits the length limit', async () => {
    use('anthropic', 'ANTHROPIC_API_KEY', 'sk-ant-secret');
    const sent = reply(anthropic(GROUNDED));
    expect(await narrate(request)).toMatchObject({ text: GROUNDED, provider: 'anthropic', fallback: false });
    expect(sent[0]!.headers['x-api-key']).toBe('sk-ant-secret');
    expect(sent[0]!.body).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 500, system: request.system });

    reply(anthropic('Ukhrul leads', 'max_tokens'));
    expect((await narrate(request)).fallback).toBe(true);
  });
});

describe('whatever the provider', () => {
  it('discards prose that carries a figure the evidence does not have', async () => {
    use('gemini', 'GEMINI_API_KEY');
    reply(gemini('Ukhrul is up 38.2%, and visits will double to 2,568 by March.'));
    const result = await narrate(request);
    expect(result.text).toBe(request.deterministicText);
    expect(result.fallback).toBe(true);
    expect(result.fallbackReason).toMatch(/not in the evidence \(2568\)/);
  });

  it('falls back on an error status, without passing the error body on', async () => {
    use('openai', 'OPENAI_API_KEY');
    reply({ error: { message: 'Incorrect API key provided: sk-secret' } }, 401);
    const result = await narrate(request);
    expect(result).toMatchObject({ text: request.deterministicText, fallback: true, fallbackReason: 'Provider responded 401' });
  });

  it('gives up after twelve seconds and uses the deterministic text', async () => {
    vi.useFakeTimers();
    use('gemini', 'GEMINI_API_KEY');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      ),
    );
    const pending = narrate(request);
    await vi.advanceTimersByTimeAsync(12_000);
    const result = await pending;
    expect(result).toMatchObject({ text: request.deterministicText, fallback: true });
    expect(result.fallbackReason).toMatch(/12 seconds/);
  });
});
