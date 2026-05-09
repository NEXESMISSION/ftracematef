import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../lib/errors.js';

// Closed lists for the two structured questions. Keeping these client-side
// AND server-side (mirrored in record_exit_survey) means a malicious client
// can't smuggle a custom value into the admin's bucket counts.
const SOURCES = [
  { id: 'tiktok',    label: 'TikTok'        },
  { id: 'instagram', label: 'Instagram'     },
  { id: 'youtube',   label: 'YouTube'       },
  { id: 'reddit',    label: 'Reddit'        },
  { id: 'twitter',   label: 'X / Twitter'   },
  { id: 'facebook',  label: 'Facebook'      },
  { id: 'pinterest', label: 'Pinterest'     },
  { id: 'threads',   label: 'Threads'       },
  { id: 'google',    label: 'Search engine' },
  { id: 'friend',    label: 'A friend'      },
  { id: 'other',     label: 'Somewhere else'},
];

const FEELINGS = [
  { id: 'loved',    emoji: '🤩', label: 'Loved it',     hint: 'felt magical'        },
  { id: 'liked',    emoji: '🙂', label: 'Liked it',     hint: 'pretty good'         },
  { id: 'mixed',    emoji: '😐', label: 'Mixed',        hint: 'some rough edges'    },
  { id: 'disliked', emoji: '😕', label: "Didn't love",  hint: 'something felt off'  },
];

/**
 * One-shot exit survey. Rendered by RequirePaid once the user's free trial
 * is consumed AND profiles.exit_survey_at is still null. After a successful
 * submit (or "skip") the parent re-renders to show <Paywall trialUsed />.
 *
 * Required gate: there is no Skip button. Both questions must be answered
 * to proceed to the paywall. If the user closes the tab or refreshes
 * without answering, exit_survey_at stays null on the server and the
 * survey re-renders on every subsequent /trace visit until they actually
 * submit. The data point is more valuable than the goodwill of letting
 * them dismiss it — and "skip" answers were noise in the admin rollup
 * anyway (always source=other / feeling=mixed, indistinguishable from a
 * real "Somewhere else / Mixed" pick).
 */
export default function ExitSurvey({ onDone }) {
  const { profile, user, refresh } = useAuth();

  const [source, setSource]   = useState('');
  const [feeling, setFeeling] = useState('');
  const [note, setNote]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);

  // The survey IS the paywall block — stamp first_paywall_at on mount so a
  // user who closes the tab without submitting still counts toward the
  // admin funnel (and the survey response-rate denominator). Idempotent
  // server-side, fire-and-forget; failures don't change UX.
  useEffect(() => {
    supabase.rpc('mark_journey_event', { p_event: 'paywall' }).then(() => {}, () => {});
  }, []);

  const greeting = profile?.display_name || user?.email?.split('@')[0] || 'friend';

  const submit = async () => {
    if (busy) return;
    setError(null);

    // Both questions are required — Send button is disabled until then,
    // but a determined user could mash Enter, so guard explicitly.
    if (!source || !feeling) {
      setError('Pick one option from each list — it takes a second.');
      return;
    }

    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('record_exit_survey', {
        p_source:  source,
        p_feeling: feeling,
        p_note:    note.trim() || null,
      });
      if (rpcError) throw rpcError;
      // Refresh profile so RequirePaid sees the new exit_survey_at stamp
      // and stops rendering this overlay. Failures are non-fatal — we still
      // call onDone so the user isn't trapped behind a transient blip.
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
        <p className="kicker hand">two quick taps, {greeting} ✦</p>
        <h1>Before you keep going — how was it?</h1>
        <p className="lead">
          You finished your free trace. Pick one option from each list and we'll
          unlock the plans — that's it, two taps.
        </p>

        {error && (
          <div className="paywall-error" role="alert">
            <strong>Heads up — </strong>{error}
          </div>
        )}

        <section className="exit-survey-block" aria-labelledby="survey-source-q">
          <h2 id="survey-source-q" className="exit-survey-q">
            <span className="exit-survey-q-num">1</span>
            How did you hear about Trace Mate?
          </h2>
          <div className="exit-survey-chips" role="radiogroup" aria-label="How did you hear about us">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={source === s.id}
                className={`exit-survey-chip${source === s.id ? ' is-active' : ''}`}
                onClick={() => setSource(s.id)}
                disabled={busy}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section className="exit-survey-block" aria-labelledby="survey-feeling-q">
          <h2 id="survey-feeling-q" className="exit-survey-q">
            <span className="exit-survey-q-num">2</span>
            How did your first trace feel?
          </h2>
          <div className="exit-survey-feelings" role="radiogroup" aria-label="How did it feel">
            {FEELINGS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={feeling === f.id}
                className={`exit-survey-feeling${feeling === f.id ? ' is-active' : ''}`}
                onClick={() => setFeeling(f.id)}
                disabled={busy}
              >
                <span className="exit-survey-feeling-emoji" aria-hidden="true">{f.emoji}</span>
                <span className="exit-survey-feeling-label">{f.label}</span>
                <span className="exit-survey-feeling-hint">{f.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="exit-survey-block exit-survey-note-block">
          <label className="exit-survey-note-label" htmlFor="exit-survey-note">
            One thing we should know? <span className="exit-survey-optional">(optional)</span>
          </label>
          <textarea
            id="exit-survey-note"
            className="exit-survey-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 280))}
            placeholder="Loved the AR overlay, wish I could…"
            rows={2}
            maxLength={280}
            disabled={busy}
          />
          <span className="exit-survey-note-count" aria-live="polite">
            {note.length}/280
          </span>
        </section>

        <div className="exit-survey-actions">
          <button
            type="button"
            className="exit-survey-submit"
            onClick={submit}
            disabled={busy || !source || !feeling}
          >
            {busy
              ? 'Saving…'
              : (!source || !feeling)
                ? 'Pick one from each list →'
                : 'Send & unlock plans →'}
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
