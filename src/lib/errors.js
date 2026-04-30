/**
 * Translate a Supabase / Edge Function error into a friendly user message.
 * The most common one in development is "function not deployed yet".
 */
export function friendlyError(err, fallback = 'Something went wrong.') {
  if (!err) return fallback;
  const name    = err.name    ?? '';
  const message = err.message ?? String(err);

  // FunctionsFetchError fires when the edge function URL is unreachable
  // (most often: not deployed, or local dev not running).
  if (name === 'FunctionsFetchError' || /Failed to send a request/.test(message)) {
    return 'Payment service unavailable. The backend may not be deployed yet — try again in a moment.';
  }

  if (/Not authenticated/i.test(message)) return 'You need to sign in first.';
  if (/sold out/i.test(message))           return 'That plan is sold out.';
  if (/Invalid plan/i.test(message))       return 'That plan isn\'t available right now.';

  return message || fallback;
}
