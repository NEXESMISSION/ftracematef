import { useState } from 'react';
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
// (which packs / references to surface). Whitelisted server-side.
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

// Gender — single select. Whitelisted server-side (girl/boy/other).
const GENDERS = [
  { id: 'girl',  label: 'Girl'  },
  { id: 'boy',   label: 'Boy'   },
  { id: 'other', label: 'Other' },
];

const NOTE_MAX = 280;

/**
 * Survey body. Rendered as a modal on /trace from the user's second visit
 * onward (see Trace.jsx). Both questions are required; the note is optional.
 * Idempotent server-side, so it only ever records once.
 */
export default function ExitSurvey({ onDone, onSkip }) {
  const { profile, refresh } = useAuth();

  const [age, setAge]       = useState('');
  const [gender, setGender] = useState('');
  const [draws, setDraws]   = useState([]);
  const [note, setNote]     = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone]   = useState(false);

  const toggleDraw = (id) => {
    setDraws((cur) =>
      cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id],
    );
  };

  const ready = !!age && !!gender && draws.length > 0;

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!ready) {
      setError('Pick your age, who you are, and at least one thing you draw.');
      return;
    }
    setBusy(true);
    try {
      const trimmed = note.trim();
      const { error: rpcError } = await supabase.rpc('record_survey', {
        p_age:    age,
        p_draws:  draws,
        p_note:   trimmed ? trimmed : null,
        p_gender: gender,
      });
      if (rpcError) {
        // Backend may not have the 3-arg signature yet (the survey_note
        // migration hasn't been applied). Retry without the note so the
        // user's main answers still record — the note is the only piece
        // we lose. Migration: 20260529000003_survey_note.sql.
        const msg = String(rpcError.message || '').toLowerCase();
        const looksLikeSignatureMismatch =
          msg.includes('p_note')
          || msg.includes('function') && (msg.includes('does not exist') || msg.includes('not found') || msg.includes('no function matches'))
          || msg.includes('argument');
        if (!looksLikeSignatureMismatch) throw rpcError;
        const retry = await supabase.rpc('record_survey', { p_age: age, p_draws: draws, p_note: trimmed ? trimmed : null });
        if (retry.error) throw retry.error;
      }
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
      <p className="exit-survey-card-kicker">✦ two quick taps</p>
      <h2 id="survey-q" className="exit-survey-card-title">
        Help shape what we build next.
      </h2>
      <p className="exit-survey-card-lead">
        Both answers help us line up references and tools you'll actually use.
      </p>

      {error && (
        <div className="paywall-error" role="alert" style={{ margin: '0 0 14px' }}>
          <strong>Heads up — </strong>{error}
        </div>
      )}

      <section className="exit-survey-block" aria-labelledby="survey-age-q">
        <h3 id="survey-age-q" className="exit-survey-q">
          <span className="exit-survey-q-num">1</span>
          How old are you?
        </h3>
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

      <section className="exit-survey-block" aria-labelledby="survey-gender-q">
        <h3 id="survey-gender-q" className="exit-survey-q">
          <span className="exit-survey-q-num">2</span>
          Are you a…
        </h3>
        <div className="exit-survey-chips" role="radiogroup" aria-label="Are you a girl or boy">
          {GENDERS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={gender === g.id}
              className={`exit-survey-chip${gender === g.id ? ' is-active' : ''}`}
              onClick={() => setGender(g.id)}
              disabled={busy}
            >
              <span className="exit-survey-chip-label">{g.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="exit-survey-block" aria-labelledby="survey-draws-q">
        <h3 id="survey-draws-q" className="exit-survey-q">
          <span className="exit-survey-q-num">3</span>
          What do you like to draw?
          <span className="exit-survey-optional"> (pick any)</span>
        </h3>
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

      <section className="exit-survey-block exit-survey-note-block" aria-labelledby="survey-note-q">
        <h3 id="survey-note-q" className="exit-survey-q">
          <span className="exit-survey-q-num">4</span>
          A note or a request?
          <span className="exit-survey-optional"> (optional)</span>
        </h3>
        <textarea
          className="exit-survey-note"
          placeholder="Anything we should know — a feature you wish existed, a kind of reference you can't find, a bug, a wish…"
          maxLength={NOTE_MAX}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          aria-describedby="survey-note-count"
        />
        <p id="survey-note-count" className="exit-survey-note-count">
          {note.length}/{NOTE_MAX}
        </p>
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
              ? 'Answer the quick questions →'
              : 'Save & back to tracing →'}
        </button>
        {onSkip && (
          <button
            type="button"
            className="exit-survey-skip"
            onClick={onSkip}
            disabled={busy}
          >
            Maybe later
          </button>
        )}
      </div>
    </section>
  );
}
