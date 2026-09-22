import { beforeEach, describe, expect, it } from 'vitest';

import phrasebook from '@data/phrasebook.json';
import { FAILURE_MESSAGE, isSpeechLanguage, LANGUAGE_LABEL, SPEECH_LANGUAGES, type PhraseGroup } from '@/lib/types';
import { interpreterProvider, providerName } from '@/server/interpreter/provider';

describe('interpreter provider', () => {
  beforeEach(() => {
    delete process.env.INTERPRETER_PROVIDER;
    delete process.env.RUNPOD_ASR_URL;
    delete process.env.RUNPOD_TTS_URL;
    delete process.env.RUNPOD_ASR_LANGUAGES;
  });

  it('is the mock until a provider is named, and the mock is never ready', async () => {
    expect(providerName()).toBe('mock');
    const provider = await interpreterProvider();
    expect(provider.name).toBe('mock');
    expect(provider.ready).toBe(false);
  });

  it('refuses rather than inventing words when no model is connected', async () => {
    const provider = await interpreterProvider();
    await expect(provider.translate('kwai', 'mni', 'en', AbortSignal.timeout(50))).rejects.toThrow(/no interpreter models are configured/i);
  });

  it('is ready only once both speech endpoints are configured', async () => {
    process.env.INTERPRETER_PROVIDER = 'runpod';
    expect((await interpreterProvider()).ready).toBe(false);

    process.env.RUNPOD_ASR_URL = 'https://api.runpod.ai/v2/asr/runsync';
    expect((await interpreterProvider()).ready).toBe(false);

    process.env.RUNPOD_TTS_URL = 'https://api.runpod.ai/v2/tts/runsync';
    const provider = await interpreterProvider();
    expect(provider.ready).toBe(true);
    // Manipuri only, until an English or Hindi model is added.
    expect(provider.languages).toEqual(['mni']);
  });

  it('reads the languages its speech model accepts from the environment', async () => {
    process.env.INTERPRETER_PROVIDER = 'runpod';
    process.env.RUNPOD_ASR_LANGUAGES = 'mni, en , nonsense';
    const provider = await interpreterProvider();
    expect(provider.languages).toEqual(['mni', 'en']);
  });
});

describe('interpreter language values', () => {
  it('labels every language it accepts', () => {
    for (const language of SPEECH_LANGUAGES) {
      expect(LANGUAGE_LABEL[language].length).toBeGreaterThan(0);
      expect(isSpeechLanguage(language)).toBe(true);
    }
    expect(isSpeechLanguage('fr')).toBe(false);
  });

  it('explains every failure in words a traveller can act on', () => {
    for (const message of Object.values(FAILURE_MESSAGE)) {
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/error|undefined|null/i);
    }
  });
});

describe('phrasebook', () => {
  const groups = (phrasebook as { groups: PhraseGroup[] }).groups;

  it('carries English and Hindi for every phrase', () => {
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.phrases.length).toBeGreaterThan(0);
      for (const phrase of group.phrases) {
        expect(phrase.en.length, phrase.id).toBeGreaterThan(0);
        expect(phrase.hi.length, phrase.id).toBeGreaterThan(0);
      }
    }
  });

  it('leaves Manipuri null rather than guessed, until a speaker has checked it', () => {
    for (const group of groups) {
      for (const phrase of group.phrases) {
        expect(phrase.mni === null || phrase.mni.length > 0, phrase.id).toBe(true);
      }
    }
  });

  it('keeps phrase ids unique, since the interface keys on them', () => {
    const ids = groups.flatMap((group) => group.phrases.map((phrase) => phrase.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
