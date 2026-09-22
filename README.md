# Studio Bench

A React app that exercises four Mistral APIs against real files you drop in: Voxtral
transcription, Document AI / OCR, chat completions, and Voxtral TTS.

## Run it

```bash
npm install
cp .env.example .env          # then paste your key into MISTRAL_API_KEY
npm run dev                   # proxy on :8787, UI on http://localhost:5173
```

Get a key at <https://console.mistral.ai> under API Keys.

Production build:

```bash
npm run build
npm start                     # serves dist/ and /api from :8787
```

## Why there is a server

`api.mistral.ai` takes a bearer token. Anything the browser can send, a visitor can read out
of devtools, so the key lives only in `server/index.js` and the browser talks exclusively to
`/api/*`. Vite proxies those calls in dev; in production Express serves both. This also
sidesteps CORS entirely.

Five routes, all thin passthroughs:

| Route | Upstream | Notes |
| --- | --- | --- |
| `GET /api/models` | `GET /v1/models` | Populates the model picker from your key |
| `POST /api/transcribe` | `POST /v1/audio/transcriptions` | multipart, rebuilt server-side |
| `POST /api/ocr` | `POST /v1/ocr` | JSON, 60 MB body cap for base64 PDFs |
| `POST /api/chat` | `POST /v1/chat/completions` | SSE piped straight through |
| `POST /api/speech` | `POST /v1/audio/speech` | Returns binary audio |

## What each panel shows

**Transcribe** — the interesting parameters are the ones people miss. `diarize` labels
speakers, `timestamp_granularities` returns `segment` or `word` spans, and `context_bias`
takes up to 100 comma-separated terms so proper nouns come back spelled right. Segments are
clickable and seek the audio element. Note that `language` and `timestamp_granularities` are
mutually exclusive upstream — the UI enforces that rather than letting the API reject it.

The "Production notes" tab chains the timecoded transcript into `/v1/chat/completions`, which
is the more honest demo: one capability feeding another.

**Documents** — `include_blocks: true` returns typed blocks (`title`, `text`, `table`,
`equation`) with bounding boxes and per-block confidence, which is what you want for citation
and RAG. Supplying `document_annotation_format` switches the same endpoint into Document AI
mode: OCR runs first, then a vision model fills your JSON Schema. Three presets are included;
the schema is shown in the sidebar so you can see exactly what gets sent. Document-level
annotation is capped at 8 pages, so the request pins `pages` to the first eight.

**Reason** — model switching mid-conversation, streamed. Reasoning models return `content` as
an array of typed parts rather than a string; `src/api.js` handles both and renders thinking
traces separately.

**Speak** — preset voices and the five response formats. `ref_audio` (base64, 3+ seconds)
clones a voice in place of `voice`; `/v1/audio/voices` creates a reusable profile. Neither is
wired into the UI yet.

## Model IDs

Mistral retires model IDs on a published schedule, so prefer the aliases used here
(`voxtral-mini-latest`, `mistral-ocr-latest`) over pinned dates. Two exceptions worth knowing:

- `voxtral-mini-latest` resolves to a different model for chat than for transcription.
- TTS has no `-latest` alias. This app sends `voxtral-mini-tts-2603`; if your key rejects it,
  the field is editable — check `/api/models` for what your account actually has.

## Files

```
server/index.js        the only process that sees the API key
src/api.js             fetch wrappers, SSE parsing, file → data URL
src/App.jsx            rail navigation, shared model list
src/panels/*.jsx       one panel per capability
src/components/Bits.jsx  drop zone, fields, formatters
```
