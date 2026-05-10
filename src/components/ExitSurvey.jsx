import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../lib/errors.js';

// Inline single-path SVG icons. All inherit `currentColor` so they
// recolor correctly against both the default chip (dark glyph on cream)
// and the active chip (white glyph on coral). 16x16 viewBox keeps them
// crisp at the chip's effective ~14px render size.
//
// NOTE: brand glyphs are simplified — we deliberately don't ship pixel-
// perfect official marks (their licensing varies, and a clean monochrome
// silhouette is easier to recognize at chip size anyway).
const I = {
  ai: (
    // 4-point sparkle — universal AI / "magic" cue, stays brand-neutral
    // across ChatGPT / Gemini / Claude / Copilot / Perplexity / Grok.
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M9.2 1.6c.1-.3.5-.3.6 0l.7 1.9c0 .1.1.2.2.2l1.9.7c.3.1.3.5 0 .6l-1.9.7c-.1 0-.2.1-.2.2l-.7 1.9c-.1.3-.5.3-.6 0l-.7-1.9c0-.1-.1-.2-.2-.2L6.4 5c-.3-.1-.3-.5 0-.6l1.9-.7c.1 0 .2-.1.2-.2zM4.6 8.4c.1-.3.5-.3.6 0l.5 1.4c0 .1.1.2.2.2l1.4.5c.3.1.3.5 0 .6l-1.4.5c-.1 0-.2.1-.2.2l-.5 1.4c-.1.3-.5.3-.6 0l-.5-1.4c0-.1-.1-.2-.2-.2l-1.4-.5c-.3-.1-.3-.5 0-.6l1.4-.5c.1 0 .2-.1.2-.2z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M9.5 1h2c.1 1.4 1 2.4 2.4 2.5v2c-.9 0-1.7-.2-2.4-.6v4.5c0 2.5-2 4.6-4.5 4.6S2.5 11.9 2.5 9.4 4.5 4.8 7 4.8c.2 0 .3 0 .5.1v2.2c-.2-.1-.3-.1-.5-.1-1.4 0-2.5 1.1-2.5 2.5S5.6 12 7 12s2.5-1.1 2.5-2.5z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="3.5" />
      <circle cx="8" cy="8" r="2.6" />
      <circle cx="11.6" cy="4.4" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M14.7 4.4c-.2-.7-.7-1.2-1.4-1.4C12 2.7 8 2.7 8 2.7s-4 0-5.3.3c-.7.2-1.2.7-1.4 1.4C1 5.7 1 8 1 8s0 2.3.3 3.6c.2.7.7 1.2 1.4 1.4 1.3.3 5.3.3 5.3.3s4 0 5.3-.3c.7-.2 1.2-.7 1.4-1.4.3-1.3.3-3.6.3-3.6s0-2.3-.3-3.6zM6.6 10.3V5.7L10.5 8z" />
    </svg>
  ),
  reddit: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M14.5 8c0-.7-.6-1.3-1.3-1.3-.3 0-.6.1-.9.3-.9-.6-2.1-1-3.3-1l.5-2.4 1.7.4c0 .5.4.9.9.9s1-.4 1-1-.4-1-1-1c-.4 0-.7.2-.9.6L9.4 3c-.1 0-.1 0-.2.1l-.6 2.9c-1.3 0-2.5.4-3.4 1-.2-.2-.5-.3-.9-.3-.7 0-1.3.6-1.3 1.3 0 .5.3 1 .8 1.2-.1.1-.1.3-.1.4 0 1.6 1.9 2.9 4.3 2.9s4.3-1.3 4.3-2.9c0-.1 0-.3-.1-.4.5-.2.8-.7.8-1.2zM5 9c0-.5.4-.9.9-.9s.9.4.9.9-.4.9-.9.9-.9-.4-.9-.9zm5.4 2.6c-.7.4-1.5.6-2.4.6s-1.7-.2-2.4-.6c-.2-.1-.2-.4 0-.5s.4-.1.5 0c.5.3 1.1.5 1.9.5s1.4-.2 1.9-.5c.2-.1.4-.1.5 0 .2.2.2.4 0 .5zm-.2-1.7c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M11.7 2h2.1l-4.6 5.3L14.6 14h-4.2L7 9.7 3.2 14H1.1l4.9-5.6L1.2 2h4.3L8.5 6zm-.7 10.7h1.1L4.8 3.2H3.6z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M9.4 14.9V8.6h2.1l.3-2.4H9.4V4.6c0-.7.2-1.2 1.2-1.2h1.3V1.2C11.6 1.2 10.8 1 9.9 1c-1.8 0-3.1 1.1-3.1 3.1v2.1H4.7v2.4h2.1v6.3z" />
    </svg>
  ),
  pinterest: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8 1C4.1 1 1 4.1 1 8c0 2.9 1.8 5.4 4.3 6.5-.1-.5-.1-1.4 0-2 .1-.5.7-3 .7-3s-.2-.4-.2-.9c0-.9.5-1.5 1.2-1.5.5 0 .8.4.8.9 0 .5-.4 1.4-.6 2.1-.2.6.3 1.2 1 1.2 1.2 0 2.1-1.2 2.1-3 0-1.6-1.1-2.7-2.8-2.7-1.9 0-3 1.4-3 2.9 0 .6.2 1.2.5 1.5 0 .1.1.1 0 .2 0 .2-.1.6-.2.7 0 .1-.1.1-.2.1-.7-.3-1.1-1.4-1.1-2.3 0-1.9 1.4-3.6 4-3.6 2.1 0 3.7 1.5 3.7 3.5 0 2.1-1.3 3.7-3.1 3.7-.6 0-1.2-.3-1.4-.7l-.4 1.4c-.1.5-.5 1.2-.8 1.7.6.2 1.2.3 1.9.3 3.9 0 7-3.1 7-7s-3.1-7-7-7z" />
    </svg>
  ),
  threads: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M11 7.6c-.1 0-.2 0-.3-.1 0-1-.3-1.7-.8-2.2-.5-.5-1.2-.8-2.1-.8-1.1 0-2 .4-2.5 1.2-.3.4-.5.9-.6 1.5l1.3.4c.2-.6.4-1 .7-1.2.3-.3.7-.4 1.1-.4.5 0 .9.1 1.2.4.3.3.4.7.5 1.2-.4-.1-.9-.1-1.4-.1-1.4 0-2.5.4-3.2 1.2-.4.5-.6 1.1-.6 1.7 0 .8.3 1.4.8 1.9.5.4 1.2.6 2 .6.9 0 1.6-.3 2.2-1 .3-.4.5-.8.7-1.4.6.2 1.1.5 1.4.8.5.5.8 1.1.8 1.8 0 1.1-.5 2.1-1.4 2.7-.9.6-2.1.9-3.6.9-1.7 0-3-.5-3.9-1.6-.9-1-1.4-2.5-1.4-4.4s.5-3.4 1.4-4.4c.9-1 2.2-1.6 3.9-1.6 1.5 0 2.7.4 3.6 1.1.7.6 1.2 1.4 1.4 2.4l1.3-.3c-.3-1.4-1-2.5-1.9-3.3-1.1-.9-2.5-1.4-4.3-1.4-2.1 0-3.7.6-4.9 1.9C2.6 4.4 2 6 2 8s.6 3.6 1.7 4.9c1.2 1.3 2.8 1.9 4.9 1.9 1.8 0 3.3-.4 4.4-1.2 1.4-1 2-2.4 2-3.9 0-1.1-.4-2-1.1-2.7-.7-.7-1.6-1.1-2.6-1.4zm-2.7 4.7c-.6.7-1.2 1-2 1-.5 0-.9-.1-1.2-.4-.3-.2-.4-.5-.4-.9 0-.4.2-.7.5-1 .4-.3 1-.5 1.9-.5.4 0 .9 0 1.4.1-.1.6-.4 1.1-.7 1.5z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M3.3 5.6h2v6.7h-2zM4.3 2.5C3.6 2.5 3.1 3 3.1 3.7s.5 1.2 1.2 1.2c.7 0 1.2-.5 1.2-1.2s-.5-1.2-1.2-1.2zM6.5 5.6h1.9v.9c.3-.5.9-1.1 1.9-1.1 2 0 2.4 1.3 2.4 3v3.9h-2V8.7c0-.7 0-1.6-1-1.6s-1.2.8-1.2 1.6v3.6H6.5z" />
    </svg>
  ),
  discord: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M13 3.4c-1-.5-2-.8-3.1-.9 0 0 0 0-.1.1l-.2.4c-1.1-.2-2.2-.2-3.3 0L6.1 2.5l-.1-.1C5 2.6 4 2.9 3 3.4 1.1 6.2.6 8.9.8 11.6c0 0 0 .1.1.1 1.2.9 2.4 1.4 3.5 1.7 0 0 .1 0 .1-.1l.8-1.1c0 0 0-.1 0-.1-.4-.1-.7-.3-1.1-.5 0 0 0-.1 0-.1l.2-.2 0 0c2.1.9 4.4.9 6.5 0l0 0 .2.2s0 .1 0 .1c-.3.2-.7.4-1.1.5 0 0 0 .1 0 .1l.8 1.1s.1 0 .1.1c1.1-.3 2.3-.8 3.5-1.7 0 0 .1-.1.1-.1.3-3.1-.5-5.8-2-8.2zM5.7 10c-.7 0-1.3-.6-1.3-1.4S5 7.3 5.7 7.3 7 7.9 7 8.6 6.4 10 5.7 10zm4.6 0c-.7 0-1.3-.6-1.3-1.4s.6-1.4 1.3-1.4 1.3.6 1.3 1.4S11 10 10.3 10z" />
    </svg>
  ),
  google: (
    // Magnifying glass — generic "search engine" cue, not Google-branded.
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2 13.5 13.5" />
    </svg>
  ),
  blog: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 2.5h7l3 3v8a.5.5 0 0 1-.5.5h-9.5a.5.5 0 0 1-.5-.5v-10.5a.5.5 0 0 1 .5-.5z" />
      <path d="M9.7 2.5v3.3h3.3M5 8h6M5 10.4h6M5 12.7h4" />
    </svg>
  ),
  podcast: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2" width="4" height="7.5" rx="2" fill="currentColor" stroke="none" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" />
    </svg>
  ),
  app_store: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="1.7" />
      <path d="M8 5.2v5M5.7 7.7 8 10.2 10.3 7.7" />
      <path d="M5.5 12.4h5" />
    </svg>
  ),
  friend: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5.6" r="2.1" />
      <path d="M2.4 13.4c0-2 1.6-3.4 3.6-3.4s3.6 1.4 3.6 3.4" />
      <circle cx="11" cy="6" r="1.7" />
      <path d="M9.6 9.7c.4-.1.9-.2 1.4-.2 1.7 0 3 1.1 3 2.9" />
    </svg>
  ),
  other: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.3" />
      <circle cx="8"   cy="8" r="1.3" />
      <circle cx="12.5" cy="8" r="1.3" />
    </svg>
  ),
};

// Closed list for "where did you hear?". Mirrored server-side in
// record_exit_survey so a malicious client can't smuggle a custom
// value into the admin's bucket counts. Order is intentional:
// AI assistant first (fastest-growing acquisition channel for
// indie tools), then majors-by-likely-volume, then long tail.
const SOURCES = [
  { id: 'ai',        label: 'AI assistant',  icon: I.ai        },  // ChatGPT / Gemini / Claude / Copilot / Perplexity / Grok
  { id: 'tiktok',    label: 'TikTok',        icon: I.tiktok    },
  { id: 'instagram', label: 'Instagram',     icon: I.instagram },
  { id: 'youtube',   label: 'YouTube',       icon: I.youtube   },
  { id: 'reddit',    label: 'Reddit',        icon: I.reddit    },
  { id: 'twitter',   label: 'X / Twitter',   icon: I.twitter   },
  { id: 'facebook',  label: 'Facebook',      icon: I.facebook  },
  { id: 'pinterest', label: 'Pinterest',     icon: I.pinterest },
  { id: 'threads',   label: 'Threads',       icon: I.threads   },
  { id: 'linkedin',  label: 'LinkedIn',      icon: I.linkedin  },
  { id: 'discord',   label: 'Discord',       icon: I.discord   },
  { id: 'google',    label: 'Search engine', icon: I.google    },
  { id: 'blog',      label: 'Blog / article',icon: I.blog      },
  { id: 'podcast',   label: 'Podcast',       icon: I.podcast   },
  { id: 'app_store', label: 'App store',     icon: I.app_store },
  { id: 'friend',    label: 'A friend',      icon: I.friend    },
  { id: 'other',     label: 'Somewhere else',icon: I.other     },
];

// Generic feeling labels — work for both first-timers (rating their first
// impression of the site) AND returning users (rating their actual trace
// experience). The DB still stores loved/liked/mixed/disliked.
const FEELINGS = [
  { id: 'loved',    emoji: '🤩', label: 'Loving it',  hint: 'this is great'        },
  { id: 'liked',    emoji: '🙂', label: 'Liking it',  hint: 'pretty good so far'   },
  { id: 'mixed',    emoji: '😐', label: 'Mixed',      hint: 'jury is out'          },
  { id: 'disliked', emoji: '😕', label: 'Not for me', hint: 'not what I hoped'     },
];

/**
 * Universal pre-trace survey. Rendered by RequirePaid as a hard gate on
 * /trace whenever profiles.exit_survey_at is null — for paid users,
 * first-time free users, and returning trial-used free users alike.
 * After a successful submit the parent re-renders straight to whatever
 * the user was actually heading for: the Trace studio (paid + first
 * free trial), or the Paywall (trial used).
 *
 * Required gate: there is no Skip button. Both questions must be
 * answered. If the user closes the tab or refreshes without answering,
 * exit_survey_at stays null on the server and the survey re-renders on
 * every subsequent /trace visit until they actually submit. The data
 * point is more valuable than the friction it adds, and the gate only
 * fires once per account (idempotent server-side).
 */
export default function ExitSurvey({ onDone }) {
  const { profile, user, refresh } = useAuth();

  const [source, setSource]   = useState('');
  const [feeling, setFeeling] = useState('');
  const [note, setNote]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);

  // Note: we deliberately do NOT mark first_paywall_at here. The survey
  // is now a universal gate, not a paywall — first-time free users hit
  // it BEFORE the paywall would ever fire. The actual <Paywall /> still
  // stamps the column on its own mount, which is the correct funnel
  // signal (only fires when the user has truly exhausted the trial).

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
        <p className="kicker hand">quick check, {greeting} ✦</p>
        <h1>Two taps before you trace.</h1>
        <p className="lead">
          Tell us where you found Trace Mate and how it feels so far. Two
          clicks and you're in the studio.
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
                <span className="exit-survey-chip-icon" aria-hidden="true">{s.icon}</span>
                <span className="exit-survey-chip-label">{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="exit-survey-block" aria-labelledby="survey-feeling-q">
          <h2 id="survey-feeling-q" className="exit-survey-q">
            <span className="exit-survey-q-num">2</span>
            How does Trace Mate feel so far?
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
                : 'Send & enter the studio →'}
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
