# 📘 Meitei Speech & ASR API Reference

This document provides a clean overview of all available API endpoints, their roles, request parameters, protocol requirements, and responses.

---

## 🌐 1. Server Connection Details

- **Base REST URL**: `https://unspeakingly-prosubscription-etta.ngrok-free.dev` (or `http://localhost:8000`)
- **Base WebSocket URL**: `wss://unspeakingly-prosubscription-etta.ngrok-free.dev` (or `ws://localhost:8000`)
- **Interactive OpenAPI/Swagger Docs**: `/docs`

---

## 🗣️ 2. Text-to-Speech (TTS) Endpoints

### 1. Meitei Speech Synthesis (REST)
- **Endpoint**: `POST /tts/meitei` *(Legacy alias: `POST /tts`)*
- **Role**: Converts Meitei Mayek text into speech audio.
- **Request Body (JSON)**:
  - `text` *(string, required)*: Meitei Mayek text to convert.
  - `priority` *(string, optional)*: `"realtime"`, `"normal"` (default), or `"batch"`.
  - `format` *(string, optional)*: `"wav"` (default, returns `audio/wav`), `"raw"` (returns PCM bytes), or `"json"` (returns base64 audio string + word timestamps array).
  - `max_chunk_words` *(integer, optional)*: Max words per chunk (default: `10`).
- **Use Case**: Playing full spoken audio for articles, short messages, or UI prompts.

### 2. Meitei Speech Streaming (SSE)
- **Endpoint**: `POST /tts/meitei/stream` *(Legacy alias: `POST /tts/stream-rest`)*
- **Role**: Streams Meitei TTS audio sentence-by-sentence via Server-Sent Events (SSE).
- **Request Body (JSON)**: Same as `/tts/meitei`.
- **Response**: `text/event-stream` returning JSON data objects per audio chunk + completed status.
- **Use Case**: Fast initial audio response for long texts without waiting for full synthesis.

### 3. Meitei Real-Time Interactive Streaming (WebSocket)
- **Endpoint**: `WS /tts/meitei/ws` *(Legacy alias: `WS /tts/ws`)*
- **Role**: Bi-directional real-time TTS stream for chat applications and assistants.
- **Protocol Workflow**:
  1. Client connects to `WS /tts/meitei/ws`.
  2. Client streams text strings as user types or LLM outputs tokens.
  3. Client sends `"__FLUSH__"` string to signal end of sentence/prompt.
  4. Server sends JSON metadata (`{"type": "text", "content": "..."}`) followed by raw binary audio frames (`ArrayBuffer`).
  5. Server sends `{"type": "done"}` when complete.
- **Use Case**: Voice assistants, live LLM speech streaming, low-latency conversational UI.

### 4. English Speech Synthesis (REST)
- **Endpoint**: `POST /tts/english`
- **Role**: Converts English text to speech using the Piper TTS engine.
- **Request Body (JSON)**: `{"text": "Hello world"}`.
- **Response**: `audio/wav` audio file.

### 5. English Speech Streaming (SSE & WebSocket)
- **Endpoints**: `POST /tts/english/stream` (SSE) & `WS /tts/english/ws` (WebSocket)
- **Role**: Streams English speech with karaoke-style word timing metadata for UI word highlighting.

---

## 🎙️ 3. Automatic Speech Recognition (ASR v2) Endpoints

### 1. Supported Languages Discovery
- **Endpoint**: `GET /asr/v2/languages`
- **Role**: Returns the list of 100 supported ASR languages (99 Whisper languages + Meitei Mayek `mni` via N7Speech).

### 2. Single Audio File Transcription (REST)
- **Endpoint**: `POST /asr/v2/transcribe`
- **Role**: Transcribes uploaded audio bytes directly to text.
- **Query Parameters**:
  - `language` *(string, default: `"auto"`)*: Language code (e.g., `"auto"`, `"mni"`, `"en"`, `"hi"`, `"bn"`).
- **Request Body**: Raw Audio Bytes (`WAV`, `MP3`, or 16kHz float32 PCM).
- **Response (JSON)**:
  - `text`: Transcribed text (Meitei Mayek or target language).
  - `text_latin`: Transliterated Latin script (if Meitei).
  - `language`: Detected or selected language code.
  - `engine`: `"n7speech"` (for Meitei) or `"whisper"` (for all other languages).
  - `processing_time_ms`: Time taken to transcribe.

### 3. Live Streaming Speech-to-Text (WebSocket - Client VAD)
- **Endpoint**: `WS /asr/v2/stream`
- **Query Parameter**: `?language=auto` (or `mni`, `en`, `hi`)
- **Role**: Real-time microphone streaming for low-latency live transcription.
- **Protocol**:
  - Send: Raw Float32 PCM audio bytes at 16kHz.
  - Send text string `"__SEGMENT_END__"` when speech pauses.
  - Receive JSON: `{"type": "interim", "text": "..."}` or `{"type": "final", "text": "..."}`.

### 4. Live Streaming Speech-to-Text with Server VAD (WebSocket)
- **Endpoint**: `WS /asr/v2/stream-vad`
- **Role**: Real-time microphone streaming where the server automatically detects pauses and speech start/end using Silero VAD without requiring client-side pause detection logic.

### 5. Long Audio File Async Processing (Jobs Queue)
- **Endpoints**:
  - `POST /asr/v2/jobs?language=auto`: Submits long audio file (>1 min) and returns `job_id`.
  - `GET /asr/v2/jobs/{job_id}`: Checks processing status and percentage progress.
  - `GET /asr/v2/jobs/{job_id}/result`: Retrieves full timestamped transcription result when complete.
  - `WS /asr/v2/jobs/{job_id}/stream`: WebSocket stream for live progress updates.

---

## 🎛️ 4. Voice Isolation & Denoising Endpoint

- **Endpoint**: `POST /voice/isolator`
- **Role**: DeepFilterNet speech enhancement to remove ambient noise, crowd noise, AC hum, and room reverb.
- **Query Parameters**:
  - `sample_rate` *(integer, default: `16000`)*: Target sample rate.
  - `output_format` *(string, default: `"wav"`)*: `"wav"`, `"base64"`, or `"raw"`.
- **Request Body**: Any raw audio file bytes (`WAV`, `MP3`, `WebM`).
- **Response**: Clean speech audio with background noise filtered out.

---

## 🧠 5. Text Embeddings Endpoint

- **Endpoint**: `POST /embeddings/generate` *(Legacy alias: `POST /embeddings`)*
- **Role**: Generates 384-dimensional dense vector embeddings using Sentence Transformers (`all-MiniLM-L6-v2`).
- **Request Body (JSON)**: `{"text": "Sample text"}` or `{"text": ["Text 1", "Text 2"]}`.
- **Response (JSON)**: Array of vector embeddings, processing time, and dimension count.
- **Use Case**: Semantic search, vector database indexing, document similarity, RAG pipeline.

---

## 🛡️ 6. System & Monitoring Endpoints

- **`GET /health`**: Health status of TTS queue and GPU/CPU inference device.
- **`GET /stats`**: Live performance metrics, total request counts, and latency averages.
- **`GET /asr/health`**: Health status of Whisper & N7Speech ASR engines.
- **`POST /admin/switch-model`**: Swaps the active TTS model checkpoint at runtime without server restart.
