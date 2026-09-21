/**
 * Server-side AI provider abstraction.
 *
 * Nothing in this file may be imported from a client component: it reads the
 * API keys from the server environment (CLAUDE.md section 9).
 *
 * The important design decision is what the model is allowed to do. Every
 * capability in this application first produces a complete, deterministic
 * result from application code and structured data. The provider is then given
 * that result and asked only to rewrite the narrative around it. So:
 *
 *   - with AI_PROVIDER=mock the deterministic text is the answer, and the demo
 *     runs with no network and no key;
 *   - with a live provider (anthropic, openai or gemini) the prose improves, and
 *     the numbers, evidence, confidence and provenance are byte for byte the
 *     same;
 *   - if the provider errors, times out, stops early or writes a figure that is
 *     not in the evidence, the deterministic text is returned and the response
 *     is marked as a fallback.
 *
 * A model can therefore never invent a KPI: it is never the thing that produces
 * one, and prose that carries a number it was not given is discarded.
 */

export type ProviderName = 'mock' | 'anthropic' | 'openai' | 'gemini';
type LiveProvider = Exclude<ProviderName, 'mock'>;

export interface NarrationRequest {
  /** Versioned prompt id, for logging and evaluation. */
  promptId: string;
  /** System instruction describing the voice and the hard constraints. */
  system: string;
  /** The deterministic answer. Returned as-is by the mock provider. */
  deterministicText: string;
  /**
   * Structured evidence the narrative must stay inside. Serialised into the
   * user message so the model has nothing else to draw on.
   */
  evidence: unknown;
  /** Extra instruction for this particular call. */
  task: string;
  maxTokens?: number;
  temperature?: number;
}

export interface NarrationResult {
  text: string;
  provider: ProviderName;
  model: string;
  /** True when the deterministic text was used instead of a model response. */
  fallback: boolean;
  fallbackReason?: string;
  latencyMs: number;
}

interface ProviderCall {
  request: NarrationRequest;
  model: string;
  apiKey: string;
  signal: AbortSignal;
}

interface ProviderConfig {
  keyVariable: string;
  modelVariable: string;
  defaultModel: string;
  call: (call: ProviderCall) => Promise<string>;
}

const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_TOKENS = 900;
const DEFAULT_TEMPERATURE = 0.4;
/**
 * Reasoning models spend output tokens thinking before they write, and those
 * count against the same limit. The allowance keeps a short answer from being
 * cut off by its own thinking.
 */
const THINKING_ALLOWANCE_TOKENS = 1024;

const PROVIDERS: Record<LiveProvider, ProviderConfig> = {
  anthropic: {
    keyVariable: 'ANTHROPIC_API_KEY',
    modelVariable: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-5',
    call: callAnthropic,
  },
  openai: {
    keyVariable: 'OPENAI_API_KEY',
    modelVariable: 'OPENAI_MODEL',
    defaultModel: 'gpt-5.5',
    call: callOpenAi,
  },
  gemini: {
    keyVariable: 'GEMINI_API_KEY',
    modelVariable: 'GEMINI_MODEL',
    defaultModel: 'gemini-3.8-flash',
    call: callGemini,
  },
};

const isLive = (name: string): name is LiveProvider => Object.hasOwn(PROVIDERS, name);

const envValue = (name: string): string | undefined => process.env[name]?.trim() || undefined;

/** The configured provider, or mock when it is unknown or has no key. */
export function resolveProvider(): ProviderName {
  const configured = (process.env.AI_PROVIDER ?? 'mock').trim().toLowerCase();
  if (isLive(configured) && envValue(PROVIDERS[configured].keyVariable)) return configured;
  return 'mock';
}

export function providerModel(): string {
  const provider = resolveProvider();
  if (provider === 'mock') return 'deterministic';
  const config = PROVIDERS[provider];
  return envValue(config.modelVariable) ?? config.defaultModel;
}

/**
 * Returns narrative prose for an already-computed result.
 * Never returns a number the caller did not already have.
 */
export async function narrate(request: NarrationRequest): Promise<NarrationResult> {
  const startedAt = Date.now();
  const provider = resolveProvider();

  if (provider === 'mock') {
    return {
      text: request.deterministicText,
      provider: 'mock',
      model: 'deterministic',
      fallback: false,
      latencyMs: Date.now() - startedAt,
    };
  }

  const config = PROVIDERS[provider];
  const model = providerModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const text = await config.call({ request, model, apiKey: envValue(config.keyVariable)!, signal: controller.signal });
    if (!text) throw new Error('Provider returned no text');
    const stray = strayFigures(text, request);
    if (stray.length > 0) {
      throw new Error(`Response used a figure that is not in the evidence (${stray.slice(0, 3).join(', ')})`);
    }
    return { text, provider, model, fallback: false, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      text: request.deterministicText,
      provider,
      model,
      fallback: true,
      fallbackReason: controller.signal.aborted
        ? `No response within ${REQUEST_TIMEOUT_MS / 1000} seconds`
        : error instanceof Error
          ? error.message
          : 'Unknown provider error',
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------------------------------------------------------------- */
/* Grounding check                                                            */
/* -------------------------------------------------------------------------- */

/** Digit groups with thousands separators removed: "1,20,000" and "120,000" are both 120000. */
function figuresIn(text: string): string[] {
  return text.replace(/(?<=\d),(?=\d)/g, '').match(/\d+(?:\.\d+)?/g) ?? [];
}

/**
 * Figures in a model's text that appear in neither the evidence nor the
 * deterministic draft. A rounded or converted figure counts as new: 38% is not
 * 38.2%. Numbers written as words are not checked.
 */
export function strayFigures(text: string, request: Pick<NarrationRequest, 'evidence' | 'deterministicText'>): string[] {
  const allowed = new Set(figuresIn(`${JSON.stringify(request.evidence) ?? ''}\n${request.deterministicText}`));
  return [...new Set(figuresIn(text))].filter((figure) => !allowed.has(figure));
}

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

/** The same user message for every provider, so a change of vendor changes nothing else. */
function userMessage(request: NarrationRequest): string {
  return [
    request.task,
    '',
    'Structured evidence. Every figure you use must appear here verbatim:',
    '```json',
    JSON.stringify(request.evidence, null, 2),
    '```',
    '',
    'A deterministic draft of the same answer, for reference:',
    '```',
    request.deterministicText,
    '```',
  ].join('\n');
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Provider responded ${response.status}`);
  return (await response.json()) as unknown;
}

async function callAnthropic({ request, model, apiKey, signal }: ProviderCall): Promise<string> {
  const payload = (await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    {
      model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? DEFAULT_TEMPERATURE,
      system: request.system,
      messages: [{ role: 'user', content: userMessage(request) }],
    },
    signal,
  )) as { stop_reason?: string; content?: { type: string; text?: string }[] };

  if (payload.stop_reason === 'max_tokens') throw new Error('Response was cut off at the length limit');
  return (payload.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();
}

/** GPT-5 and the o-series reason before answering and take no temperature. */
const openAiReasons = (model: string) => /^(gpt-[5-9]|o\d)/.test(model);

async function callOpenAi({ request, model, apiKey, signal }: ProviderCall): Promise<string> {
  const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
  const reasons = openAiReasons(model);
  const payload = (await postJson(
    'https://api.openai.com/v1/responses',
    { authorization: `Bearer ${apiKey}` },
    {
      model,
      instructions: request.system,
      input: userMessage(request),
      // Not kept on OpenAI's side for later retrieval: nothing here needs it.
      store: false,
      ...(reasons
        ? { reasoning: { effort: 'low' }, max_output_tokens: maxTokens + THINKING_ALLOWANCE_TOKENS }
        : { temperature: request.temperature ?? DEFAULT_TEMPERATURE, max_output_tokens: maxTokens }),
    },
    signal,
  )) as {
    status?: string;
    incomplete_details?: { reason?: string };
    output?: { type: string; content?: { type: string; text?: string }[] }[];
  };

  if (payload.status === 'incomplete') {
    throw new Error(`Response incomplete (${payload.incomplete_details?.reason ?? 'unknown reason'})`);
  }
  return (payload.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

/**
 * Gemini 3 and later think by default and are tuned for their default
 * temperature, which Google advises against lowering; thinking is kept low
 * because this is rewriting, not reasoning.
 */
const geminiThinks = (model: string) => /^gemini-(?![12]\.)/.test(model);

async function callGemini({ request, model, apiKey, signal }: ProviderCall): Promise<string> {
  const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
  const thinks = geminiThinks(model);
  const payload = (await postJson(
    // The key travels in a header, not the query string, so it stays out of URL logs.
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': apiKey },
    {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: userMessage(request) }] }],
      generationConfig: thinks
        ? { maxOutputTokens: maxTokens + THINKING_ALLOWANCE_TOKENS, thinkingConfig: { thinkingLevel: 'low' } }
        : { maxOutputTokens: maxTokens, temperature: request.temperature ?? DEFAULT_TEMPERATURE },
    },
    signal,
  )) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };

  if (payload.promptFeedback?.blockReason) throw new Error(`Request blocked (${payload.promptFeedback.blockReason})`);
  const candidate = payload.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(
      candidate.finishReason === 'MAX_TOKENS'
        ? 'Response was cut off at the length limit'
        : `Response stopped early (${candidate.finishReason})`,
    );
  }
  return (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}
