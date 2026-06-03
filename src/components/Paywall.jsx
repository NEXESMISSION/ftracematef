import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { supabase } from '../lib/supabase.js';
import { VISIBLE_PLANS, PLAN_BY_ID } from '../lib/plans.js';
import { usePlanCheckout } from '../hooks/usePlanCheckout.js';
import { FREE_SESSION_LIMIT } from '../lib/freeTrial.js';

// Paywall-specific copy decorations on top of the central plan catalog.
// `equiv` is the small grey line under the price — anchors the value
// (e.g. "less than a coffee") so the user has a comparison they can feel
// instead of a number floating on its own.
const PAYWALL_COPY = {
  monthly:   { equiv: 'less than a coffee a month',  cta: 'Start Monthly'  },
  quarterly: { equiv: '≈ $3.33 / month',             cta: 'Get 3 Months',  popular: true },
  lifetime:  { equiv: 'pay once · use forever',      cta: 'Claim Lifetime' },
};

const PAYWALL_PLANS = VISIBLE_PLANS.map((p) => ({
  ...p,
  // Hide the static "Limited 10" badge on the gold card — the dynamic
  // "Only N of 10 left" pill below already carries that message and is
  // both more specific and harder to skim past.
  badge:   p.id === 'lifetime' ? null : p.badge,
  equiv:   PAYWALL_COPY[p.id]?.equiv ?? null,
  ctaText: PAYWALL_COPY[p.id]?.cta   ?? 'Choose plan',
  popular: !!PAYWALL_COPY[p.id]?.popular,
}));

// Tiny inline check icon used in the per-plan feature list. Inline SVG so
// we don't ship an icon library for one glyph; currentColor lets the gold
// card override it without a second declaration.
function FeatureCheck() {
  return (
    <svg
      className="paywall-feature-check"
      width="14" height="14" viewBox="0 0 14 14"
      fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 7.5 L5.5 11 L12 4" />
    </svg>
  );
}

/** Shown by <RequirePaid> when a logged-in user hasn't subscribed yet. */
export default function Paywall({ trialUsed = false }) {
  const { profile, user } = useAuth();
  // RequirePaid guarantees a signed-in user before we render — no need for
  // the unauth → /login redirect path.
  const { busy, error, lifetimeLeft, choose, dismissError } = usePlanCheckout({
    redirectUnauthedToLogin: false,
  });

  useEffect(() => {
    // Stamp the user's first paywall view. Idempotent on the server side
    // (writes only when first_paywall_at is still null) so re-renders are
    // free. Fire-and-forget — failures don't change UX.
    supabase.rpc('mark_journey_event', { p_event: 'paywall' }).then(() => {}, () => {});
  }, []);

  // If the user came from the landing's pricing CTA, auto-start checkout
  // for that plan (so they don't have to click twice).
  useEffect(() => {
    let intent;
    try { intent = sessionStorage.getItem('tm:intent-plan'); } catch {}
    if (!intent) return;
    try { sessionStorage.removeItem('tm:intent-plan'); } catch {}
    choose(intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = profile?.display_name || user?.email?.split('@')[0] || 'friend';
  const monthlyPrice = PLAN_BY_ID.monthly?.price ?? 7;

  return (
    <div className="studio-shell">
      <header className="studio-bar">
        <Link to="/" className="studio-brand"><img src="/images/brand/logo.webp" alt="Trace Mate" /></Link>
      </header>

      <main className="studio-paywall">
        {/* Celebratory flourish — a soft aura + floating sparkles so the
            unlock reads like a reward rather than a wall. */}
        <div className="paywall-aura" aria-hidden="true" />
        <span className="paywall-spark paywall-spark-1" aria-hidden="true">✦</span>
        <span className="paywall-spark paywall-spark-2" aria-hidden="true">✧</span>
        <span className="paywall-spark paywall-spark-3" aria-hidden="true">✦</span>

        <p className="kicker hand">
          {trialUsed ? `nice work, ${greeting} ✦` : `welcome, ${greeting} ✦`}
        </p>
        <h1>
          {trialUsed ? (
            <>You've made {FREE_SESSION_LIMIT} <em>awesome</em> pieces</>
          ) : (
            <>One unlock. <em>Every tool.</em> Every device.</>
          )}
        </h1>
        <p className="lead">
          {trialUsed
            ? `Keep that momentum going — unlock unlimited high-res tracing for $${monthlyPrice}/month. Every paper, every lighting setup, every character, no limits.`
            : 'Trace anything you can photograph — sketches, tattoos, murals, lettering. Pick the plan that fits and start in seconds.'}
        </p>

        {/* Trust strip used to live here as small pills (Secure / Cancel /
            Instant) but it duplicated the bottom promise strip line-for-
            line. Removed in favor of a single reassurance block under
            the cards — same words shouldn't appear twice on one page. */}

        {error && (
          <div className="paywall-error" role="alert">
            <strong>Heads up — </strong>{error}
            <button type="button" className="paywall-link" onClick={dismissError} style={{ marginLeft: 8 }}>Dismiss</button>
          </div>
        )}

        <div className="paywall-plans">
          {PAYWALL_PLANS.map((p, i) => {
            const soldOut = p.gold && lifetimeLeft === 0;
            const lifetimeBadge = p.gold && lifetimeLeft != null && lifetimeLeft > 0
              ? `Only ${lifetimeLeft} of 10 left`
              : null;

            return (
              <button
                key={p.id}
                type="button"
                className={`paywall-plan${p.gold ? ' paywall-plan-gold' : ''}${p.popular ? ' paywall-plan-popular' : ''}`}
                disabled={busy === p.id || soldOut}
                onClick={() => choose(p.id)}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                {p.popular && (
                  <span className="paywall-plan-ribbon" aria-hidden="true">Most Popular</span>
                )}
                {p.gold && (
                  <span className="paywall-plan-ribbon paywall-plan-ribbon-gold" aria-hidden="true">Best Value</span>
                )}

                {p.badge && (
                  <span className="paywall-plan-badge">{p.badge}</span>
                )}
                <span className="paywall-plan-name">{p.name}</span>

                {/* Anchor pricing — strike-through on the original so the
                    discount is felt, not just stated in the badge. */}
                <span className="paywall-plan-price-row">
                  {p.wasPrice && (
                    <span className="paywall-plan-was" aria-label="Original price">
                      ${p.wasPrice}
                    </span>
                  )}
                  <span className="paywall-plan-price">
                    ${p.price}<small>{p.shortPeriod}</small>
                  </span>
                </span>
                {p.equiv && (
                  <span className="paywall-plan-equiv">{p.equiv}</span>
                )}

                {/* Feature checklist — sourced from PLANS so the landing
                    pricing block and the paywall stay in sync. Visible
                    value beats a vague "unlocks everything" line. */}
                {Array.isArray(p.features) && p.features.length > 0 && (
                  <ul className="paywall-plan-features" aria-label={`What's in ${p.name}`}>
                    {p.features.map((f) => (
                      <li key={f}>
                        <FeatureCheck />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {lifetimeBadge && (
                  <span className="paywall-plan-spots" aria-live="polite">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 1 L3 9 H8 L7 15 L13 7 H8 Z" />
                    </svg>
                    {lifetimeBadge}
                  </span>
                )}

                <span className="paywall-plan-cta">
                  {soldOut ? 'Sold out' : busy === p.id ? 'Opening…' : `${p.ctaText} →`}
                </span>
              </button>
            );
          })}
        </div>

        {/* Promise strip — last objection handlers right under the cards
            so they're the final thing the user reads before clicking. */}
        <ul className="paywall-promise" aria-label="Our promises">
          <li>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 1.5 L2 4 V8 a6 6 0 0 0 6 6.5 a6 6 0 0 0 6 -6.5 V4 Z" />
            </svg>
            <span><strong>Secure</strong> · Dodo-powered checkout</span>
          </li>
          <li>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8 L7 12 L13 4" />
            </svg>
            <span><strong>14-day refund</strong> · no lock-in</span>
          </li>
          <li>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 1 L3 9 H8 L7 15 L13 7 H8 Z" />
            </svg>
            <span><strong>Instant access</strong> · the moment you pay</span>
          </li>
        </ul>

        <p className="paywall-foot">
          Already paid?{' '}
          <button type="button" className="paywall-link" onClick={() => window.location.reload()}>
            Refresh
          </button>{' '}
          ·{' '}
          <Link to="/account" className="paywall-link">Account</Link>
        </p>
      </main>
    </div>
  );
}
