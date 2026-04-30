// Shared CORS headers used by Edge Functions when responding to browser calls.
//
// We allow only the origin set in DODO_APP_URL (or APP_URL fallback). Treating
// the request origin as untrusted and echoing it would defeat the purpose; we
// match against the configured value and serve `null` otherwise — that fails
// the browser's CORS check rather than silently allowing the call.
const ALLOWED_ORIGIN =
  Deno.env.get('APP_URL') ??
  Deno.env.get('DODO_APP_URL') ??
  'http://localhost:5173';

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
