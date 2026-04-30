import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { startCheckout } from '../lib/checkout.js';
import {
  subscriptionAction,
  listPayments,
  openBillingPortal,
} from '../lib/billing.js';
import { PLANS, PLAN_LABEL } from '../lib/plans.js';
import { friendlyError } from '../lib/errors.js';
import { getStats, formatDuration, formatRelative } from '../lib/traceStats.js';
import { isAdminUser } from '../lib/admin.js';
import { canUseFreeTrial } from '../lib/freeTrial.js';
import Alert from '../components/Alert.jsx';

// DevPanel is admin-only and ships about ~3 KB of presets + dev UI. Lazy-load
// it so the panel and its preset payload aren't in every visitor's bundle —
// only admins (and only on the Account page) ever fetch the chunk.
const DevPanel = lazy(() => import('../components/DevPanel.jsx'));

const STATUS_TONE = {
  active:    { label: 'Active',     tone: 'good'    },
  on_hold:   { label: 'On hold',    tone: 'warn'    },
  cancelled: { label: 'Cancelled',  tone: 'neutral' },
  expired:   { label: 'Expired',    tone: 'neutral' },
  failed:    { label: 'Failed',     tone: 'bad'     },
};

function formatMoney(cents, currency = 'USD') {
  if (cents == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/* ─────────────────────────── Subscription card ─────────────────────────── */

function SubscriptionCard({ subscription, refresh, onChangePlan, email, setAlert }) {
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'cancel-end' | null

  const plan      = subscription?.plan ?? 'free';
  const status    = subscription?.status ?? 'active';
  const willCancel = !!subscription?.cancel_at_next_billing_date;
  const tone   = willCancel
    ? { label: 'Pending cancel', tone: 'warn' }
    : (STATUS_TONE[status] ?? STATUS_TONE.active);
  const isFree = plan === 'free';
  const isLifetime = plan === 'lifetime';

  const run = async (action) => {
    setBusy(action);
    try {
      await subscriptionAction(action);
      await refresh();
      setConfirm(null);
    } catch (e) {
      // Show errors as a centered Alert modal (same pattern as the portal
      // call) instead of inline red text. The previous inline path looked
      // broken next to a confirm dialog and could leak technical strings
      // like "Subscription not linked to a Dodo subscription_id yet".
      setConfirm(null);
      setAlert({
        title: "Couldn't update subscription",
        message: friendlyError(e, 'Something went wrong.'),
      });
    } finally {
      setBusy(null);
    }
  };

  // Wrap the portal call so a thrown "No Dodo customer linked yet" (or any
  // other backend error) becomes a friendly modal instead of an uncaught
  // promise rejection in the console.
  const handleOpenPortal = async () => {
    try {
      await openBillingPortal();
    } catch (e) {
      setAlert({
        title: "Billing portal isn't ready yet",
        message: friendlyError(e, 'Could not open the billing portal.'),
      });
    }
  };

  return (
    <section className="profile-card">
      <header className="profile-card-head">
        <div className="profile-plan-id">
          <span className="profile-plan-kicker hand">your plan</span>
          <span className="profile-plan-name hand">{PLAN_LABEL[plan] ?? '—'}</span>
        </div>
        <span className={`profile-pill profile-pill-${tone.tone}`}>{tone.label}</span>
      </header>

      <div className="profile-rows">
        {subscription?.current_period_end && !isLifetime && (
          <div className="profile-row">
            <span className="profile-key">
              {willCancel || status === 'cancelled' ? 'Access ends' : 'Renews'}
            </span>
            <span className="profile-val">{formatDate(subscription.current_period_end)}</span>
          </div>
        )}

        {isLifetime && (
          <div className="profile-row">
            <span className="profile-key">Access</span>
            <span className="profile-val">Forever ✦</span>
          </div>
        )}

        {subscription?.amount_cents != null && (
          <div className="profile-row">
            <span className="profile-key">Last charge</span>
            <span className="profile-val">
              {formatMoney(subscription.amount_cents, subscription.currency)}
            </span>
          </div>
        )}

        {email && (
          <div className="profile-row">
            <span className="profile-key">Signed in as</span>
            <span className="profile-val profile-val-mono">{email}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {isFree ? null : isLifetime ? (
        <div className="profile-actions">
          <button type="button" className="profile-btn" onClick={handleOpenPortal}>
            View invoice
          </button>
        </div>
      ) : (
        <>
          {confirm === 'cancel-end' ? (
            <div className="profile-confirm">
              <p>You'll keep access until <strong>{formatDate(subscription.current_period_end)}</strong>, then it stops billing. Sure?</p>
              <div className="profile-confirm-actions">
                <button type="button" className="profile-btn-ghost" onClick={() => setConfirm(null)} disabled={!!busy}>Keep it</button>
                <button type="button" className="profile-btn profile-btn-danger" onClick={() => run('cancel-at-period-end')} disabled={!!busy}>
                  {busy === 'cancel-at-period-end' ? 'Cancelling…' : 'Yes, cancel at period end'}
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-actions">
              <button type="button" className="profile-btn" onClick={onChangePlan} disabled={!!busy}>
                Change plan
              </button>
              <button type="button" className="profile-btn" onClick={handleOpenPortal}>
                Manage billing
              </button>
              {willCancel ? (
                <button
                  type="button"
                  className="profile-btn profile-btn-primary"
                  onClick={() => run('undo-cancel')}
                  disabled={!!busy}
                >
                  {busy === 'undo-cancel' ? 'Restoring…' : 'Resume subscription'}
                </button>
              ) : (
                <button
                  type="button"
                  className="profile-btn-cancel-end"
                  onClick={() => setConfirm('cancel-end')}
                  aria-label="Cancel subscription at period end"
                >
                  <span className="profile-btn-cancel-end-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
                      <path d="M2.5 6.5 H13.5" />
                      <path d="M5.5 2 V5" />
                      <path d="M10.5 2 V5" />
                      <path d="M6 10 L10 10" />
                    </svg>
                  </span>
                  <span>Cancel at period end</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

    </section>
  );
}

/* ─────────────────────────── Change-plan modal ─────────────────────────── */

const SWAP_PLANS = PLANS
  .filter((p) => p.id !== 'lifetime')
  .map((p) => ({ id: p.id, name: p.name, price: `$${p.price}`, period: p.shortPeriod }));

const LIFETIME = PLANS.find((p) => p.id === 'lifetime');
const UPGRADE_LIFETIME = {
  id: 'lifetime',
  name: LIFETIME.name,
  price: `$${LIFETIME.price}`,
  period: 'forever',
};

function ChangePlanModal({ currentPlan, onClose, refresh, onError }) {
  const [busy, setBusy] = useState(null);

  const swapPlans = SWAP_PLANS.filter((p) => p.id !== currentPlan);

  // On failure we close this modal and surface the error via the parent's
  // shared Alert. Stacking an inline error inside an already-modal change-plan
  // dialog feels broken; one centered Alert is cleaner.
  const fail = (e, fallback, title) => {
    setBusy(null);
    onClose();
    onError?.({ title, message: friendlyError(e, fallback) });
  };

  const swap = async (targetPlan) => {
    setBusy(targetPlan);
    try {
      await subscriptionAction('change-plan', { plan: targetPlan });
      await refresh();
      onClose();
    } catch (e) {
      fail(e, 'Could not change plan.', "Couldn't change plan");
    }
  };

  const upgradeToLifetime = async () => {
    setBusy('lifetime');
    try {
      const url = await startCheckout('lifetime');
      window.location.href = url;
    } catch (e) {
      fail(e, 'Could not open checkout.', "Couldn't open checkout");
    }
  };

  return (
    <div className="profile-modal" role="dialog" aria-label="Change plan">
      <div className="profile-modal-backdrop" onClick={onClose} />
      <div className="profile-modal-card">
        <button type="button" className="profile-modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2>Switch plan</h2>
        <p className="profile-modal-sub">Changes apply immediately, with prorated billing.</p>

        <div className="profile-plan-grid">
          {swapPlans.map((p) => (
            <button
              key={p.id}
              type="button"
              className="profile-plan-pick"
              onClick={() => swap(p.id)}
              disabled={!!busy}
            >
              <span className="profile-plan-pick-info">
                <span className="profile-plan-pick-name">{p.name}</span>
                <span className="profile-plan-pick-price">
                  <strong>{p.price}</strong>
                  <span className="profile-plan-pick-period">{p.period}</span>
                </span>
              </span>
              <span className="profile-plan-pick-cta">
                {busy === p.id ? 'Switching…' : 'Switch'}
              </span>
            </button>
          ))}

          <button
            type="button"
            className="profile-plan-pick profile-plan-pick-gold"
            onClick={upgradeToLifetime}
            disabled={!!busy}
          >
            <span className="profile-plan-pick-badge">Best value</span>
            <span className="profile-plan-pick-info">
              <span className="profile-plan-pick-name">{UPGRADE_LIFETIME.name}</span>
              <span className="profile-plan-pick-price">
                <strong>{UPGRADE_LIFETIME.price}</strong>
                <span className="profile-plan-pick-period">{UPGRADE_LIFETIME.period}</span>
              </span>
            </span>
            <span className="profile-plan-pick-cta">
              {busy === 'lifetime' ? 'Opening…' : 'Upgrade'}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6 H9 M6.5 3 L9 6 L6.5 9" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Receipts (collapsible) ─────────────────────── */

function ReceiptsCard() {
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState(null);
  const [error, setError]   = useState(null);

  useEffect(() => {
    if (!open || items !== null) return;
    let cancelled = false;
    listPayments()
      .then((arr) => { if (!cancelled) setItems(arr); })
      .catch((e)  => { if (!cancelled) setError(friendlyError(e, 'Could not load payments.')); });
    return () => { cancelled = true; };
  }, [open, items]);

  const count = items?.length;
  const summary = count == null
    ? 'View payment history'
    : count === 0
      ? 'No payments yet'
      : `${count} ${count === 1 ? 'receipt' : 'receipts'}`;

  return (
    <section className={`profile-card profile-receipts ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="profile-receipts-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="profile-receipts-label">
          <span className="profile-receipts-icon" aria-hidden="true">✿</span>
          <span>
            <span className="profile-receipts-title">Receipts</span>
            <span className="profile-receipts-sum">{summary}</span>
          </span>
        </span>
        <span className="profile-receipts-chev" aria-hidden="true">{open ? '–' : '+'}</span>
      </button>

      {open && (
        <div className="profile-receipts-body">
          {items === null && !error && (
            <div className="profile-inline-loading">
              <span className="profile-spinner profile-spinner-sm" aria-hidden="true" />
              <span>Loading…</span>
            </div>
          )}
          {error && <p className="profile-error">{error}</p>}
          {items?.length === 0 && <p className="profile-empty">No payments yet.</p>}

          {items && items.length > 0 && (
            <ul className="profile-payments">
              {items.map((p) => (
                <li key={p.id} className="profile-payment-row">
                  <div className="profile-payment-main">
                    <span className="profile-payment-amount">
                      {formatMoney(p.total, p.currency)}
                    </span>
                    <span className={`profile-pill profile-pill-${p.status === 'succeeded' ? 'good' : 'neutral'}`}>
                      {p.status ?? 'unknown'}
                    </span>
                  </div>
                  <div className="profile-payment-meta">
                    <span>{formatDate(p.created_at)}</span>
                    {p.id && <span className="profile-payment-id">{p.id.slice(-12)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────── Stats grid (polaroids) ─────────────────────── */

function StatsGrid({ stats, memberSince }) {
  const tiles = [
    {
      key: 'time',
      icon: '⏱',
      label: 'Time traced',
      value: formatDuration(stats.totalSeconds),
      hint: stats.totalSeconds ? 'across all sessions' : 'start tracing to begin',
    },
    {
      key: 'sessions',
      icon: '✏',
      label: 'Sessions',
      value: stats.sessions || 0,
      hint: stats.sessions === 1 ? 'first one done' : stats.sessions ? 'tracings completed' : 'none yet',
    },
    {
      key: 'last',
      icon: '✿',
      label: 'Last session',
      value: stats.lastSessionAt ? formatRelative(stats.lastSessionAt) : 'never',
      hint: stats.lastSessionAt ? 'keep the streak going' : 'pick something to trace',
    },
    {
      key: 'member',
      icon: '✦',
      label: 'Member since',
      value: memberSince ? formatDate(memberSince) : '—',
      hint: 'thanks for being here',
    },
  ];

  return (
    <div className="profile-stats">
      {tiles.map((t, i) => (
        <div key={t.key} className={`profile-stat profile-stat-${i % 4}`}>
          <span className="profile-stat-tape" aria-hidden="true" />
          <span className="profile-stat-icon" aria-hidden="true">{t.icon}</span>
          <span className="profile-stat-label hand">{t.label}</span>
          <span className="profile-stat-value">{t.value}</span>
          <span className="profile-stat-hint">{t.hint}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Page ──────────────────────────────────────── */

export default function Account() {
  const { user, profile, subscription, signOut, refresh, isPaid, loading } = useAuth();
  const [showChange, setShowChange] = useState(false);
  const [stats, setStats] = useState(() => getStats(user?.id));
  // Single source of truth for action/portal/change-plan errors. SubscriptionCard
  // and ChangePlanModal both write here; one Alert at page level renders it.
  const [alert, setAlert] = useState(null); // { title, message } | null

  useEffect(() => {
    setStats(getStats(user?.id));
    const refreshStats = () => setStats(getStats(user?.id));
    window.addEventListener('focus', refreshStats);
    window.addEventListener('storage', refreshStats);
    return () => {
      window.removeEventListener('focus', refreshStats);
      window.removeEventListener('storage', refreshStats);
    };
  }, [user?.id]);

  const greeting = profile?.display_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  if (loading || !profile) {
    return (
      <div className="studio-shell">
        <header className="studio-bar">
          <Link to="/welcome" className="studio-brand" aria-label="Trace Mate home">
            <img src="/images/brand/logo.webp" alt="Trace Mate" />
          </Link>
        </header>
        <main className="profile-loading">
          <span className="profile-spinner" aria-hidden="true" />
          <p className="profile-loading-text">Loading your studio…</p>
        </main>
      </div>
    );
  }

  // Free users get one free studio session before the paywall. Compute it
  // once per render — localStorage reads are cheap and the answer can change
  // between renders (e.g. trial just expired in the background).
  const trialAvailable = !isPaid && canUseFreeTrial(profile);
  const canEnterStudio = isPaid || trialAvailable;

  // Friendly contextual sub-line under the greeting.
  let subLine;
  if (!isPaid && !trialAvailable) {
    subLine = "Pick a plan to unlock the studio and start tracing.";
  } else if (!isPaid && trialAvailable) {
    subLine = "First tracing's on us — try the studio, then pick a plan to keep going.";
  } else if (!stats.sessions) {
    subLine = "Your studio's warm. Let's trace your first line.";
  } else if (stats.sessions === 1) {
    subLine = "First tracing in. The next one's even easier.";
  } else {
    subLine = "Pick up where you left off — or start something new.";
  }

  return (
    <div className="studio-shell">
      <header className="studio-bar">
        <Link to="/welcome" className="studio-brand" aria-label="Trace Mate home">
          <img src="/images/brand/logo.webp" alt="Trace Mate" />
        </Link>
        <div className="studio-bar-right">
          <Link to="/welcome" className="studio-link">Home</Link>
        </div>
      </header>

      <main className="profile-page">
        {/* ── Hero: the main action lives here ── */}
        <section className="profile-hero">
          <span className="profile-hero-tape" aria-hidden="true" />
          <span className="profile-hero-spark profile-hero-spark-1" aria-hidden="true">✦</span>
          <span className="profile-hero-spark profile-hero-spark-2" aria-hidden="true">✧</span>
          <span className="profile-hero-spark profile-hero-spark-3" aria-hidden="true">✦</span>

          <span className="profile-eyebrow">
            <span className="dot" aria-hidden="true">✦</span>
            <span className="text">welcome back</span>
            <span className="sep" aria-hidden="true">·</span>
            <span className="tag">{PLAN_LABEL[subscription?.plan ?? 'free']}</span>
          </span>

          <h1 className="profile-headline">
            Hi <em>{greeting}.</em>
          </h1>
          <p className="profile-hero-sub">{subLine}</p>

          <div className="profile-cta-row">
            {canEnterStudio ? (
              <Link to="/upload" className="profile-cta profile-cta-primary">
                + Upload new image
              </Link>
            ) : (
              <Link to="/pricing" className="profile-cta profile-cta-primary">
                Start tracing →
              </Link>
            )}
          </div>
        </section>

        {/* ── Stats: scrapbook polaroids ── */}
        <StatsGrid stats={stats} memberSince={profile?.created_at} />

        {/* ── Live Preview: stream the camera between two devices on this account ── */}
        <section className={`profile-live-card ${isPaid ? '' : 'is-locked'}`} aria-labelledby="live-card-title">
          <span className="profile-live-icon" aria-hidden="true">
            {isPaid ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7 H7 L9 5 H15 L17 7 H21 a1 1 0 0 1 1 1 V18 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V8 a1 1 0 0 1 1 -1 Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11 V7.5 a4 4 0 0 1 8 0 V11" />
              </svg>
            )}
          </span>
          <div className="profile-live-text">
            <h2 id="live-card-title">
              Live Preview
              {!isPaid && <span className="profile-live-badge">Paid</span>}
            </h2>
            <p>
              {isPaid
                ? 'Stream the camera between two devices signed into this account — pick which one broadcasts and which one watches.'
                : 'Stream the camera between two devices signed into this account. Available on any paid plan.'}
            </p>
          </div>
          {isPaid ? (
            <Link to="/live" className="profile-live-cta">Open</Link>
          ) : (
            <Link to="/pricing" className="profile-live-cta profile-live-cta-upgrade">Upgrade</Link>
          )}
        </section>

        {/* ── Subscription (now folds in account email) ── */}
        <SubscriptionCard
          subscription={subscription}
          refresh={refresh}
          onChangePlan={() => setShowChange(true)}
          email={user?.email}
          setAlert={setAlert}
        />

        {/* ── Receipts (collapsible) ── */}
        <ReceiptsCard />

        {/* ── Dev self-test panel (admins only — gated by profile.is_admin) ── */}
        {isAdminUser(profile) && (
          <Suspense fallback={null}>
            <DevPanel />
          </Suspense>
        )}

        {/* ── Sign out ── */}
        <div className="profile-foot">
          <button type="button" className="profile-btn profile-btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </main>

      {showChange && (
        <ChangePlanModal
          currentPlan={subscription?.plan}
          onClose={() => setShowChange(false)}
          refresh={refresh}
          onError={setAlert}
        />
      )}

      <Alert
        open={!!alert}
        onClose={() => setAlert(null)}
        title={alert?.title ?? 'Heads up'}
        message={alert?.message ?? ''}
      />
    </div>
  );
}
