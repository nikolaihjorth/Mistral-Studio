import { useEffect, useMemo, useRef, useState } from 'react';
import { transcribe, streamChat } from '../api';
import { Check, DropZone, ErrorNote, Field, formatClock } from '../components/Bits';

const SPEAKER_INK = ['#2b5fa8', '#2f6f4f', '#8a5a1a', '#6b4b9e', '#a33a3a', '#1f6f78'];

export default function Transcribe({ chatModel }) {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState('voxtral-mini-latest');
  const [diarize, setDiarize] = useState(true);
  const [granularity, setGranularity] = useState('segment');
  const [contextBias, setContextBias] = useState('');
  const [language, setLanguage] = useState('');

  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('transcript');
  const [elapsed, setElapsed] = useState(null);

  const [summary, setSummary] = useState('');
  const [summarising, setSummarising] = useState(false);

  const [recording, setRecording] = useState(false);
  const recorder = useRef(null);

  const audioRef = useRef(null);
  const [playhead, setPlayhead] = useState(0);
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => objectUrl && URL.revokeObjectURL(objectUrl), [objectUrl]);

  const segments = result?.segments ?? [];
  const speakers = useMemo(
    () => [...new Set(segments.map((s) => s.speaker).filter(Boolean))],
    [segments]
  );

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        setFile(new File([blob], `recording-${Date.now()}.webm`, { type: blob.type }));
        setRecording(false);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      setError(`Microphone unavailable: ${e.message}`);
    }
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    setSummary('');
    const started = performance.now();
    try {
      const data = await transcribe({
        file,
        model,
        diarize,
        granularity: granularity === 'none' ? '' : granularity,
        contextBias,
        language: granularity === 'none' ? language : ''
      });
      setResult(data);
      setElapsed((performance.now() - started) / 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function summarise() {
    if (!result?.text) return;
    setSummarising(true);
    setSummary('');
    try {
      await streamChat({
        model: chatModel,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You produce production notes from raw interview transcripts. Reply with three short sections: a one-line topline, the three most quotable moments with their timecodes, and any names or claims that need fact-checking. No preamble.'
          },
          {
            role: 'user',
            content: segments.length
              ? segments
                  .map((s) => `[${formatClock(s.start)}] ${s.speaker ? `${s.speaker}: ` : ''}${s.text}`)
                  .join('\n')
              : result.text
          }
        ],
        onDelta: (t) => setSummary((prev) => prev + t)
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSummarising(false);
    }
  }

  function seek(seconds) {
    const el = audioRef.current;
    if (!el || seconds == null) return;
    el.currentTime = seconds;
    el.play();
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Turn recordings into usable transcripts</h1>
        <p>
          Voxtral handles the whole file in one request — speakers labelled, timecodes attached, and
          a bias list so it spells your proper nouns correctly the first time.
        </p>
      </header>

      <div className="split">
        <div>
          <div className="card">
            <h2>Audio</h2>
            <DropZone
              accept="audio/*,video/mp4,video/webm"
              file={file}
              onFile={(f) => {
                setFile(f);
                setResult(null);
              }}
              hint="mp3, wav, m4a, ogg, webm — up to about 3 hours"
            />
            <div className="btn-row" style={{ marginTop: 'var(--sp-3)' }}>
              <button
                type="button"
                className={recording ? 'btn btn-rec' : 'btn btn-quiet'}
                onClick={toggleRecording}
              >
                {recording ? 'Stop recording' : 'Record from mic'}
              </button>
              {file ? (
                <button type="button" className="btn btn-quiet" onClick={() => setFile(null)}>
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="card">
            <h2>Options</h2>
            <Field label="Model">
              <select className="control" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="voxtral-mini-latest">Voxtral Mini Transcribe 2 — transcription only</option>
                <option value="voxtral-small-latest">Voxtral Small — audio in, instruction following</option>
              </select>
            </Field>

            <Field label="Timestamps">
              <select
                className="control"
                value={granularity}
                onChange={(e) => setGranularity(e.target.value)}
              >
                <option value="segment">Per segment</option>
                <option value="word">Per word</option>
                <option value="none">None — let me pin the language instead</option>
              </select>
            </Field>

            {granularity === 'none' ? (
              <Field label="Language" hint="ISO code such as en, da, fr. Leave blank to auto-detect.">
                <input
                  className="control"
                  value={language}
                  placeholder="auto"
                  onChange={(e) => setLanguage(e.target.value)}
                />
              </Field>
            ) : null}

            <Check label="Label speakers" checked={diarize} onChange={setDiarize} />

            <Field
              label="Spell these correctly"
              hint="Up to 100 comma-separated names or terms. Tuned for English."
            >
              <textarea
                className="control"
                rows={3}
                value={contextBias}
                placeholder="Nørrebro, Rasmussen, Jyllands-Posten, DR2"
                onChange={(e) => setContextBias(e.target.value)}
              />
            </Field>

            <button type="button" className="btn" disabled={!file || busy} onClick={run}>
              {busy ? 'Transcribing…' : 'Transcribe'}
            </button>
            <ErrorNote error={error} />
          </div>
        </div>

        <div className="out">
          <div className="tabs">
            <button
              type="button"
              className="tab"
              aria-selected={tab === 'transcript'}
              onClick={() => setTab('transcript')}
            >
              Transcript
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={tab === 'notes'}
              onClick={() => setTab('notes')}
            >
              Production notes
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={tab === 'raw'}
              onClick={() => setTab('raw')}
            >
              Response
            </button>
          </div>

          {result ? (
            <div className="out-bar">
              <span>{result.language ? result.language.toUpperCase() : 'auto'}</span>
              <span>{segments.length || '—'} segments</span>
              {speakers.length ? <span>{speakers.length} speakers</span> : null}
              <span className="spacer">{elapsed ? `${elapsed.toFixed(1)}s round trip` : ''}</span>
            </div>
          ) : null}

          <div className="out-body">
            {!result ? (
              <p className="empty">
                Nothing transcribed yet. Add a file on the left, or record a few seconds straight from
                your microphone to see the round trip.
              </p>
            ) : tab === 'raw' ? (
              <pre className="json">{JSON.stringify(result, null, 2)}</pre>
            ) : tab === 'notes' ? (
              <>
                <button type="button" className="btn" disabled={summarising} onClick={summarise}>
                  {summarising ? 'Reading the transcript…' : 'Draft production notes'}
                </button>
                {summary ? (
                  <p className="plain-text" style={{ marginTop: 'var(--sp-4)' }}>
                    {summary}
                    {summarising ? <span className="caret" /> : null}
                  </p>
                ) : (
                  <p className="empty">
                    Sends the timecoded transcript to {chatModel} and asks for a topline, the best
                    pull quotes, and anything worth checking.
                  </p>
                )}
              </>
            ) : (
              <>
                {objectUrl ? (
                  <audio
                    ref={audioRef}
                    src={objectUrl}
                    controls
                    onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                  />
                ) : null}

                {segments.length ? (
                  <div className="segments" style={{ marginTop: 'var(--sp-4)' }}>
                    {segments.map((seg, i) => {
                      const active = playhead >= seg.start && playhead < seg.end;
                      const ink = seg.speaker
                        ? SPEAKER_INK[speakers.indexOf(seg.speaker) % SPEAKER_INK.length]
                        : null;
                      return (
                        <button
                          key={i}
                          type="button"
                          className="seg"
                          data-active={active}
                          onClick={() => seek(seg.start)}
                        >
                          <span className="seg-time">{formatClock(seg.start)}</span>
                          <span>
                            {seg.speaker ? (
                              <span className="seg-speaker" style={{ color: ink }}>
                                {seg.speaker}
                              </span>
                            ) : null}
                            <p className="seg-text">{seg.text}</p>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="plain-text" style={{ marginTop: 'var(--sp-4)' }}>
                    {result.text}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
