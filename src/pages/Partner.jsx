import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../lib/errors.js';

// Affiliate self-view — tracemate.art/partner?t=<access_token>.
//
// A partner opens their private link (the operator hands them this from the
// admin Referrals tab) and sees only their own numbers. No account needed: the
// token IS the credential. Backed by the public, token-gated referral-stats
// Edge Function, which returns a curated subset (no buyer PII, no other
// partners' data, never the raw token of anyone else).

function money(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      maximumFractionDigits: n % 100 === 0 ? 0 : 2,
    }).format(n / 100);
  } catch { return `$${(n / 100).toFixed(2)}`; }
}

function terms(r) {
  if (r.commission_flat_cents != null) return `${money(r.commission_flat_cents)} per sale`;
  return `${(Number(r.commission_rate_bps) || 0) / 100}% of each sale`;
}

export default function Partner() {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const token = (() => {
    try { return new URLSearchParams(location.search).get('t') || ''; }
    catch { return ''; }
  })();

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState({ loading: false, error: 'Missing your partner link token.', data: null });
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('referral-stats', {
          method: 'POST',
          body: { token },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!cancelled) setState({ loading: false, error: null, data: data.referrer });
      } catch (e) {
        if (!cancelled) {
          setState({ loading: false, error: friendlyError(e, 'Could not load your stats. Check your link.'), data: null });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const { loading, error, data } = state;

  return (
    <main className="partner-page">
      <div className="partner-card">
        <h1 className="partner-title">Your referral dashboard</h1>

        {loading && <p className="partner-muted">Loading…</p>}
        {error && <p className="partner-error">{error}</p>}

        {data && (
          <>
            <p className="partner-sub">
              Link <code>tracemate.art/i/{data.code}</code>
              {data.name ? ` · ${data.name}` : ''}
              {!data.active && ' · (currently paused)'}
            </p>
            <p className="partner-terms">You earn {terms(data)}.</p>

            <div className="partner-grid">
              <div className="partner-tile partner-tile-hero">
                <span className="partner-tile-value">{money(data.commission_pending_cents)}</span>
                <span className="partner-tile-label">owed to you</span>
              </div>
              <div className="partner-tile">
                <span className="partner-tile-value">{money(data.commission_paid_cents)}</span>
                <span className="partner-tile-label">paid out</span>
              </div>
              <div className="partner-tile">
                <span className="partner-tile-value">{data.signups ?? 0}</span>
                <span className="partner-tile-label">signups</span>
              </div>
              <div className="partner-tile">
                <span className="partner-tile-value">{data.sales ?? 0}</span>
                <span className="partner-tile-label">sales</span>
              </div>
              <div className="partner-tile">
                <span className="partner-tile-value">{data.paying_now ?? 0}</span>
                <span className="partner-tile-label">paying now</span>
              </div>
            </div>

            <p className="partner-foot">
              Numbers update as your referrals sign up and pay. Share your link
              anywhere — social, blog, DMs. Thanks for spreading Trace Mate. 💛
            </p>
          </>
        )}
      </div>
    </main>
  );
}
