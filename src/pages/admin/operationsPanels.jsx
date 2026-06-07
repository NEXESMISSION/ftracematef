// Operations panels: Announcements + Referrals (and their internal helpers),
// extracted from the AdminDashboard.jsx monolith. No cross-component deps.
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  listReferrers, createReferrer, updateReferrer, markCommissionsPaid,
  listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
} from '../../lib/admin.js';
import { friendlyError } from '../../lib/errors.js';

// cents → "$x.xx" (commissions are stored in cents; we display USD-style).
function fmtCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      maximumFractionDigits: n % 100 === 0 ? 0 : 2,
    }).format(n / 100);
  } catch {
    return `$${(n / 100).toFixed(2)}`;
  }
}

// Human-readable commission terms for a referrer row.
function commissionLabel(r) {
  if (r.commission_flat_cents != null) return `${fmtCents(r.commission_flat_cents)} / sale`;
  return `${(Number(r.commission_rate_bps) || 0) / 100}%`;
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Announce — operator broadcast popups. Author a message, target a segment
   (all / free / paid / inactive 14d+), set a frequency (once / daily /
   always), and signed-in users see it as a dismissible modal on next load.
   Data comes from the admin-announcements Edge Function (get_admin_
   announcement_stats rollup, with per-message seen/tapped/dismissed counts). */

const ANN_SEGMENTS = [
  { value: 'all',      label: 'All users' },
  { value: 'free',     label: 'Free users' },
  { value: 'paid',     label: 'Paid users' },
  { value: 'inactive', label: 'Inactive 14d+' },
];
const ANN_FREQS = [
  { value: 'once',   label: 'Once' },
  { value: 'daily',  label: 'Daily' },
  { value: 'always', label: 'Always' },
];

const ANN_BLANK = {
  title: '', body: '', segment: 'all', cta_label: '', cta_url: '',
  frequency: 'once', expires_at: '',
};

export function AnnouncementsPanel() {
  const [rows, setRows]   = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy]   = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [form, setForm]   = useState(ANN_BLANK);

  const upd = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);

  const load = useCallback(async () => {
    try {
      const data = await listAnnouncements();
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'Could not load announcements.'));
      setRows([]); // never leave rows null on failure — the render does rows.map
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!form.body.trim()) { setError('Body is required.'); return; }
    setBusy(true);
    try {
      await createAnnouncement({
        title:      form.title || undefined,
        body:       form.body,
        segment:    form.segment,
        cta_label:  form.cta_label || undefined,
        cta_url:    form.cta_url || undefined,
        frequency:  form.frequency,
        expires_at: form.expires_at || undefined,
      });
      setForm(ANN_BLANK);
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Could not publish announcement.'));
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  const onToggleActive = useCallback(async (a) => {
    setSavingId(a.id);
    try {
      await updateAnnouncement(a.id, { active: !a.active });
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Could not update announcement.'));
    } finally {
      setSavingId(null);
    }
  }, [load]);

  const onDelete = useCallback(async (a) => {
    if (!window.confirm('Delete this announcement? This cannot be undone.')) return;
    setSavingId(a.id);
    try {
      await deleteAnnouncement(a.id);
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Could not delete announcement.'));
    } finally {
      setSavingId(null);
    }
  }, [load]);

  const segLabel  = (v) => (ANN_SEGMENTS.find((s) => s.value === v)?.label ?? v);
  const freqLabel = (v) => (ANN_FREQS.find((s) => s.value === v)?.label ?? v);
  const fmtExpiry = (ts) => (ts ? new Date(ts).toLocaleString() : 'never');

  return (
    <section className="admin-stats" aria-labelledby="admin-ann-title">
      <header className="admin-stats-head">
        <h2 id="admin-ann-title">Announcements</h2>
        <p className="admin-stats-sub">
          Push a popup to signed-in users. Target a segment, pick how often it
          shows, and watch seen / tapped / dismissed counts below.
        </p>
      </header>

      {error && <p className="admin-ref-error" role="alert">{error}</p>}

      <form className="admin-ref-create admin-ann-create" onSubmit={onCreate}>
        <div className="admin-ref-form-grid">
          <label>Title<input value={form.title} onChange={(e) => upd('title', e.target.value)} placeholder="(optional)" /></label>
          <label>Segment
            <select value={form.segment} onChange={(e) => upd('segment', e.target.value)}>
              {ANN_SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label>Frequency
            <select value={form.frequency} onChange={(e) => upd('frequency', e.target.value)}>
              {ANN_FREQS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label>Expires<input type="datetime-local" value={form.expires_at} onChange={(e) => upd('expires_at', e.target.value)} /></label>
          <label>CTA label<input value={form.cta_label} onChange={(e) => upd('cta_label', e.target.value)} placeholder="(optional)" /></label>
          <label>CTA URL<input value={form.cta_url} onChange={(e) => upd('cta_url', e.target.value)} placeholder="/pricing or https://…" /></label>
        </div>
        <label className="admin-ann-bodyfield">
          Body
          <textarea
            className="admin-ann-textarea"
            rows={3}
            value={form.body}
            onChange={(e) => upd('body', e.target.value)}
          />
        </label>
        <button type="submit" className="admin-ref-btn" disabled={busy}>
          {busy ? 'Publishing…' : '+ Publish announcement'}
        </button>
      </form>

      {rows === null && !error ? (
        <p className="admin-ref-muted">Loading…</p>
      ) : (rows && rows.length === 0) ? (
        <p className="admin-ref-muted">No announcements yet. Publish one above.</p>
      ) : (
        <div className="admin-ann-list">
          {rows.map((a) => (
            <div key={a.id} className={`admin-ann-card ${a.active ? '' : 'admin-ann-card-off'}`}>
              <div className="admin-ann-card-head">
                <span className="admin-ann-card-title">
                  {a.title || '(no title)'}
                  {!a.active && <span className="admin-ref-tag">off</span>}
                </span>
                <span className="admin-ref-actions">
                  <button
                    type="button" className="admin-ref-btn admin-ref-btn-sm"
                    disabled={savingId === a.id} onClick={() => onToggleActive(a)}
                  >
                    {a.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button" className="admin-ref-btn admin-ref-btn-sm admin-ref-btn-ghost"
                    disabled={savingId === a.id} onClick={() => onDelete(a)}
                  >
                    Delete
                  </button>
                </span>
              </div>
              <div className="admin-ann-msg">{a.body}</div>
              <div className="admin-ann-meta">
                <span>{segLabel(a.segment)}</span>
                <span>{freqLabel(a.frequency)}</span>
                <span>Expires: {fmtExpiry(a.expires_at)}</span>
                {a.cta_label ? <span>CTA: {a.cta_label}</span> : null}
              </div>
              <div className="admin-ann-counts">
                <span>{a.seen_count ?? 0} seen</span>
                <span>{a.tapped_count ?? 0} tapped</span>
                <span>{a.dismissed_count ?? 0} dismissed</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ReferralsPanel() {
  const [rows, setRows]       = useState(null);
  const [error, setError]     = useState(null);
  const [busy, setBusy]       = useState(false);
  const [notice, setNotice]   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', code: '', rate: '20', flat: '' });

  const origin = (() => {
    try { return window.location.origin; } catch { return 'https://tracemate.art'; }
  })();

  const load = useCallback(async () => {
    try {
      const data = await listReferrers();
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'Could not load referrers.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  }, []);

  const copy = useCallback((text, label) => {
    try {
      navigator.clipboard?.writeText(text);
      flash(`${label} copied`);
    } catch { flash('Copy failed — select manually'); }
  }, [flash]);

  const onCreate = useCallback(async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = {
        name:  form.name.trim() || null,
        email: form.email.trim() || null,
      };
      if (form.code.trim()) payload.code = form.code.trim();
      // Flat overrides rate when present. Rate is entered as a percent.
      if (form.flat.trim() !== '') {
        payload.commission_flat_cents = Math.round(parseFloat(form.flat) * 100);
      } else {
        payload.commission_rate_bps = Math.round(parseFloat(form.rate || '0') * 100);
      }
      await createReferrer(payload);
      setForm({ name: '', email: '', code: '', rate: '20', flat: '' });
      setShowCreate(false);
      await load();
      flash('Partner created');
    } catch (err) {
      setError(friendlyError(err, 'Could not create partner.'));
    } finally {
      setBusy(false);
    }
  }, [form, load, flash]);

  const onToggleActive = useCallback(async (r) => {
    setBusy(true); setError(null);
    try {
      await updateReferrer(r.id, { active: !r.active });
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Could not update partner.'));
    } finally { setBusy(false); }
  }, [load]);

  const onEditRate = useCallback(async (r) => {
    const cur = r.commission_flat_cents != null
      ? `flat ${(r.commission_flat_cents / 100).toFixed(2)}`
      : `${(Number(r.commission_rate_bps) || 0) / 100}`;
    const input = window.prompt(
      `Commission for "${r.code}".\nEnter a percent (e.g. 20) or "flat 2.50" for a fixed $ per sale.`,
      cur,
    );
    if (input == null) return;
    setBusy(true); setError(null);
    try {
      const m = input.trim().toLowerCase();
      if (m.startsWith('flat')) {
        const amt = parseFloat(m.replace('flat', '').trim());
        if (!Number.isFinite(amt)) throw new Error('Invalid flat amount');
        await updateReferrer(r.id, { commission_flat_cents: Math.round(amt * 100) });
      } else {
        const pct = parseFloat(m);
        if (!Number.isFinite(pct)) throw new Error('Invalid percent');
        // Clearing the flat override (null) so the percent takes effect.
        await updateReferrer(r.id, { commission_rate_bps: Math.round(pct * 100), commission_flat_cents: null });
      }
      await load();
      flash('Commission updated');
    } catch (err) {
      setError(friendlyError(err, 'Could not update commission.'));
    } finally { setBusy(false); }
  }, [load, flash]);

  const onMarkPaid = useCallback(async (r) => {
    if (!window.confirm(`Mark ${fmtCents(r.commission_pending_cents)} as paid to "${r.code}"? Do this after you've actually sent the money.`)) return;
    setBusy(true); setError(null);
    try {
      const n = await markCommissionsPaid(r.id);
      await load();
      flash(`Marked ${n} commission${n === 1 ? '' : 's'} paid`);
    } catch (err) {
      setError(friendlyError(err, 'Could not mark paid.'));
    } finally { setBusy(false); }
  }, [load, flash]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    return list.reduce((acc, r) => ({
      signups: acc.signups + (Number(r.signups) || 0),
      sales:   acc.sales   + (Number(r.sales)   || 0),
      pending: acc.pending + (Number(r.commission_pending_cents) || 0),
      paid:    acc.paid    + (Number(r.commission_paid_cents)    || 0),
    }), { signups: 0, sales: 0, pending: 0, paid: 0 });
  }, [rows]);

  return (
    <section className="admin-stats" aria-labelledby="admin-ref-title">
      <header className="admin-stats-head">
        <h2 id="admin-ref-title">Referrals &amp; commissions</h2>
        <span className="admin-stats-when">
          give a partner their <code>{origin}/i/&lt;code&gt;</code> link. Signups
          and sales through it are tracked below; commission accrues on the first
          payment <em>and</em> every renewal. Pay them, then hit “Mark paid”.
        </span>
      </header>

      {notice && <p className="admin-ref-notice">{notice}</p>}
      {error && <p className="admin-error" style={{ margin: 12 }}>{error}</p>}

      <div className="admin-ref-toolbar">
        <button type="button" className="admin-ref-btn" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ New partner'}
        </button>
        <button type="button" className="admin-ref-btn admin-ref-btn-ghost" onClick={load} disabled={busy}>
          Refresh
        </button>
      </div>

      {showCreate && (
        <form className="admin-ref-create" onSubmit={onCreate}>
          <input
            className="admin-search" placeholder="Partner name"
            value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="admin-search" placeholder="Email (optional)"
            value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="admin-search" placeholder="code (blank = auto)"
            value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
          <input
            className="admin-search" placeholder="% rate" style={{ width: 90 }}
            value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
            disabled={form.flat.trim() !== ''}
          />
          <input
            className="admin-search" placeholder="$ flat (overrides %)" style={{ width: 150 }}
            value={form.flat} onChange={(e) => setForm((f) => ({ ...f, flat: e.target.value }))}
          />
          <button type="submit" className="admin-ref-btn" disabled={busy}>Create</button>
        </form>
      )}

      {rows === null && !error ? (
        <div className="admin-stats-loading">
          <span className="admin-spinner" aria-hidden="true" />
          <span>Loading partners…</span>
        </div>
      ) : (rows && rows.length === 0) ? (
        <div className="admin-stats-empty" style={{ padding: 16 }}>
          No partners yet — create one and share their <code>/i/&lt;code&gt;</code> link.
        </div>
      ) : (
        <div className="admin-ref-table" role="table">
          <div className="admin-ref-row admin-ref-head" role="row">
            <span role="columnheader">Partner</span>
            <span role="columnheader">Rate</span>
            <span role="columnheader">Signups</span>
            <span role="columnheader">Paying</span>
            <span role="columnheader">Sales</span>
            <span role="columnheader">Owed</span>
            <span role="columnheader">Paid</span>
            <span role="columnheader">Actions</span>
          </div>
          {(rows ?? []).map((r) => (
            <div key={r.id} className={`admin-ref-row ${r.active ? '' : 'admin-ref-row-inactive'}`} role="row">
              <span className="admin-ref-partner" role="cell">
                <span className="admin-ref-code">/i/{r.code}</span>
                <span className="admin-ref-name">
                  {r.name || '—'}{!r.active && <span className="admin-ref-tag">disabled</span>}
                </span>
                <span className="admin-ref-links">
                  <button type="button" className="admin-ref-link" onClick={() => copy(`${origin}/i/${r.code}`, 'Referral link')}>
                    Copy link
                  </button>
                  {r.access_token && (
                    <button type="button" className="admin-ref-link" onClick={() => copy(`${origin}/partner?t=${r.access_token}`, 'Partner dashboard link')}>
                      Copy stats link
                    </button>
                  )}
                </span>
              </span>
              <span role="cell">
                <button type="button" className="admin-ref-link" onClick={() => onEditRate(r)} title="Edit commission">
                  {commissionLabel(r)}
                </button>
              </span>
              <span role="cell">{r.signups ?? 0}</span>
              <span role="cell">{r.paying_now ?? 0}</span>
              <span role="cell">{r.sales ?? 0}</span>
              <span role="cell"><strong>{fmtCents(r.commission_pending_cents)}</strong></span>
              <span role="cell">{fmtCents(r.commission_paid_cents)}</span>
              <span className="admin-ref-actions" role="cell">
                <button
                  type="button" className="admin-ref-btn admin-ref-btn-sm"
                  onClick={() => onMarkPaid(r)}
                  disabled={busy || !(Number(r.commission_pending_cents) > 0)}
                >
                  Mark paid
                </button>
                <button
                  type="button" className="admin-ref-link"
                  onClick={() => onToggleActive(r)} disabled={busy}
                >
                  {r.active ? 'Disable' : 'Enable'}
                </button>
              </span>
            </div>
          ))}
          <div className="admin-ref-row admin-ref-foot" role="row">
            <span role="cell"><strong>Total</strong></span>
            <span role="cell" />
            <span role="cell"><strong>{totals.signups}</strong></span>
            <span role="cell" />
            <span role="cell"><strong>{totals.sales}</strong></span>
            <span role="cell"><strong>{fmtCents(totals.pending)}</strong></span>
            <span role="cell"><strong>{fmtCents(totals.paid)}</strong></span>
            <span role="cell" />
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Post-trace survey rollup. Counts answers from users who reached the survey
   after their first trace — the "how old" + "what they draw" pair lets the
   operator read the audience and steer content/pack creation. Pure client-
   side aggregation off the same users array, no extra fetch. */

