import { useState } from 'react';
import { submitReview } from '../lib/creations.js';

/**
 * Honest-review prompt shown ONCE, right before a free user starts their third
 * (last) free trace — the moment they've felt the product but still have a
 * reason to come back. Stars + a short note, with quick mock answers for the
 * lazy. On submit or skip it calls onDone() to let the trace proceed.
 *
 * Gating (which free session, "show once") is decided by the parent; this is
 * purely the modal UI + submit.
 */
const QUICK_NOTES = [
  'Way easier than I expected — the overlay just works.',
  'Tracing finally feels effortless. Love it.',
  'Good, but I wish there were more reference images.',
  'It’s fun but a bit fiddly to line things up.',
  'Honestly amazing for someone who can’t draw.',
];

export default function ReviewGate({ onDone }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = (didSubmit) => {
    try { localStorage.setItem('tm:reviewed', didSubmit ? 'done' : 'skipped'); } catch { /* ignore */ }
    onDone?.();
  };

  const submit = async () => {
    if (busy || rating < 1) return;
    setBusy(true);
    try {
      await submitReview(rating, note.trim() || null);
    } catch { /* best-effort — never block the trace */ }
    finish(true);
  };

  const shown = hover || rating;

  return (
    <div className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="review-backdrop" />
      <div className="review-card">
        <p className="review-kicker">✦ before your next trace</p>
        <h2 id="review-title" className="review-title">Leave an honest review</h2>
        <p className="review-lead">
          Be real — what do you actually think so far? It helps us make Trace Mate better.
        </p>

        <div className="review-stars" role="radiogroup" aria-label="Rating out of 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className={`review-star ${n <= shown ? 'is-on' : ''}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              disabled={busy}
            >★</button>
          ))}
        </div>

        <textarea
          className="review-note"
          placeholder="Say it honestly (optional)…"
          maxLength={500}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />

        {/* Quick picks for the lazy — tap to fill the note. */}
        <div className="review-quick">
          {QUICK_NOTES.map((q) => (
            <button
              key={q}
              type="button"
              className="review-quick-chip"
              onClick={() => setNote(q)}
              disabled={busy}
            >{q}</button>
          ))}
        </div>

        <div className="review-actions">
          <button type="button" className="review-skip" onClick={() => finish(false)} disabled={busy}>
            Skip
          </button>
          <button type="button" className="review-submit" onClick={submit} disabled={busy || rating < 1}>
            {busy ? 'Sending…' : rating < 1 ? 'Pick a rating' : 'Submit & trace →'}
          </button>
        </div>
      </div>
    </div>
  );
}
