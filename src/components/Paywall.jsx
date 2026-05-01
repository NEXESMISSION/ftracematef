import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { startCheckout, markPreCheckout } from '../lib/checkout.js';
import { supabase } from '../lib/supabase.js';
import { PLANS as ALL_PLANS } from '../lib/plans.js';
import { friendlyError } from '../lib/errors.js';

// Compact plan tiles for the paywall — derived from the central catalog.
const PLANS = ALL_PLANS.map((p) => ({
  id: p.id,
  name: p.name,
  price: `$${p.price}`,
  period: p.shortPeriod,
  badge: p.id === 'lifetime' ? 'Limited 10' : p.badge,
  gold: !!p.gold,
}));

/** Shown by <RequirePaid> when a logged-in user hasn't subscribed yet. */
export default function Paywall({ trialUsed = false }) {
  const { profile, user, subscription } = useAuth();
  const [busy, setBusy]                 = useState(null);
  const [error, setError]               = useState(null);
  const [lifetimeLeft, setLifetimeLeft] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('lifetime_seats_left').then(({ data, error }) => {
      if (!cancelled && !error && typeof data === 'number') setLifetimeLeft(data);
    });
    return () => { cancelled = true; };
  }, []);

  const onChoose = async (plan) => {
    setError(null);
    setBusy(plan);
    try {
      const url = await startCheckout(plan);
      markPreCheckout(subscription);
      window.location.href = url;
    } catch (e) {
      setBusy(null);
      setError(friendlyError(e, 'Could not start checkout.'));
    }
  };

  // If the user came from the landing's pricing CTA, auto-start checkout
  // for that plan (so they don't have to click twice).
  useEffect(() => {
    let intent;
    try { intent = sessionStorage.getItem('tm:intent-plan'); } catch {}
    if (!intent) return;
    sessionStorage.removeItem('tm:intent-plan');
    onChoose(intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = profile?.display_name || user?.email?.split('@')[0] || 'friend';

  return (
    <div className="studio-shell">
      <header className="studio-bar">
        <Link to="/" className="studio-brand"><img src="/images/brand/logo.webp" alt="Trace Mate" /></Link>
      </header>

      <main className="studio-paywall">
        <p className="kicker hand">
          {trialUsed ? `that's a wrap, ${greeting} ✦` : `welcome, ${greeting} ✦`}
        </p>
        <h1>
          {trialUsed
            ? 'Your free tracing is used up — pick a plan to keep going.'
            : 'Pick a plan to step into the studio.'}
        </h1>
        <p className="lead">
          {trialUsed
            ? 'You already used your one free studio session. Any plan unlocks unlimited tracing — full quality, every tool, every device.'
            : 'All plans unlock full quality outlines, every tool, every device.'}
        </p>

        {error && (
          <div className="paywall-error" role="alert">
            <strong>Heads up — </strong>{error}
            <button type="button" className="paywall-link" onClick={() => setError(null)} style={{ marginLeft: 8 }}>Dismiss</button>
          </div>
        )}

        <div className="paywall-plans">
          {PLANS.map((p) => {
            const soldOut = p.gold && lifetimeLeft === 0;
            const lifetimeBadge = p.gold && lifetimeLeft != null && lifetimeLeft > 0
              ? `${lifetimeLeft} left of 10`
              : null;

            return (
              <button
                key={p.id}
                type="button"
                className={`paywall-plan${p.gold ? ' paywall-plan-gold' : ''}`}
                disabled={busy === p.id || soldOut}
                onClick={() => onChoose(p.id)}
              >
                <span className="paywall-plan-badge">{p.badge}</span>
                <span className="paywall-plan-name">{p.name}</span>
                <span className="paywall-plan-price">
                  {p.price}<small>{p.period}</small>
                </span>
                {lifetimeBadge && <span className="paywall-plan-spots">{lifetimeBadge}</span>}
                <span className="paywall-plan-cta">
                  {soldOut ? 'Sold out' : busy === p.id ? 'Opening…' : 'Choose →'}
                </span>
              </button>
            );
          })}
        </div>

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
