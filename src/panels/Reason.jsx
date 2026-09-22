import { useRef, useState } from 'react';
import { streamChat } from '../api';
import { ErrorNote, Field } from '../components/Bits';

const STARTERS = [
  'A regional paper has 40 years of print archives as scanned PDFs. Sketch a pipeline that makes them searchable, and say where it will break.',
  'Explain the difference between diarization and speaker identification, and when conflating them causes real problems.',
  'Write a Danish-language push notification for a breaking story about a transport strike. 120 characters.'
];

export default function Reason({ models, model, onModel }) {
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState(null);
  const abort = useRef(null);

  async function send(text) {
    const content = (text ?? draft).trim();
    if (!content || busy) return;

    const history = [...turns, { role: 'user', content }];
    setTurns([...history, { role: 'assistant', content: '', thinking: '' }]);
    setDraft('');
    setBusy(true);
    setError('');
    setUsage(null);

    abort.current = new AbortController();
    try {
      const { usage: u } = await streamChat({
        model,
        messages: history.map(({ role, content: c }) => ({ role, content: c })),
        signal: abort.current.signal,
        onDelta: (t) =>
          setTurns((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: next[next.length - 1].content + t
            };
            return next;
          }),
        onThinking: (t) =>
          setTurns((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              thinking: next[next.length - 1].thinking + t
            };
            return next;
          })
      });
      setUsage(u);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Compare models on your own prompts</h1>
        <p>
          Switch model between turns and the conversation carries over, so you can see where the
          small open-weight model is already enough and where it isn&apos;t.
        </p>
      </header>

      <div className="split">
        <div>
          <div className="card">
            <h2>Model</h2>
            <Field label="Answering with" hint={`${models.length} models available on your key`}>
              <select className="control" value={model} onChange={(e) => onModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </Field>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!turns.length}
                onClick={() => {
                  setTurns([]);
                  setUsage(null);
                }}
              >
                Clear conversation
              </button>
              {busy ? (
                <button type="button" className="btn btn-quiet" onClick={() => abort.current?.abort()}>
                  Stop
                </button>
              ) : null}
            </div>
            <ErrorNote error={error} />
          </div>

          <div className="card">
            <h2>Try one of these</h2>
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                className="drop"
                style={{ textAlign: 'left', marginBottom: 'var(--sp-2)', fontSize: 13 }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="out">
          {usage ? (
            <div className="out-bar">
              <span>{usage.prompt_tokens} in</span>
              <span>{usage.completion_tokens} out</span>
              <span className="spacer">{model}</span>
            </div>
          ) : null}

          <div className="out-body">
            {turns.length ? (
              <div className="thread">
                {turns.map((t, i) => (
                  <div className="turn" key={i}>
                    <div className="turn-who">{t.role === 'user' ? 'You' : model}</div>
                    {t.thinking ? <div className="thinking">{t.thinking}</div> : null}
                    <p className="turn-body">
                      {t.content}
                      {busy && i === turns.length - 1 ? <span className="caret" /> : null}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">
                No conversation yet. Ask something, then re-send it on a different model to see what
                changes.
              </p>
            )}

            <div className="composer">
              <textarea
                className="control"
                value={draft}
                placeholder="Ask something…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
                }}
              />
              <button type="button" className="btn" disabled={busy || !draft.trim()} onClick={() => send()}>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
