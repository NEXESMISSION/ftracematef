import { useEffect, useState } from 'react';
import { listLibraryImages } from '../lib/library.js';

/**
 * A1 — Library picker modal. One flat collection; tapping an image hands the
 * row back to the parent (onPick), which loads it into the tracing flow.
 *
 * Props: open, onClose, onPick(row)  — row has { url, title, ... }.
 */
export default function LibraryPicker({ open, onClose, onPick }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setError('');
    listLibraryImages()
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) { setError('Could not load the library.'); setItems([]); } });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;
  const shown = items || [];

  return (
    <div className="lib-modal" role="dialog" aria-modal="true" aria-label="Image library">
      <div className="lib-backdrop" onClick={onClose} />
      <div className="lib-card">
        <div className="lib-head">
          <h2 className="lib-title">Pick from the library</h2>
          <button type="button" className="lib-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        </div>

        <div className="lib-body">
          {items === null && <p className="lib-muted">Loading…</p>}
          {error && <p className="lib-error">{error}</p>}
          {items !== null && !error && shown.length === 0 && (
            <p className="lib-muted">Nothing in the library yet.</p>
          )}
          {shown.length > 0 && (
            <div className="lib-grid">
              {shown.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="lib-item"
                  onClick={() => onPick(it)}
                  title={it.title || ''}
                >
                  <img
                    src={it.thumbUrl || it.url}
                    alt={it.title || 'Library image'}
                    loading="lazy"
                    decoding="async"
                    // Fade in on load; if already cached (complete at mount), show now.
                    ref={(n) => { if (n?.complete) n.classList.add('is-loaded'); }}
                    onLoad={(e) => e.currentTarget.classList.add('is-loaded')}
                  />
                  {it.title && <span className="lib-item-title">{it.title}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
