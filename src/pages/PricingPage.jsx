import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { supabase } from '../lib/supabase.js';
import { hasPendingImage } from '../lib/pendingImage.js';
import { VISIBLE_PLANS } from '../lib/plans.js';
import { usePresence } from '../hooks/usePresence.js';
import { usePlanCheckout } from '../hooks/usePlanCheckout.js';

/**
 * Dedicated pricing page (/pricing) — what users see after signing in.
 * Cleaner, more confident layout vs. the landing-section pricing.
 * Open to paid users too so they can compare plans / upgrade.
 */
export default function PricingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();
  usePresence('pricing');
  const { busy, error, lifetimeLeft, choose, dismissError } = usePlanCheckout();

  // Make hasPendingImage() reactive — re-read on mount and whenever the
  // window regains focus or storage events fire. Without this, the
  // "Your image is saved and waiting" line goes stale if the image is
  // cleared by another tab during the page's lifetime.
  const [pendingImage, setPendingImage] = useState(() => hasPendingImage());
  useEffect(() => {
    const recheck = () => setPendingImage(hasPendingImage());
    window.addEventListener('focus', recheck);
    window.addEventListener('storage', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('storage', recheck);
    };
  }, []);

  // Stamp first /pricing view for journey funnel. Server-side idempotent
  // (only writes if first_pricing_at is null). Fire-and-forget; the gate
  // on user means we never stamp anonymous visits.
  useEffect(() => {
    if (!user?.id) return;
    supabase.rpc('mark_journey_event', { p_event: 'pricing' }).then(() => {}, () => {});
  }, [user?.id]);

  // Auto-consume any pre-login checkout intent stamped by a plan-CTA click on
  // the landing page. Login.jsx routes signed-in users with intent here, so
  // /pricing must close the loop — otherwise the user has to click their
  // chosen plan a second time and the intent sits in sessionStorage until a
  // future Paywall render fires it. Read once on first signed-in render.
  useEffect(() => {
    if (!user?.id) return;
    let intent;
    try { intent = sessionStorage.getItem('tm:intent-plan'); } catch {}
    if (!intent) return;
    try { sessionStorage.removeItem('tm:intent-plan'); } catch {}
    choose(intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Dodo bounces the user back here with ?checkout=cancelled on cancel/failure.
  // Keep the param reactive (read directly) so the modal can be dismissed by
  // clearing it from the URL — that way a hard refresh re-shows the modal,
  // and clicking "Try again" silently removes the param without a reload.
  const checkoutOutcome = searchParams.get('checkout');
  const dismissOutcome = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    setSearchParams(next, { replace: true });
  };

  const greeting = profile?.display_name?.split(' ')[0] || user?.email?.split('@')[0] || 'friend';

  return (
    <>
      <SvgDefs />

      {/* Top bar */}
      <header className="pp-topbar">
        <Link to="/" className="pp-brand">
          <img src="/images/brand/logo.webp" alt="Trace Mate" />
        </Link>
        <Link to={user ? '/account' : '/'} className="pp-back-link">
          ← {user ? 'Back to account' : 'Back to home'}
        </Link>
      </header>

      <main className="pp-shell">
        {/* Header copy */}
        <div className="pp-header">
          <span className="pp-eyebrow">
            <span aria-hidden="true">✦</span>
            {user ? `One more step, ${greeting}` : 'Pick your plan'}
          </span>
          <h1 className="pp-title">
            Step into the <em>studio.</em>
          </h1>
          <p className="pp-lead">
            Trace anything you can see — onto real paper. Pick the plan that fits.
            {pendingImage && <> <strong>Your image is saved</strong> and waiting.</>}
          </p>
        </div>

        {error && (
          <div className="paywall-error pp-error" role="alert">
            <strong>Heads up — </strong>{error}
            <button type="button" className="paywall-link" onClick={dismissError} style={{ marginLeft: 8 }}>Dismiss</button>
          </div>
        )}

        {/* Plan cards */}
        <div className="pp-plans">
          {VISIBLE_PLANS.map((p) => {
            const soldOut = p.gold && lifetimeLeft === 0;
            const lifetimeLabel =
              p.gold && lifetimeLeft != null && lifetimeLeft > 0
                ? `${lifetimeLeft} of 10 spots left`
                : null;

            return (
              <article
                key={p.id}
                className={`pp-card ${p.gold ? 'pp-card-gold' : ''} ${p.id === 'monthly' ? 'pp-card-popular' : ''}`}
              >
                {p.id === 'monthly' && !p.gold && (
                  <div className="pp-card-ribbon">Most popular</div>
                )}
                {lifetimeLabel && (
                  <div className="pp-card-ribbon pp-card-ribbon-gold">
                    <span className="pulse-dot" aria-hidden="true"></span>
                    {lifetimeLabel}
                  </div>
                )}

                <div className="pp-card-head">
                  <h2 className="pp-card-name">{p.name}</h2>
                  <div className="pp-card-price">
                    <span className="pp-card-strike">${p.wasPrice}</span>
                    <div className="pp-card-num">
                      <span className="pp-card-currency">$</span>{p.price}
                    </div>
                    <span className="pp-card-period">{p.period}</span>
                  </div>
                  <span className="pp-card-badge">{p.badge}</span>
                </div>

                <ul className="pp-card-features">
                  {p.features.map((f) => (
                    <li key={f}>
                      <span className="pp-check" aria-hidden="true">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                             strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M 2 6 L 5 9 L 10 3" />
                        </svg>
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="pp-card-cta"
                  onClick={() => choose(p.id)}
                  disabled={busy === p.id || soldOut}
                >
                  {soldOut ? 'Sold out' : busy === p.id ? 'Opening checkout…' : `${p.cta} →`}
                </button>
              </article>
            );
          })}
        </div>

        <p className="pp-foot">
          <span className="reassure-bullet">✦</span> 14-day refund
          &nbsp;·&nbsp; secure payments by Dodo
        </p>
      </main>

      {checkoutOutcome === 'cancelled' && (
        <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="co-cancel-title">
          <div className="profile-modal-backdrop" onClick={dismissOutcome} />
          <div className="profile-modal-card co-modal co-modal-warn">
            <button
              type="button"
              className="profile-modal-close"
              onClick={dismissOutcome}
              aria-label="Close"
            >×</button>
            <div className="co-burst co-burst-warn" aria-hidden="true">
              <span className="co-burst-mark">!</span>
            </div>
            <h2 id="co-cancel-title" className="co-title">Payment didn't go through</h2>
            <p className="co-sub">
              No charge was made. You can pick a plan again whenever you're ready.
            </p>
            <button type="button" className="co-cta" onClick={dismissOutcome} autoFocus>
              Try again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
