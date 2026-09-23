import { resolveProvider } from '@/lib/ai/provider';

/**
 * Server-side AI image generation, for a landing page's hero artwork.
 *
 * Mirrors provider.ts's discipline: an image is a best-effort enhancement,
 * never a thing the page depends on. Only Gemini is wired — it is the only
 * provider in this stack with an accessible image model — and any failure,
 * timeout or missing key returns fallback: true so the caller renders the
 * deterministic scene art in GeneratedArt.tsx instead. Nothing here ever
 * throws.
 */

export interface ImageRequest {
  /** What to depict, in plain English. Kept short; no user text is echoed verbatim into it. */
  prompt: string;
}

export interface ImageResult {
  /** data: URL of a generated PNG, present only when fallback is false. */
  dataUrl?: string;
  provider: 'gemini' | 'none';
  fallback: boolean;
  fallbackReason?: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

const envValue = (name: string): string | undefined => process.env[name]?.trim() || undefined;

export async function generateHeroImage(request: ImageRequest): Promise<ImageResult> {
  if (resolveProvider() !== 'gemini') {
    return { provider: 'none', fallback: true, fallbackReason: 'No image-capable provider is configured' };
  }
  const apiKey = envValue('GEMINI_API_KEY');
  if (!apiKey) {
    return { provider: 'none', fallback: true, fallbackReason: 'No Gemini API key is configured' };
  }
  const model = envValue('GEMINI_IMAGE_MODEL') ?? DEFAULT_IMAGE_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      // The key travels in a header, not the query string, so it stays out of URL logs.
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );
    if (!response.ok) throw new Error(`Image provider responded ${response.status}`);
    const payload = (await response.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
    };
    if (payload.promptFeedback?.blockReason) {
      throw new Error(`Request blocked (${payload.promptFeedback.blockReason})`);
    }
    const inline = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error('Provider returned no image');
    return {
      dataUrl: `data:${inline.mimeType ?? 'image/png'};base64,${inline.data}`,
      provider: 'gemini',
      fallback: false,
    };
  } catch (error) {
    return {
      provider: 'gemini',
      fallback: true,
      fallbackReason: controller.signal.aborted
        ? `No response within ${REQUEST_TIMEOUT_MS / 1000} seconds`
        : error instanceof Error
          ? error.message
          : 'Unknown provider error',
    };
  } finally {
    clearTimeout(timeout);
  }
}
