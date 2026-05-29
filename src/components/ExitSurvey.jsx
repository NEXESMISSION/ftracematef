import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../lib/errors.js';

// Age buckets — single select. Mirrored in the record_survey whitelist so a
// client can't smuggle a custom value into the admin's bucket counts.
const AGES = [
  { id: '13-17', label: '13–17' },
  { id: '18-24', label: '18–24' },
  { id: '25-34', label: '25–34' },
  { id: '35-44', label: '35–44' },
  { id: '45+',   label: '45+'   },
];

// What they like to draw — multi-select. Drives the recommendation flywheel
// (which packs / references to surface), so it's worth a few extra taps.
// Also whitelisted server-side.
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
 * Post-trace survey. Rendered by RequirePaid as a one-time gate on /trace
 * AFTER the user's first trace (gated on trace_sessions >= 1), so we catch
 * them in the post-win glow rather than blocking their first attempt.
 *
 * Two quick questions — age + what they like to draw — feed a recommendation
 * flywheel. After a successful submit the parent re-renders straight to
 * wherever the user was heading: the Trace studio (paid + free trial left),
 * or the Paywall (trial used).
 *
 * Required gate: no skip. Both questions must be answered. If the user closes
 * the tab without answering, survey_completed_at stays null and the survey
 * re-renders on the next /trace visit until they submit (idempotent server-
 * side, so it only ever records once).
 */
export default function ExitSurvey({ onDone }) {
  const { profile, user, refresh } = useAuth();

  const [age, setAge]     = useState('');
  const [draws, setDraws] = useState([]);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  const greeting = profile?.display_name || user?.email?.split('@')[0] || 'friend';

  const toggleDraw = (id) => {
    setDraws((cur) =>
      cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id],
    );
  };

  const ready = !!age && draws.length > 0;

  const submit = async () => {
    if (busy) return;
    setError(null);

    if (!ready) {
      setError('Pick your age and at least one thing you draw — takes a sec.');
      return;
    }

    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('record_survey', {
        p_age:   age,
        p_draws: draws,
      });
      if (rpcError) throw rpcError;
      // Refresh profile so RequirePaid sees survey_completed_at and stops
      // rendering this overlay. Failures are non-fatal — we still call onDone
      // so the user isn't trapped behind a transient blip.
      try { await refresh(); } catch { /* ignore */ }
      onDone?.();
    } catch (e) {
      setBusy(false);
      setError(friendlyError(e, "Couldn't save that — try once more?"));
    }
  };

  return (
    <div className="studio-shell">
      <header className="studio-bar">
        <Link to="/" className="studio-brand"><img src="/images/brand/logo.webp" alt="Trace Mate" /></Link>
      </header>

      <main className="exit-survey">
        <p className="kicker hand">nice trace, {greeting} ✦</p>
        <h1>Two quick taps.</h1>
        <p className="lead">
          Tell us a little about you so we can line up references you'll
          actually want to trace next.
        </p>

        {error && (
          <div className="paywall-error" role="alert">
            <strong>Heads up — </strong>{error}
          </div>
        )}

        <section className="exit-survey-block" aria-labelledby="survey-age-q">
          <h2 id="survey-age-q" className="exit-survey-q">
            <span className="exit-survey-q-num">1</span>
            How old are you?
          </h2>
          <div className="exit-survey-chips" role="radiogroup" aria-label="How old are you">
            {AGES.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={age === a.id}
                className={`exit-survey-chip${age === a.id ? ' is-active' : ''}`}
                onClick={() => setAge(a.id)}
                disabled={busy}
              >
                <span className="exit-survey-chip-label">{a.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="exit-survey-block" aria-labelledby="survey-draws-q">
          <h2 id="survey-draws-q" className="exit-survey-q">
            <span className="exit-survey-q-num">2</span>
            What kind of stuff do you like to draw?
            <span className="exit-survey-optional"> (pick any)</span>
          </h2>
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
        </section>

        <div className="exit-survey-actions">
          <button
            type="button"
            className="exit-survey-submit"
            onClick={submit}
            disabled={busy || !ready}
          >
            {busy
              ? 'Saving…'
              : !ready
                ? 'Pick your age + what you draw →'
                : 'Done — back to tracing →'}
          </button>
        </div>

        <p className="exit-survey-foot">
          Asked once. Your answer goes straight to a solo founder and shapes
          what we build next — thank you 🌱
        </p>
      </main>
    </div>
  );
}
