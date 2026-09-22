import { useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { runOcr, toDataUrl } from '../api';
import { Check, DropZone, ErrorNote, Field } from '../components/Bits';

/**
 * Each preset is a JSON Schema handed to document_annotation_format. The OCR
 * pass runs first, then a vision model fills the schema from what it read.
 */
const PRESETS = {
  none: { label: 'Markdown only — no extraction', schema: null, prompt: '' },
  article: {
    label: 'Press clipping',
    prompt: 'Pull the publication metadata and the substance of the article.',
    schema: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        publication: { type: 'string' },
        byline: { type: 'string' },
        published_on: { type: 'string', description: 'ISO date if one is printed' },
        language: { type: 'string' },
        topics: { type: 'array', items: { type: 'string' } },
        people_mentioned: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string', description: 'Two sentences, neutral' }
      },
      required: ['headline', 'summary']
    }
  },
  invoice: {
    label: 'Invoice',
    prompt: 'Extract the billing details. Amounts as numbers, no currency symbols.',
    schema: {
      type: 'object',
      properties: {
        supplier: { type: 'string' },
        invoice_number: { type: 'string' },
        issued_on: { type: 'string' },
        due_on: { type: 'string' },
        currency: { type: 'string' },
        total: { type: 'number' },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
              amount: { type: 'number' }
            },
            required: ['description', 'amount']
          }
        }
      },
      required: ['supplier', 'total']
    }
  },
  contract: {
    label: 'Agreement',
    prompt: 'Identify the parties and the commercial terms. Quote dates exactly as written.',
    schema: {
      type: 'object',
      properties: {
        parties: { type: 'array', items: { type: 'string' } },
        effective_date: { type: 'string' },
        term: { type: 'string' },
        governing_law: { type: 'string' },
        termination_notice: { type: 'string' },
        obligations: { type: 'array', items: { type: 'string' } }
      },
      required: ['parties']
    }
  }
};

/** Swap the OCR image placeholders for the base64 the API returned. */
function inlineImages(markdown, images = []) {
  let out = markdown;
  for (const img of images) {
    if (!img.image_base64) continue;
    out = out.split(`(${img.id})`).join(`(${img.image_base64})`);
  }
  return out;
}

export default function Documents() {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState('mistral-ocr-latest');
  const [preset, setPreset] = useState('none');
  const [prompt, setPrompt] = useState('');
  const [withImages, setWithImages] = useState(true);
  const [withBlocks, setWithBlocks] = useState(true);

  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('read');

  const extracted = useMemo(() => {
    if (!result?.document_annotation) return null;
    try {
      return JSON.parse(result.document_annotation);
    } catch {
      return result.document_annotation;
    }
  }, [result]);

  const pages = result?.pages ?? [];
  const blocks = useMemo(
    () => pages.flatMap((p) => (p.blocks ?? []).map((b) => ({ ...b, page: p.index }))),
    [pages]
  );

  const html = useMemo(() => {
    if (!pages.length) return '';
    const joined = pages
      .map((p, i) => {
        const body = inlineImages(p.markdown ?? '', p.images);
        return i === 0 ? body : `\n\n<hr class="page-sep"/>\n\nPage ${p.index + 1}\n\n${body}`;
      })
      .join('');
    return DOMPurify.sanitize(marked.parse(joined));
  }, [pages]);

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const dataUrl = await toDataUrl(file);
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      const body = {
        model,
        document: isPdf
          ? { type: 'document_url', document_url: dataUrl }
          : { type: 'image_url', image_url: dataUrl },
        include_image_base64: withImages,
        include_blocks: withBlocks
      };

      const chosen = PRESETS[preset];
      if (chosen.schema) {
        body.document_annotation_format = {
          type: 'json_schema',
          json_schema: { name: preset, schema: chosen.schema, strict: true }
        };
        body.document_annotation_prompt = prompt || chosen.prompt;
        // Document-level annotation tops out at 8 pages.
        body.pages = [0, 1, 2, 3, 4, 5, 6, 7];
      }

      setResult(await runOcr(body));
      setTab(chosen.schema ? 'fields' : 'read');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Read documents the way a person would</h1>
        <p>
          One call returns clean markdown, the typed blocks behind it with their coordinates, and —
          if you hand it a schema — the fields you actually wanted, already parsed.
        </p>
      </header>

      <div className="split">
        <div>
          <div className="card">
            <h2>Document</h2>
            <DropZone
              accept="application/pdf,image/*"
              file={file}
              onFile={(f) => {
                setFile(f);
                setResult(null);
              }}
              hint="pdf, png, jpg — scans and photographs are fine"
            />
          </div>

          <div className="card">
            <h2>Options</h2>
            <Field label="Model">
              <select className="control" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="mistral-ocr-latest">OCR 4.1 — blocks, bboxes, confidence</option>
                <option value="mistral-ocr-4">OCR 4</option>
                <option value="mistral-ocr-3">OCR 3</option>
              </select>
            </Field>

            <Field
              label="Extract into"
              hint={preset === 'none' ? undefined : 'Schema extraction reads the first 8 pages.'}
            >
              <select
                className="control"
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value);
                  setPrompt(PRESETS[e.target.value].prompt);
                }}
              >
                {Object.entries(PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            {preset !== 'none' ? (
              <Field label="Guidance for the extractor">
                <textarea
                  className="control"
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </Field>
            ) : null}

            <Check label="Return figures and charts" checked={withImages} onChange={setWithImages} />
            <Check label="Return typed blocks with coordinates" checked={withBlocks} onChange={setWithBlocks} />

            <button type="button" className="btn" disabled={!file || busy} onClick={run}>
              {busy ? 'Reading…' : 'Read document'}
            </button>
            <ErrorNote error={error} />
          </div>

          {preset !== 'none' ? (
            <div className="card">
              <h2>Schema sent with the request</h2>
              <pre className="json">{JSON.stringify(PRESETS[preset].schema, null, 2)}</pre>
            </div>
          ) : null}
        </div>

        <div className="out">
          <div className="tabs">
            <button type="button" className="tab" aria-selected={tab === 'read'} onClick={() => setTab('read')}>
              Markdown
            </button>
            <button type="button" className="tab" aria-selected={tab === 'fields'} onClick={() => setTab('fields')}>
              Extracted fields
            </button>
            <button type="button" className="tab" aria-selected={tab === 'blocks'} onClick={() => setTab('blocks')}>
              Blocks
            </button>
            <button type="button" className="tab" aria-selected={tab === 'raw'} onClick={() => setTab('raw')}>
              Response
            </button>
          </div>

          {result ? (
            <div className="out-bar">
              <span>{pages.length} pages</span>
              <span>{blocks.length || '—'} blocks</span>
              <span className="spacer">{result.model}</span>
            </div>
          ) : null}

          <div className="out-body">
            {!result ? (
              <p className="empty">
                Nothing read yet. Drop in an invoice, a press clipping, or a scanned contract and pick
                what you want back.
              </p>
            ) : tab === 'raw' ? (
              <pre className="json">
                {JSON.stringify(
                  {
                    ...result,
                    pages: pages.map((p) => ({
                      ...p,
                      images: (p.images ?? []).map((i) => ({ ...i, image_base64: i.image_base64 ? '…' : null }))
                    }))
                  },
                  null,
                  2
                )}
              </pre>
            ) : tab === 'fields' ? (
              extracted ? (
                <pre className="json">{JSON.stringify(extracted, null, 2)}</pre>
              ) : (
                <p className="empty">
                  This run asked for markdown only. Pick a schema on the left and read the document
                  again to get structured fields.
                </p>
              )
            ) : tab === 'blocks' ? (
              blocks.length ? (
                <div className="blocks">
                  {blocks.map((b, i) => (
                    <div className="block-row" key={i}>
                      <span className="block-kind">{b.type ?? 'block'}</span>
                      <span className="block-box">
                        {b.x ?? b.top_left_x}, {b.y ?? b.top_left_y} · {b.width ?? '—'}×{b.height ?? '—'}
                        {b.confidence != null ? ` · ${(b.confidence * 100).toFixed(0)}%` : ''}
                      </span>
                      <p className="block-text">{b.text ?? ''}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">
                  No blocks in this response. Turn on typed blocks and read the document again.
                </p>
              )
            ) : (
              <div className="doc-markdown" dangerouslySetInnerHTML={{ __html: html }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
