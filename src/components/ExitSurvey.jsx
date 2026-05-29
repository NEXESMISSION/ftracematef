import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../lib/errors.js';

// What they like to draw — multi-select. Drives the recommendation flywheel
// (which packs / references to surface). Whitelisted server-side so a client
// can't smuggle a custom value into the admin's bucket counts.
const DRAWS = [
  { id: 'anime',      emoji: '🌸', label: 'Anime / manga'   },
  { id: 'characters', emoji: '🦸', label: 'Characters'      },
  { id: 'animals',    emoji: '🐾', label: 'Animals'         },
  { id: 'portraits',  emoji: '🙂', label: 'Portraits'       },
  { id: 'tattoos',    emoji: '🖤', label: 'Tattoos'         },
  { id: 'nature',     emoji: '🌿', label: 'Nature'          },
  { id: 'lettering',  emoji: '✍️', label: 'Lettering'       },
  { id: 'fanart',     emoji: '⭐', label: 'Fan art'         },
  { id: 'other',      emoji: '✨', label: 'A bit of all'    },
];

/**
 * Inline survey card. Rendered on /account (by <Account />) when the user has
 * completed at least one trace and hasn't answered yet — never blocks tracing.
 *
 * One question: what do you like to draw? Tap a few, hit Save. Idempotent
 * server-side, so it only records once.
 */
export default function ExitSurvey({ onDone }) {
  const { profile, refresh } = useAuth();

  const [draws, setDraws] = useState([]);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone]   = useState(false);

  const toggleDraw = (id) => {
    setDraws((cur) =>
      cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id],
    );
  };

  const ready = draws.length > 0;

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!ready) {
      setError('Tap at least one — takes a sec.');
      return;
    }
    setBusy(true);
    try {
      // p_age stays null; the SQL RPC accepts null and only filters draws.
      const { error: rpcError } = await supabase.rpc('record_survey', {
        p_age:   null,
        p_draws: draws,
      });
      if (rpcError) throw rpcError;
      try { await refresh(); } catch { /* non-fatal */ }
      setDone(true);
      onDone?.();
    } catch (e) {
      setBusy(false);
      setError(friendlyError(e, "Couldn't save that — try once more?"));
    }
  };

  if (done || profile?.survey_completed_at) return null;

  return (
    <section className="exit-survey-card" aria-labelledby="survey-q">
      <p className="exit-survey-card-kicker">✦ one quick tap</p>
      <h2 id="survey-q" className="exit-survey-card-title">
        What do you like to draw?
      </h2>
      <p className="exit-survey-card-lead">
        Pick any — helps line up references you'll actually want to trace.
      </p>

      {error && (
        <div className="paywall-error" role="alert" style={{ margin: '0 0 14px' }}>
          <strong>Heads up — </strong>{error}
        </div>
      )}

      <div className="exit-survey-chips" role="group" aria-label="What do you like to draw">
        {DRAWS.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={draws.includes(d.id)}
            className={`exit-survey-chip${draws.includes(d.id) ? ' is-active' : ''}`}
            onClick={() => toggleDraw(d.id)}
            disabled={busy}
          >
            <span className="exit-survey-chip-icon" aria-hidden="true">{d.emoji}</span>
            <span className="exit-survey-chip-label">{d.label}</span>
          </button>
        ))}
      </div>

      <div className="exit-survey-actions">
        <button
          type="button"
          className="exit-survey-submit"
          onClick={submit}
          disabled={busy || !ready}
        >
          {busy ? 'Saving…' : ready ? 'Save →' : 'Pick at least one →'}
        </button>
      </div>
    </section>
  );
}
