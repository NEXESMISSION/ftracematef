/**
 * Pull the real error message out of a supabase-js FunctionsHttpError.
 * supabase-js wraps non-2xx responses in a generic error and stuffs the
 * Response on `.context` — without this, callers only ever see
 * "Edge Function returned a non-2xx status code".
 */
export async function unwrapFunctionError(err) {
  if (!err) return null;
  const ctx = err.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      // Prefer the more specific debug detail if the server included it.
      if (body?.details) return `${body.error ?? 'Error'} — ${body.details}`;
      if (body?.error)   return body.error;
    } catch { /* response wasn't JSON — fall through */ }
    try {
      const text = await ctx.clone().text();
      if (text) return text.slice(0, 300);
    } catch { /* ignore */ }
  }
  return err.message ?? String(err);
}

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
