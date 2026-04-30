import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listAllUsers } from '../lib/admin.js';
import { friendlyError } from '../lib/errors.js';
import { PLAN_LABEL } from '../lib/plans.js';

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

/* ─────────────────────────────────────────────────────────────────────── */

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [users, setUsers]   = useState(null);
  const [error, setError]   = useState(null);
  const [filter, setFilter] = useState('all');   // 'all' | 'paid' | 'unpaid'
  const [query, setQuery]   = useState('');
  const [tick, setTick]     = useState(0);       // re-render every 30s for "online" decay

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
    // tick keeps online count fresh as time passes
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
              const online = isOnline(u.last_seen_at);
              const tone   = STATUS_TONE[u.status] ?? 'neutral';
              const planLabel = u.plan ? (PLAN_LABEL[u.plan] ?? u.plan) : 'No plan';
              return (
                <li key={u.id} className="admin-row">
                  <div className="admin-row-id">
                    <span
                      className={`admin-presence ${online ? 'is-online' : 'is-offline'}`}
                      title={online ? 'Online now' : `Last seen ${formatRelative(u.last_seen_at)}`}
                      aria-label={online ? 'Online now' : `Last seen ${formatRelative(u.last_seen_at)}`}
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
                      <dd>{online ? 'In the app now' : formatRelative(u.last_seen_at)}</dd>
                    </div>
                    <div>
                      <dt>Joined</dt>
                      <dd>{formatDate(u.created_at)}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
