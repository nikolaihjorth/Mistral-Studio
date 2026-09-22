import { useEffect, useState } from 'react';
import { listModels } from './api';
import Transcribe from './panels/Transcribe';
import Documents from './panels/Documents';
import Reason from './panels/Reason';
import Speak from './panels/Speak';

const PANELS = [
  { id: 'transcribe', name: 'Transcribe', sub: 'voxtral-mini-latest' },
  { id: 'documents', name: 'Documents', sub: 'mistral-ocr-latest' },
  { id: 'reason', name: 'Reason', sub: 'chat/completions' },
  { id: 'speak', name: 'Speak', sub: 'voxtral-mini-tts' }
];

const FALLBACK_MODELS = [
  { id: 'mistral-medium-latest' },
  { id: 'mistral-small-latest' },
  { id: 'mistral-large-latest' }
];

export default function App() {
  const [active, setActive] = useState('transcribe');
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [chatModel, setChatModel] = useState('mistral-medium-latest');
  const [keyOk, setKeyOk] = useState(null);

  useEffect(() => {
    listModels()
      .then((all) => {
        const chat = all
          .filter((m) => m.capabilities?.completion_chat && !m.id.includes('ocr'))
          .sort((a, b) => a.id.localeCompare(b.id));
        if (chat.length) {
          setModels(chat);
          if (!chat.some((m) => m.id === chatModel)) setChatModel(chat[0].id);
        }
        setKeyOk(true);
      })
      .catch(() => setKeyOk(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="shell">
      <nav className="rail">
        <h1 className="wordmark">
          Studio Bench
          <span>Mistral API demos</span>
        </h1>

        <div className="rail-nav">
          {PANELS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rail-link"
              aria-current={active === p.id}
              onClick={() => setActive(p.id)}
            >
              {p.name}
              <small>{p.sub}</small>
            </button>
          ))}
        </div>

        <div className="rail-foot">
          <p>
            {keyOk === null
              ? 'Checking your key…'
              : keyOk
                ? `${models.length} chat models on this key`
                : 'No response from the proxy. Is the server running with MISTRAL_API_KEY set?'}
          </p>
          <p>
            <a href="https://docs.mistral.ai" target="_blank" rel="noreferrer">
              docs.mistral.ai
            </a>
          </p>
        </div>
      </nav>

      <main className="main">
        {active === 'transcribe' ? <Transcribe chatModel={chatModel} /> : null}
        {active === 'documents' ? <Documents /> : null}
        {active === 'reason' ? (
          <Reason models={models} model={chatModel} onModel={setChatModel} />
        ) : null}
        {active === 'speak' ? <Speak /> : null}
      </main>
    </div>
  );
}
