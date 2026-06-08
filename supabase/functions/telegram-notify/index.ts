// Supabase Edge Function: telegram-notify
// ─────────────────────────────────────────────────────────────────────────────
// Receives event payloads from Postgres triggers (via pg_net) and forwards them
// to the operator's Telegram chat via the Bot API. Event shapes:
//
//   { event: "visitor",     ...analytics_visitors row (geo/source/device/time) }
//   { event: "signup",      email, display_name, source, created_at }
//   { event: "trace_start", email, image_label, started_at }
//   { event: "test" }       diagnostic — sends a one-shot probe message
//
// Auth: shared secret in `x-notify-secret` (same NOTIFY_FN_SECRET the
// notify-operator email function uses). Without it the public function URL
// would be an open Telegram relay.
//
// ── REQUIRED EDGE-FUNCTION SECRETS ──────────────────────────────────────────
//   TELEGRAM_BOT_TOKEN  — from @BotFather (e.g. 123456:ABC-DEF...)
//   TELEGRAM_CHAT_ID    — your chat id (message @userinfobot to get it, or
//                         start a chat with your bot and read getUpdates)
//   NOTIFY_FN_SECRET    — shared secret matching app_settings.notify_fn_secret
//
// Deploy (from the `app/` directory):
//   supabase functions deploy telegram-notify
//   supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
// ─────────────────────────────────────────────────────────────────────────────

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const CHAT_ID   = Deno.env.get('TELEGRAM_CHAT_ID');
const SECRET    = Deno.env.get('NOTIFY_FN_SECRET');

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Telegram HTML parse-mode only allows a few tags; escape the rest.
function esc(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtTime(iso: unknown): string {
  if (!iso) return '';
  try { return new Date(String(iso)).toUTCString().replace('GMT', 'UTC'); }
  catch { return String(iso); }
}

async function sendTelegram(text: string): Promise<Response> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('[telegram-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return new Response(JSON.stringify({ error: 'telegram-notify not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  let body: any = null;
  try { body = await r.json(); } catch { /* ignore */ }
  if (!r.ok || body?.ok === false) {
    console.error('[telegram-notify] Telegram error', r.status, body);
    return new Response(JSON.stringify({ error: 'telegram send failed', status: r.status, telegram: body }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true, message_id: body?.result?.message_id ?? null }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (!SECRET) {
    console.error('[telegram-notify] NOTIFY_FN_SECRET not configured — refusing all calls');
    return new Response('Server misconfigured', { status: 500 });
  }
  if (!constantTimeEq(req.headers.get('x-notify-secret') ?? '', SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const event = p.event;

  if (event === 'visitor') {
    const geo = [p.city, p.country].map(esc).filter(Boolean).join(', ') || 'Unknown location';
    const flag = typeof p.country_code === 'string' && p.country_code.length === 2
      ? String.fromCodePoint(...[...p.country_code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
      : '🌍';
    const src = esc(p.source) || '(direct)';
    const ref = p.referrer ? `\n🔗 <b>Ref:</b> ${esc(p.referrer)}` : '';
    const camp = p.campaign ? ` · campaign: ${esc(p.campaign)}` : '';
    const device = [p.device_type, p.os, p.browser].map(esc).filter(Boolean).join(' · ') || 'unknown device';
    const lang = p.lang ? ` · ${esc(p.lang)}` : '';
    return sendTelegram(
      `👀 <b>New visitor</b>\n` +
      `${flag} ${geo}\n` +
      `🚪 <b>Source:</b> ${src}${camp}\n` +
      `📄 <b>Landing:</b> ${esc(p.landing_path) || '/'}${ref}\n` +
      `📱 ${device}${lang}\n` +
      `🕒 ${fmtTime(p.first_seen_at)}`,
    );
  }

  if (event === 'signup') {
    const src = p.source ? `\n🚪 <b>Source:</b> ${esc(p.source)}` : '';
    return sendTelegram(
      `🎉 <b>New signup</b>\n` +
      `✉️ ${esc(p.email) || '(no email)'}\n` +
      (p.display_name ? `👤 ${esc(p.display_name)}\n` : '') +
      `${src}\n`.replace(/^\n/, '') +
      `🕒 ${fmtTime(p.created_at)}`,
    );
  }

  if (event === 'trace_start') {
    return sendTelegram(
      `🎨 <b>Started tracing</b>\n` +
      `✉️ ${esc(p.email) || '(unknown user)'}\n` +
      (p.image_label ? `🖼️ ${esc(p.image_label)}\n` : '') +
      `🕒 ${fmtTime(p.started_at)}`,
    );
  }

  if (event === 'test') {
    return sendTelegram(`✅ <b>Trace Mate</b> — Telegram notifications are live.\n🕒 ${new Date().toUTCString()}`);
  }

  return new Response(`Unknown event: ${String(event)}`, { status: 400 });
});
