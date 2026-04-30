// Shared CORS headers used by Edge Functions when responding to browser calls.
//
// We allow only the origin set in DODO_APP_URL (or APP_URL fallback). Treating
// the request origin as untrusted and echoing it would defeat the purpose; we
// match against the configured value and serve `null` otherwise — that fails
// the browser's CORS check rather than silently allowing the call.
const _appUrl = Deno.env.get('APP_URL') ?? Deno.env.get('DODO_APP_URL');

// Heuristic for "this is a local `supabase start` runtime, not a deployed
// project" — SUPABASE_URL is auto-injected by the platform and points at the
// loopback API in dev. Used so we fail-fast on real deployments while keeping
// a sane fallback for hacking on the functions locally.
const _supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const _isLocalDev = _supabaseUrl.includes('127.0.0.1') || _supabaseUrl.includes('localhost');

if (!_appUrl && !_isLocalDev) {
  // Hard fail at module load on any deployed project. The previous behavior
  // was a silent fallback to http://localhost:5173, which made every browser
  // request to the function fail CORS in production — a deploy-day outage
  // that only surfaced in customer-facing 404s. Better to crash the function
  // boot so the misconfig is visible in the function logs immediately.
  throw new Error(
    '[cors] APP_URL / DODO_APP_URL is not set. ' +
    'Run: supabase secrets set APP_URL=https://your-domain.com',
  );
}

const ALLOWED_ORIGIN = _appUrl ?? 'http://localhost:5173';

// Per-request CORS headers. Echoes the allowed origin only when it matches
// the configured one — any other origin gets `Access-Control-Allow-Origin: null`,
// which fails the browser's CORS check rather than silently allowing the call.
// Always pass `req` so the response varies on Origin instead of statically
// emitting the configured origin to every caller.
export function corsHeadersFor(req: Request): HeadersInit {
  const origin = req.headers.get('origin') ?? '';
  const ok = origin === ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin':  ok ? ALLOWED_ORIGIN : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}
