import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1';
const KEY = process.env.MISTRAL_API_KEY;
const PORT = process.env.PORT || 8787;

if (!KEY) {
  console.error('\nMISTRAL_API_KEY is not set. Copy .env.example to .env and add your key.\n');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '60mb' })); // base64 PDFs get large
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const auth = { Authorization: `Bearer ${KEY}` };

/** Forward an upstream error with its status and body intact so the UI can show something real. */
async function relayError(upstream, res) {
  const body = await upstream.text();
  let detail = body;
  try {
    detail = JSON.parse(body);
  } catch {
    /* plain text error */
  }
  res.status(upstream.status).json({ error: detail, status: upstream.status });
}

/* ── Models ─────────────────────────────────────────────────────────────── */
app.get('/api/models', async (_req, res) => {
  try {
    const r = await fetch(`${BASE}/models`, { headers: auth });
    if (!r.ok) return relayError(r, res);
    res.json(await r.json());
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

/* ── Speech to text: Voxtral ────────────────────────────────────────────── */
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    const form = new FormData();
    form.append('model', req.body.model || 'voxtral-mini-latest');

    if (req.file) {
      form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    } else if (req.body.file_url) {
      form.append('file_url', req.body.file_url);
    } else {
      return res.status(400).json({ error: 'Attach an audio file or pass file_url.' });
    }

    // language and timestamp_granularities are mutually exclusive upstream.
    if (req.body.timestamp_granularities) {
      form.append('timestamp_granularities', req.body.timestamp_granularities);
    } else if (req.body.language) {
      form.append('language', req.body.language);
    }
    if (req.body.diarize === 'true') form.append('diarize', 'true');
    if (req.body.context_bias) form.append('context_bias', req.body.context_bias);

    const r = await fetch(`${BASE}/audio/transcriptions`, { method: 'POST', headers: auth, body: form });
    if (!r.ok) return relayError(r, res);
    res.json(await r.json());
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

/* ── Document AI: OCR + schema extraction ───────────────────────────────── */
app.post('/api/ocr', async (req, res) => {
  try {
    const r = await fetch(`${BASE}/ocr`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (!r.ok) return relayError(r, res);
    res.json(await r.json());
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

/* ── Chat, streamed straight through as SSE ─────────────────────────────── */
app.post('/api/chat', async (req, res) => {
  try {
    const upstream = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req.body, stream: true })
    });
    if (!upstream.ok) return relayError(upstream, res);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const reader = upstream.body.getReader();
    req.on('close', () => reader.cancel().catch(() => {}));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: String(e) });
    else res.end();
  }
});

/* ── Text to speech: Voxtral TTS ────────────────────────────────────────── */
app.post('/api/speech', async (req, res) => {
  try {
    const r = await fetch(`${BASE}/audio/speech`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (!r.ok) return relayError(r, res);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

/* ── Serve the built client in production ───────────────────────────────── */
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Mistral proxy listening on http://localhost:${PORT}`));
