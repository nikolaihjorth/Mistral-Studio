import { useRef, useState } from 'react';

export function DropZone({ accept, file, onFile, hint }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  function take(list) {
    const next = list?.[0];
    if (next) onFile(next);
  }

  return (
    <div
      className="drop"
      data-over={over}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => take(e.target.files)}
      />
      {file ? (
        <>
          <strong>{file.name}</strong>
          <small>{formatBytes(file.size)}</small>
        </>
      ) : (
        <>
          <strong>Drop a file or click to browse</strong>
          <small>{hint}</small>
        </>
      )}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Check({ label, checked, onChange, disabled }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <p className="error">
      That request didn&apos;t go through. <code>{error}</code>
    </p>
  );
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatClock(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '--:--';
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
