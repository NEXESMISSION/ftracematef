import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { supabase } from '../lib/supabase.js';
import { startCheckout, markPreCheckout } from '../lib/checkout.js';
import { hasPendingImage } from '../lib/pendingImage.js';
import { friendlyError } from '../lib/errors.js';
import { PLANS } from '../lib/plans.js';

/**
 * Dedicated pricing page (/pricing) — what users see after signing in.
 * Cleaner, more confident layout vs. the landing-section pricing.
 *
 * If the user already has an active paid plan, sends them to /upload (or
 * /trace if there's a pending image they were about to trace).
 */
export default function PricingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isPaid, profile, subscription } = useAuth();
  const [busy, setBusy]                 = useState(null);
  const [error, setError]               = useState(null);
  const [lifetimeLeft, setLifetimeLeft] = useState(null);

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

  // Live spots counter
  useEffect(() => {
    let cancelled = false;
    supabase.rpc('lifetime_seats_left').then(({ data, error }) => {
      if (!cancelled && !error && typeof data === 'number') setLifetimeLeft(data);
    });
    return () => { cancelled = true; };
  }, []);

  // Already paid? Skip past the page.
  useEffect(() => {
    if (isPaid) {
      navigate(hasPendingImage() ? '/trace' : '/upload', { replace: true });
    }
  }, [isPaid, navigate]);

  const onChoose = async (planId) => {
    setError(null);
    if (!user) { navigate('/login', { state: { intent: { plan: planId } } }); return; }
    try {
      setBusy(planId);
      // Snapshot BEFORE the await — see Paywall.jsx for the why.
      markPreCheckout(subscription);
      const url = await startCheckout(planId);
      window.location.href = url;
    } catch (e) {
      setBusy(null);
      setError(friendlyError(e, 'Could not start checkout.'));
    }
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
        {user && (
          <Link to="/account" className="pp-back-link">
            ← Back to account
          </Link>
        )}
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
            {hasPendingImage() && <> <strong>Your image is saved</strong> and waiting.</>}
          </p>
        </div>

        {error && (
          <div className="paywall-error pp-error" role="alert">
            <strong>Heads up — </strong>{error}
            <button type="button" className="paywall-link" onClick={() => setError(null)} style={{ marginLeft: 8 }}>Dismiss</button>
          </div>
        )}

        {/* Plan cards */}
        <div className="pp-plans">
          {PLANS.map((p) => {
            const soldOut = p.gold && lifetimeLeft === 0;
            const lifetimeLabel =
              p.gold && lifetimeLeft != null && lifetimeLeft > 0
                ? `${lifetimeLeft} of 10 spots left`
                : null;

            return (
              <article
                key={p.id}
                className={`pp-card ${p.gold ? 'pp-card-gold' : ''} ${p.id === 'quarterly' ? 'pp-card-popular' : ''}`}
              >
                {p.id === 'quarterly' && !p.gold && (
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
                  onClick={() => onChoose(p.id)}
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
          &nbsp;·&nbsp; cancel anytime on monthly &amp; 3-month
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
