// Shared CORS headers used by Edge Functions when responding to browser calls.
//
// We allow only the origin set in DODO_APP_URL (or APP_URL fallback). Treating
// the request origin as untrusted and echoing it would defeat the purpose; we
// match against the configured value and serve `null` otherwise — that fails
// the browser's CORS check rather than silently allowing the call.
const _appUrl = Deno.env.get('APP_URL') ?? Deno.env.get('DODO_APP_URL');
const ALLOWED_ORIGIN = _appUrl ?? 'http://localhost:5173';

if (!_appUrl) {
  // Loud failure mode for prod misconfig — silently allowing only localhost
  // means every browser request fails CORS in production.
  console.warn(
    '[cors] APP_URL / DODO_APP_URL not set — falling back to http://localhost:5173. ' +
    'In production this will block every browser request as a CORS mismatch. ' +
    'Set APP_URL via `supabase secrets set APP_URL=https://your-domain.com`.',
  );
}

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

// Backwards-compatible static export. Functions that don't yet pass `req`
// fall back to the configured allowed origin (no wildcard). Prefer
// `corsHeadersFor(req)` in new code.
export const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age':       '86400',
  'Vary':                         'Origin',
};
