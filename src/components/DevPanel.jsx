import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { unwrapFunctionError } from '../lib/errors.js';

// Self-test panel for the paywall + renewal + failure flows. Visible only
// for admin emails (frontend gate via VITE_ADMIN_EMAILS, real gate enforced
// server-side in the dev-mutate-subscription edge function).
//
// Each preset button POSTs a partial update; the realtime channel in
// AuthProvider picks up the change and the rest of the UI reacts within ~1s.
const PRESETS = [
  { id: 'free',           label: 'Reset to free',          tone: 'ghost',
    body: { plan: 'free' } },
  { id: 'monthly',        label: 'Active monthly (30d)',   tone: 'plain',
    body: { plan: 'monthly',   status: 'active', period_end_offset_days: 30 } },
  { id: 'quarterly',      label: 'Active 3-month (90d)',   tone: 'plain',
    body: { plan: 'quarterly', status: 'active', period_end_offset_days: 90 } },
  { id: 'lifetime',       label: 'Active lifetime',        tone: 'plain',
    body: { plan: 'lifetime',  status: 'active', current_period_end: null } },
  { id: 'expire-soon',    label: 'Expire in 30 seconds',   tone: 'warn',
    body: { period_end_offset_days: 30 / 86400 } },
  { id: 'on-hold',        label: 'Simulate failed payment',tone: 'warn',
    body: { status: 'on_hold' } },
  { id: 'cancel-imm',     label: 'Cancel immediately',     tone: 'warn',
    body: { status: 'cancelled' } },
  { id: 'expired',        label: 'Mark expired',           tone: 'warn',
    body: { status: 'expired' } },
  { id: 'renew',          label: 'Simulate renewal (+30d)',tone: 'plain',
    body: { status: 'active', period_end_offset_days: 30 } },
];

export default function DevPanel() {
  const { user, subscription, refresh, isPaid } = useAuth();
  const [busy, setBusy]   = useState(null);
  const [error, setError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);

  const apply = async (preset) => {
    setError(null); setOkMsg(null);
    setBusy(preset.id);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'dev-mutate-subscription',
        { body: preset.body },
      );
      if (invokeErr) throw new Error(await unwrapFunctionError(invokeErr));
      if (data?.error) throw new Error(data.error);
      await refresh();
      setOkMsg(`Applied: ${preset.label}`);
    } catch (e) {
      setError(e.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="dev-panel">
      <header className="dev-panel-head">
        <span className="dev-tag">DEV</span>
        <h3 className="dev-title">Self-test</h3>
        <span className={`dev-status ${isPaid ? 'is-paid' : 'is-free'}`}>
          isPaid: {String(isPaid)}
        </span>
      </header>

      <dl className="dev-meta">
        <div><dt>plan</dt>           <dd>{subscription?.plan ?? '—'}</dd></div>
        <div><dt>status</dt>         <dd>{subscription?.status ?? '—'}</dd></div>
        <div><dt>period_end</dt>     <dd>{subscription?.current_period_end ?? '—'}</dd></div>
        <div><dt>email</dt>          <dd className="dev-mono">{user?.email}</dd></div>
      </dl>

      <div className="dev-grid">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`dev-btn dev-btn-${p.tone}`}
            onClick={() => apply(p)}
            disabled={!!busy}
          >
            {busy === p.id ? 'Applying…' : p.label}
          </button>
        ))}
      </div>

      {error && <p className="dev-err">{error}</p>}
      {okMsg && <p className="dev-ok">{okMsg}</p>}

      <p className="dev-hint">
        Mutations are scoped to your own row. The realtime channel in
        AuthProvider should reflect the change within ~1s.
      </p>
    </section>
  );
}
