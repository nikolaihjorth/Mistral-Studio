/**
 * Thin wrapper over the local proxy. No API key ever reaches this file —
 * the browser only ever talks to /api/*.
 */

async function unwrap(res) {
  if (res.ok) return res;
  let detail;
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.error?.detail || JSON.stringify(body?.error ?? body);
  } catch {
    detail = await res.text();
  }
  throw new Error(detail || `Request failed with ${res.status}`);
}

export async function listModels() {
  const res = await unwrap(await fetch('/api/models'));
  const { data = [] } = await res.json();
  return data;
}

export async function transcribe({ file, model, diarize, granularity, contextBias, language }) {
  const form = new FormData();
  form.append('file', file);
  form.append('model', model);
  if (diarize) form.append('diarize', 'true');
  if (granularity) form.append('timestamp_granularities', granularity);
  else if (language) form.append('language', language);
  if (contextBias?.trim()) form.append('context_bias', contextBias.trim());

  const res = await unwrap(await fetch('/api/transcribe', { method: 'POST', body: form }));
  return res.json();
}

export async function runOcr(payload) {
  const res = await unwrap(
    await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
  return res.json();
}

export async function synthesize({ input, model, voice, format = 'mp3' }) {
  const res = await unwrap(
    await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input, voice, response_format: format })
    })
  );
  return res.blob();
}

/**
 * Streams a chat completion. `onDelta` gets text chunks, `onThinking` gets
 * reasoning traces from the models that emit them.
 */
export async function streamChat({ model, messages, temperature = 0.3, signal, onDelta, onThinking }) {
  const res = await unwrap(
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature }),
      signal
    })
  );

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.usage) usage = chunk.usage;

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // Reasoning models return content as an array of typed parts.
      if (Array.isArray(delta.content)) {
        for (const part of delta.content) {
          if (part.type === 'thinking') {
            const text = Array.isArray(part.thinking)
              ? part.thinking.map((t) => t.text ?? '').join('')
              : String(part.thinking ?? '');
            onThinking?.(text);
          } else if (part.type === 'text') {
            onDelta?.(part.text ?? '');
          }
        }
      } else if (typeof delta.content === 'string') {
        onDelta?.(delta.content);
      }
    }
  }
  return { usage };
}

/** file -> "data:<mime>;base64,<...>" */
export function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
