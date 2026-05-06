// Supabase Edge Function: notify-operator
// ─────────────────────────────────────────────────────────────────────────────
// Receives event payloads from Postgres triggers (via pg_net) and forwards
// them to the operator as Resend emails. Five event shapes:
//
//   { event: "signup",          profile_id, email, display_name, created_at }
//   { event: "active",          profile_id, email, display_name, last_seen_at }
//   { event: "digest",          signups_24h, active_24h, paid_total }
//   { event: "stuck_webhooks",  stuck_count, oldest_age_secs, sample[] }
//   { event: "test", to? }      diagnostic — sends a one-shot probe email
//
// Authentication is a shared secret in `x-notify-secret`. Without this gate
// the function URL would be a free email-relay for any pg_net caller on the
// internet — Supabase Edge Functions are publicly addressable by default.
//
// ── REQUIRED EDGE-FUNCTION SECRETS ──────────────────────────────────────────
//   RESEND_API_KEY    — Resend API key
//   RESEND_FROM       — Sender, e.g. "Trace Mate <onboarding@resend.dev>".
//                       The onboarding sender works only for delivery to the
//                       email registered on the Resend account; for any other
//                       recipient you need a verified custom domain.
//   OPERATOR_EMAIL    — Where to deliver the operator notifications.
//   NOTIFY_FN_SECRET  — Shared secret matching app_settings.notify_fn_secret.
//
// Deploy (from the `app/` directory):
//   supabase functions deploy notify-operator
//   supabase secrets set RESEND_API_KEY=re_... \
//                        RESEND_FROM='Trace Mate <onboarding@resend.dev>' \
//                        OPERATOR_EMAIL=you@example.com \
//                        NOTIFY_FN_SECRET=<long random string>
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM    = Deno.env.get('RESEND_FROM') ?? 'Trace Mate <onboarding@resend.dev>';
const OPERATOR_EMAIL = Deno.env.get('OPERATOR_EMAIL');
const SECRET         = Deno.env.get('NOTIFY_FN_SECRET');

// Constant-time string compare. Avoids leaking the secret one character at a
// time through response-time differences if a future log/instrumentation ever
// surfaces them. Cheap; do it.
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmail(subject: string, html: string, overrideTo?: string): Promise<Response> {
  if (!RESEND_API_KEY || !OPERATOR_EMAIL) {
    console.error('[notify-operator] RESEND_API_KEY or OPERATOR_EMAIL not set');
    return new Response(
      JSON.stringify({ error: 'notify-operator not fully configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const to = overrideTo || OPERATOR_EMAIL;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    RESEND_FROM,
      to:      [to],
      subject,
      html,
    }),
  });

  // Resend always returns JSON. On success: { id: 'xx_...' } — surface it so
  // the operator can search the Resend dashboard / pg_net response log to
  // confirm a specific delivery. On failure: { name, message, ... }.
  let resendBody: any = null;
  try { resendBody = await r.json(); } catch { /* leave null */ }

  if (!r.ok) {
    console.error('[notify-operator] Resend error', r.status, resendBody);
    return new Response(
      JSON.stringify({
        error: 'email send failed',
        status: r.status,
        from: RESEND_FROM,
        to,
        resend: resendBody,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      from: RESEND_FROM,
      to,
      resend_id: resendBody?.id ?? null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // pg_net never sends OPTIONS, but be polite if anyone curls the URL.
    return new Response('ok', { status: 200 });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Hard fence: refuse to run if the shared secret isn't configured. Without
  // this check a misdeployed function (no secret set) would accept ALL calls,
  // which is strictly worse than refusing every call.
  if (!SECRET) {
    console.error('[notify-operator] NOTIFY_FN_SECRET not configured — refusing all calls');
    return new Response('Server misconfigured', { status: 500 });
  }

  const provided = req.headers.get('x-notify-secret') ?? '';
  if (!constantTimeEq(provided, SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const event = payload.event;

  if (event === 'signup') {
    const email = escapeHtml(payload.email);
    const name  = escapeHtml(payload.display_name);
    const when  = escapeHtml(payload.created_at);
    return sendEmail(
      `New Trace Mate signup: ${payload.email ?? '(no email)'}`,
      `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; line-height: 1.4;">
        <h2 style="margin:0 0 12px; font-size:18px;">A new user just signed up</h2>
        <p style="margin:0 0 6px;"><strong>${name || '(no name)'}</strong></p>
        <p style="margin:0 0 6px; color:#555;">${email}</p>
        <p style="margin:14px 0 0; color:#888; font-size:12px;">${when}</p>
      </div>`,
    );
  }

  if (event === 'active') {
    const email = escapeHtml(payload.email);
    const name  = escapeHtml(payload.display_name);
    const when  = escapeHtml(payload.last_seen_at);
    return sendEmail(
      `${payload.email ?? 'A user'} is in Trace Mate`,
      `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; line-height: 1.4;">
        <h2 style="margin:0 0 12px; font-size:18px;">A user is active in the app</h2>
        <p style="margin:0 0 6px;"><strong>${name || '(no name)'}</strong></p>
        <p style="margin:0 0 6px; color:#555;">${email}</p>
        <p style="margin:14px 0 0; color:#888; font-size:12px;">last_seen_at: ${when}</p>
        <p style="margin:6px 0 0; color:#aaa; font-size:11px;">Notifications dampened — at most one per user every 4&nbsp;hours.</p>
      </div>`,
    );
  }

  if (event === 'digest') {
    const signups = Number(payload.signups_24h ?? 0);
    const active  = Number(payload.active_24h  ?? 0);
    const paid    = Number(payload.paid_total  ?? 0);
    return sendEmail(
      `Trace Mate daily — ${signups} new, ${active} active`,
      `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; line-height: 1.4;">
        <h2 style="margin:0 0 16px; font-size:18px;">Daily digest</h2>
        <table style="border-collapse: collapse; width: 100%; font-size:14px;">
          <tr>
            <td style="padding:6px 0; color:#555;">New signups (24h)</td>
            <td style="padding:6px 0; text-align:right;"><strong>${signups}</strong></td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#555;">Active users (24h)</td>
            <td style="padding:6px 0; text-align:right;"><strong>${active}</strong></td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#555;">Paid subscribers (total)</td>
            <td style="padding:6px 0; text-align:right;"><strong>${paid}</strong></td>
          </tr>
        </table>
      </div>`,
    );
  }

  if (event === 'stuck_webhooks') {
    const count   = Number(payload.stuck_count ?? 0);
    const oldest  = Number(payload.oldest_age_secs ?? 0);
    const oldestH = Math.floor(oldest / 3600);
    const sample  = Array.isArray(payload.sample) ? payload.sample : [];
    const rows = sample.map((s: any) => `
      <tr>
        <td style="padding:6px 10px 6px 0; color:#555; font-size:12px;">${escapeHtml(s.event_type)}</td>
        <td style="padding:6px 10px 6px 0; color:#888; font-size:12px;">${escapeHtml(s.created_at)}</td>
        <td style="padding:6px 0; color:#a33; font-size:12px;">${escapeHtml((s.error_message ?? '').slice(0, 140))}</td>
      </tr>
    `).join('');
    return sendEmail(
      `Trace Mate · ${count} stuck webhook${count === 1 ? '' : 's'}`,
      `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 640px; line-height: 1.4;">
        <h2 style="margin:0 0 12px; font-size:18px;">${count} webhook event${count === 1 ? ' has' : 's have'} been stuck for over 24 hours</h2>
        <p style="margin:0 0 12px; color:#555;">
          Oldest is <strong>${oldestH}h</strong> old. Dodo has either given up retrying or is about to.
          Check the admin dashboard's Webhook health panel for the full list, or read the error messages below to start triage.
        </p>
        ${rows ? `<table style="border-collapse: collapse; width: 100%; font-size:12px; margin-top:8px;">
          <thead><tr style="text-align:left;">
            <th style="padding:4px 10px 4px 0; color:#888; font-weight:600;">event</th>
            <th style="padding:4px 10px 4px 0; color:#888; font-weight:600;">when</th>
            <th style="padding:4px 0;          color:#888; font-weight:600;">error</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>` : ''}
      </div>`,
    );
  }

  // Diagnostic: send a one-shot test email to OPERATOR_EMAIL (or a custom
  // address passed as `to`). Returns the resolved RESEND_FROM and the Resend
  // response id so the operator can confirm delivery vs. silent-bounce.
  // Body: { event: 'test', to?: string }
  if (event === 'test') {
    const overrideTo = typeof payload.to === 'string' && payload.to.length > 0
      ? payload.to
      : undefined;
    return sendEmail(
      'Trace Mate · notify-operator test',
      `<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; line-height: 1.4;">
        <h2 style="margin:0 0 12px; font-size:18px;">Test email</h2>
        <p style="margin:0 0 6px;">If you're reading this, the notify-operator pipeline is healthy end-to-end.</p>
        <p style="margin:14px 0 0; color:#888; font-size:12px;">from: ${escapeHtml(RESEND_FROM)}</p>
        <p style="margin:6px 0 0; color:#888; font-size:12px;">to: ${escapeHtml(overrideTo ?? OPERATOR_EMAIL ?? '(unset)')}</p>
        <p style="margin:6px 0 0; color:#888; font-size:12px;">at: ${new Date().toISOString()}</p>
      </div>`,
      overrideTo,
    );
  }

  return new Response(`Unknown event: ${String(event)}`, { status: 400 });
});
