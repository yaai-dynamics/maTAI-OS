# 10 — Interpreter (Manipuri ⇄ English/Hindi)

A visitor speaking English or Hindi and a local host speaking Manipuri, through
the platform's own speech models. This is the part of the product a general
translation app cannot do: Meiteilon is barely served by them, and the platform
already has the hosts, the places and the trip on the same screen.

## What exists now

The whole interface, and the boundary the models plug into. No models are
connected yet, so the screen says so and the phrasebook carries the weight.

| Piece | Where |
| --- | --- |
| Screen | `src/app/m/talk/page.tsx`, `src/components/mobile/Interpreter.tsx` |
| Entry point | `src/components/mobile/TalkBubble.tsx` — a floating bubble above the tab bar, on every mobile screen |
| Types | `src/lib/types/interpreter.ts` |
| Provider boundary | `src/server/interpreter/provider.ts` |
| Implementations | `mock.ts` (refuses, by design), `runpod.ts` (the real thing) |
| Routes | `POST /api/interpreter/turn`, `GET /api/interpreter/warm` |
| Phrasebook | `data/phrasebook.json` |

## How a turn flows

```
hold to speak ─▶ MediaRecorder ─▶ POST /api/interpreter/turn (audio, from, to)
                                        │  ASR        speech → text
                                        │  translate  text → text
                                        │  TTS        text → speech
                                   ◀────┘ text + audio, played at once
```

The phone never calls the models: the endpoints and their key stay on the
server (CLAUDE.md §9). In an APK a key in the client would be readable by
anyone who unzips the file.

## Decisions worth keeping

- **The mock refuses rather than guesses.** An interpreter that invents a
  sentence is worse than one that admits it cannot help, because the visitor
  repeats it to a person standing in front of them.
- **Text is the result; speech is the best effort.** If TTS fails the turn
  still returns, so a listener who can read is not stranded.
- **Nothing is stored.** Audio lives in memory for the length of the request.
  The Decision Room needs none of it; what it can learn — which language pairs
  are asked for, and where — is an aggregate counted separately.
- **Manipuri lines in the phrasebook are `null` until a Manipuri speaker has
  checked them.** The interface says "awaiting a Manipuri speaker" instead of
  showing a guess.
- **Warming on open.** `/api/interpreter/warm` pokes the endpoints when the
  screen opens, because a cold serverless worker takes longer to start than a
  person waits.

## Connecting the models

The service is documented in `API_DOCUMENTATION.md`. Server environment
(Vercel project settings, never the repository):

```
INTERPRETER_PROVIDER=meitei
SPEECH_API_URL=https://…            base URL, no trailing slash
SPEECH_API_KEY=…                    when the service is behind one
SPEECH_MT_URL=…                     translation, when there is one
SPEECH_ISOLATE=auto                 auto (default) | always | never
SPEECH_TIMEOUT_MS=45000
```

`src/server/interpreter/meitei.ts` uses three of its endpoints:

| Call | Endpoint | Why |
| --- | --- | --- |
| hear | `POST /asr/v2/transcribe?language=…` | Meitei through N7Speech, English and Hindi through Whisper, so one service hears both sides |
| clean | `POST /voice/isolator` | phones record WebM, which the ASR does not take; it returns WAV and strips market noise on the way |
| speak | `POST /tts/meitei`, `POST /tts/english` | Meitei Mayek and Piper English |

## What the service cannot do, and what happens then

- **No translation.** Until `SPEECH_MT_URL` exists, a turn returns the
  transcript and the screen says nothing here can carry it across. It never
  guesses.
- **No Hindi voice.** Piper speaks English, N7Speech Meitei. A Hindi listener
  gets the text, and the browser reads it in a device voice. Manipuri stays
  text when the service is silent: no device voice speaks Meiteilon, and a
  wrong accent is worse than silence.

## Still open

1. **Translation.** AI4Bharat's IndicTrans2 is the strongest open option, but
   works in Manipuri's **Bengali script** while the speech models use **Meitei
   Mayek**, so a script conversion sits between them.
2. **Streaming.** The service also offers WebSocket ASR and TTS
   (`/asr/v2/stream-vad`, `/tts/meitei/ws`). Press-to-talk over REST is enough
   for the demo; streaming would remove the pause between turns.
3. **A government signal.** Counting interpretations by language pair and
   place would tell the department where visitors actually need language help.
   Aggregate only, no text, no audio.
