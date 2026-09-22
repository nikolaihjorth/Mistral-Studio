import { useEffect, useState } from 'react';
import { synthesize } from '../api';
import { ErrorNote, Field } from '../components/Bits';

const VOICES = [
  'en_paul_neutral',
  'en_paul_excited',
  'en_alice_neutral',
  'en_alice_warm',
  'fr_claire_neutral',
  'de_hans_neutral',
  'es_lucia_neutral',
  'it_marco_neutral'
];

const FORMATS = ['mp3', 'wav', 'opus', 'flac', 'pcm'];

export default function Speak() {
  const [text, setText] = useState(
    'Good morning. Three stories are leading today: the transport strike enters its fourth day, the housing bill returns to committee, and the harbour tunnel opens two months early.'
  );
  const [voice, setVoice] = useState('en_paul_neutral');
  const [model, setModel] = useState('voxtral-mini-tts-2603');
  const [format, setFormat] = useState('mp3');
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const blob = await synthesize({ input: text, model, voice, format });
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Give the text a voice</h1>
        <p>
          The other half of Voxtral. Useful for audio versions of articles, rough scratch tracks, and
          checking how a script actually sounds before anyone books a studio.
        </p>
      </header>

      <div className="split">
        <div>
          <div className="card">
            <h2>Script</h2>
            <textarea
              className="control"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p style={{ fontFamily: 'var(--data)', fontSize: 11, color: 'var(--ink-faint)', margin: 0 }}>
              {text.length} characters
            </p>
          </div>

          <div className="card">
            <h2>Output</h2>
            <Field label="Model">
              <input className="control" value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
            <Field label="Format">
              <select className="control" value={format} onChange={(e) => setFormat(e.target.value)}>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <button type="button" className="btn" disabled={busy || !text.trim()} onClick={run}>
              {busy ? 'Generating…' : 'Generate audio'}
            </button>
            <ErrorNote error={error} />
          </div>
        </div>

        <div className="out">
          <div className="out-bar">
            <span>Preset voices</span>
            <span className="spacer">{voice}</span>
          </div>
          <div className="out-body">
            <div className="voice-grid">
              {VOICES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="voice-chip"
                  aria-pressed={voice === v}
                  onClick={() => setVoice(v)}
                >
                  {v}
                </button>
              ))}
            </div>

            {url ? (
              <>
                <audio src={url} controls autoPlay />
                <p className="btn-row" style={{ marginTop: 'var(--sp-3)' }}>
                  <a className="btn btn-quiet" href={url} download={`voxtral.${format}`}>
                    Download
                  </a>
                </p>
              </>
            ) : (
              <p className="empty">
                Nothing generated yet. Pick a voice, then generate — the clip plays here and you can
                download it.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
