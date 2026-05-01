import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listAllUsers, getUserActivity } from '../lib/admin.js';
import { friendlyError } from '../lib/errors.js';
import { PLAN_LABEL } from '../lib/plans.js';
import { ANALYTICS_PROVIDER, ANALYTICS_EMBED_URL } from '../lib/analytics.js';

// Anyone seen pinging the heartbeat within this window is treated as "in the
// app right now". Tab visibility throttles the heartbeat to 60s, so 2 minutes
// gives one missed-tick of slack before the dot drops.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

const STATUS_TONE = {
  active:    'good',
  on_hold:   'warn',
  cancelled: 'neutral',
  expired:   'neutral',
  failed:    'bad',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(iso) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'never';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) {
    const m = Math.round(diff / 60_000);
    return `${m} min${m === 1 ? '' : 's'} ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.round(diff / 3_600_000);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(diff / 86_400_000);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.round(months / 12);
  return `${years} yr${years === 1 ? '' : 's'} ago`;
}

function formatMoney(cents, currency = 'USD') {
  if (cents == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
}

// Heartbeat is the live "in the app right now" signal. last_sign_in_at is
// Supabase's stamp on every successful auth — the right fallback for users
// who haven't pinged the heartbeat (e.g. pre-dated the column).
function lastSeenLabel(u, online) {
  if (online) return 'In the app now';
  if (u.last_seen_at)     return formatRelative(u.last_seen_at);
  if (u.last_sign_in_at)  return `Signed in ${formatRelative(u.last_sign_in_at)}`;
  return 'never';
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Per-user activity log (drill-down) */

function Timeline({ activity }) {
  // Merge events from three sources into a single chronological feed —
  // operator scans top-to-bottom, no need to remember which silo holds what.
  const items = useMemo(() => {
    if (!activity) return [];
    const merged = [];
    for (const s of activity.sub_history ?? []) {
      merged.push({
        kind:   'sub',
        at:     s.created_at ?? s.updated_at,
        title:  `Subscription · ${s.plan ?? '—'} · ${s.status ?? '—'}`,
        detail: [
          s.amount_cents != null ? formatMoney(s.amount_cents, s.currency) : null,
          s.current_period_end ? `expires ${formatDate(s.current_period_end)}` : null,
          s.cancel_at_next_billing_date ? 'pending cancel' : null,
          s.dodo_subscription_id ? `sub ${s.dodo_subscription_id.slice(-10)}` : null,
        ].filter(Boolean).join(' · '),
      });
      if (s.cancelled_at) {
        merged.push({
          kind:   'sub',
          at:     s.cancelled_at,
          title:  `Cancelled · ${s.plan ?? '—'}`,
          detail: s.dodo_subscription_id ? `sub ${s.dodo_subscription_id.slice(-10)}` : '',
        });
      }
    }
    for (const e of activity.events ?? []) {
      merged.push({
        kind:   e.processed === false ? 'event-bad' : 'event',
        at:     e.created_at,
        title:  `Webhook · ${e.event_type}`,
        detail: [
          e.amount != null ? formatMoney(e.amount, e.currency) : null,
          e.status,
          e.payment_id ? `pay ${e.payment_id.slice(-10)}` : null,
          e.subscription_id ? `sub ${e.subscription_id.slice(-10)}` : null,
          e.error_message ? `error: ${e.error_message}` : null,
        ].filter(Boolean).join(' · '),
      });
    }
    for (const s of activity.sign_ins ?? []) {
      merged.push({
        kind:   'auth',
        at:     s.created_at,
        title:  `Auth · ${s.action}`,
        detail: s.ip_address ? `ip ${s.ip_address}` : '',
      });
    }
    return merged
      .filter((m) => m.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [activity]);

  if (!activity) return null;
  if (items.length === 0) {
    return <p className="admin-timeline-empty">No activity recorded yet.</p>;
  }

  return (
    <ol className="admin-timeline">
      {items.map((item, i) => (
        <li key={i} className={`admin-timeline-item admin-timeline-${item.kind}`}>
          <span className="admin-timeline-dot" aria-hidden="true" />
          <div className="admin-timeline-body">
            <div className="admin-timeline-row">
              <span className="admin-timeline-title">{item.title}</span>
              <span className="admin-timeline-when" title={formatDateTime(item.at)}>
                {formatRelative(item.at)}
              </span>
            </div>
            {item.detail && <div className="admin-timeline-detail">{item.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Traffic panel — embeds the Plausible/Umami shared dashboard */

function TrafficPanel() {
  const providerLabel = ANALYTICS_PROVIDER === 'plausible'
    ? 'Plausible'
    : ANALYTICS_PROVIDER === 'umami'
      ? 'Umami'
      : null;

  // No provider configured at build time → friendly setup prompt instead of
  // a broken iframe. Operator just needs to set the env vars and rebuild.
  if (!ANALYTICS_EMBED_URL) {
    return (
      <section className="admin-traffic admin-traffic-empty">
        <header className="admin-traffic-head">
          <h2>Traffic</h2>
          <span className="admin-traffic-status">not configured</span>
        </header>
        <p className="admin-traffic-help">
          Set <code>VITE_PLAUSIBLE_DOMAIN</code> + <code>VITE_PLAUSIBLE_EMBED_URL</code>{' '}
          (or the <code>VITE_UMAMI_*</code> equivalents) in <code>.env.local</code>{' '}
          and rebuild to see your visitor dashboard here.
        </p>
      </section>
    );
  }

  return (
    <section className="admin-traffic">
      <header className="admin-traffic-head">
        <h2>Traffic</h2>
        {providerLabel && (
          <a
            className="admin-traffic-status"
            href={ANALYTICS_EMBED_URL.split('?')[0]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {providerLabel} ↗
          </a>
        )}
      </header>
      <iframe
        title="Visitor analytics"
        src={ANALYTICS_EMBED_URL}
        loading="lazy"
        scrolling="no"
        className="admin-traffic-frame"
      />
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function ActivityPanel({ userId }) {
  const [activity, setActivity] = useState(null);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    setActivity(null); setError(null);
    getUserActivity(userId)
      .then((d) => { if (!cancelled) setActivity(d); })
      .catch((e) => { if (!cancelled) setError(friendlyError(e, 'Could not load activity.')); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="admin-activity">
      {!activity && !error && (
        <div className="admin-activity-loading">
          <span className="admin-spinner" aria-hidden="true" />
          <span>Loading activity…</span>
        </div>
      )}
      {error && <p className="admin-error">{error}</p>}
      {activity && <Timeline activity={activity} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [users, setUsers]       = useState(null);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState('all');   // 'all' | 'paid' | 'unpaid'
  const [query, setQuery]       = useState('');
  const [tick, setTick]         = useState(0);       // re-render every 30s for "online" decay
  const [expanded, setExpanded] = useState(null);    // currently-expanded user_id

  // Load + refresh every 30s while the page is open. Same cadence as the
  // tick used to fade the online dot — one timer drives both.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const items = await listAllUsers();
        if (!cancelled) {
          setUsers(items);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, 'Could not load users.'));
      }
    };
    load();
    const id = setInterval(() => {
      load();
      setTick((t) => t + 1);
    }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const counts = useMemo(() => {
    if (!users) return { all: 0, paid: 0, unpaid: 0, online: 0 };
    let paid = 0, online = 0;
    for (const u of users) {
      if (u.is_paid) paid++;
      if (isOnline(u.last_seen_at)) online++;
    }
    void tick;
    return { all: users.length, paid, unpaid: users.length - paid, online };
  }, [users, tick]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'paid'   && !u.is_paid) return false;
      if (filter === 'unpaid' &&  u.is_paid) return false;
      if (q && !(u.email ?? '').toLowerCase().includes(q)
            && !(u.display_name ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [users, filter, query]);

  const toggleExpand = useCallback((id) => {
    setExpanded((cur) => (cur === id ? null : id));
  }, []);

  return (
    <div className="admin-shell">
      <header className="admin-bar">
        <div className="admin-bar-id">
          <span className="admin-bar-tag">ADMIN</span>
          <h1 className="admin-bar-title">Operator dashboard</h1>
        </div>
        <div className="admin-bar-right">
          <span className="admin-bar-me">{user?.email}</span>
          <Link to="/account" className="admin-link">Account</Link>
          <button type="button" className="admin-link admin-link-danger" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-summary">
          <div className="admin-summary-card">
            <span className="admin-summary-label">Total users</span>
            <span className="admin-summary-value">{counts.all}</span>
          </div>
          <div className="admin-summary-card admin-summary-card-paid">
            <span className="admin-summary-label">Paid</span>
            <span className="admin-summary-value">{counts.paid}</span>
          </div>
          <div className="admin-summary-card">
            <span className="admin-summary-label">Unpaid</span>
            <span className="admin-summary-value">{counts.unpaid}</span>
          </div>
          <div className="admin-summary-card admin-summary-card-online">
            <span className="admin-summary-dot" aria-hidden="true" />
            <span className="admin-summary-label">Online now</span>
            <span className="admin-summary-value">{counts.online}</span>
          </div>
        </section>

        <TrafficPanel />

        <section className="admin-controls">
          <div className="admin-tabs" role="tablist" aria-label="Filter users">
            {[
              { id: 'all',    label: 'All' },
              { id: 'paid',   label: 'Paid' },
              { id: 'unpaid', label: 'Unpaid' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filter === t.id}
                className={`admin-tab ${filter === t.id ? 'is-active' : ''}`}
                onClick={() => setFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="admin-search"
            placeholder="Search email or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </section>

        {error && <p className="admin-error">{error}</p>}

        {users === null && !error && (
          <div className="admin-loading">
            <span className="admin-spinner" aria-hidden="true" />
            <p>Loading users…</p>
          </div>
        )}

        {users && filtered.length === 0 && (
          <p className="admin-empty">No users match this filter.</p>
        )}

        {users && filtered.length > 0 && (
          <ul className="admin-list">
            {filtered.map((u) => {
              const online    = isOnline(u.last_seen_at);
              const tone      = STATUS_TONE[u.status] ?? 'neutral';
              const planLabel = u.plan ? (PLAN_LABEL[u.plan] ?? u.plan) : 'No plan';
              const isOpen    = expanded === u.id;
              return (
                <li key={u.id} className={`admin-row ${isOpen ? 'is-open' : ''}`}>
                  <div className="admin-row-main">
                    <div className="admin-row-id">
                      <span
                        className={`admin-presence ${online ? 'is-online' : 'is-offline'}`}
                        title={online ? 'Online now' : `Last seen ${lastSeenLabel(u, online)}`}
                        aria-label={online ? 'Online now' : `Last seen ${lastSeenLabel(u, online)}`}
                      />
                      <div className="admin-row-who">
                        <span className="admin-row-email">
                          {u.email ?? '—'}
                          {u.is_admin && <span className="admin-row-badge">admin</span>}
                        </span>
                        {u.display_name && (
                          <span className="admin-row-name">{u.display_name}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-row-plan">
                      <span className={`admin-pill ${u.is_paid ? 'admin-pill-paid' : 'admin-pill-free'}`}>
                        {planLabel}
                      </span>
                      {u.status && (
                        <span className={`admin-pill admin-pill-${tone}`}>
                          {u.cancel_at_period_end ? 'Pending cancel' : u.status}
                        </span>
                      )}
                    </div>

                    <dl className="admin-row-meta">
                      <div>
                        <dt>Paid</dt>
                        <dd>
                          {u.paid_at ? formatDate(u.paid_at) : '—'}
                          {u.amount_cents != null && (
                            <span className="admin-row-amount">
                              {formatMoney(u.amount_cents, u.currency)}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>
                          {u.plan === 'lifetime'
                            ? 'Never'
                            : u.current_period_end
                              ? formatDate(u.current_period_end)
                              : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Last seen</dt>
                        <dd>{lastSeenLabel(u, online)}</dd>
                      </div>
                      <div>
                        <dt>Joined</dt>
                        <dd>{formatDate(u.created_at)}</dd>
                      </div>
                    </dl>

                    <button
                      type="button"
                      className="admin-row-toggle"
                      onClick={() => toggleExpand(u.id)}
                      aria-expanded={isOpen}
                      aria-controls={`admin-activity-${u.id}`}
                    >
                      {isOpen ? 'Hide activity' : 'View activity'}
                    </button>
                  </div>

                  {isOpen && (
                    <div id={`admin-activity-${u.id}`} className="admin-row-activity">
                      <ActivityPanel userId={u.id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
