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
  const status  = err.context?.status;

  // FunctionsFetchError fires when the edge function URL is unreachable
  // (most often: not deployed, or local dev not running).
  if (name === 'FunctionsFetchError' || /Failed to send a request/.test(message)) {
    return 'Payment service unavailable. The backend may not be deployed yet — try again in a moment.';
  }

  // Rate-limited (429). The server returns a friendlier per-endpoint message
  // in the response body, but reading it requires awaiting unwrapFunctionError.
  // Most call sites use friendlyError synchronously, so surface a sensible
  // generic message here — beats the default "Edge Function returned a non-2xx
  // status code" that supabase-js wraps the response in.
  if (status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  if (/Not authenticated/i.test(message)) return 'You need to sign in first.';
  if (/sold out/i.test(message))           return 'That plan is sold out.';
  if (/Invalid plan/i.test(message))       return 'That plan isn\'t available right now.';
  // Dodo-portal call before any payment exists — most common reason a free
  // user lands here is clicking "Manage billing" by accident on a stale tab.
  if (/no dodo customer/i.test(message))
    return "You haven't picked a plan yet, so there's no billing portal to open. Choose a plan first and we'll set everything up.";
  // Subscription row exists locally but the Dodo webhook hasn't linked it
  // yet. Two real-world causes: (a) ~1s race between checkout return and
  // the activation webhook, (b) a dev-mutate row that was never paid for.
  // The technical message ("dodo_subscription_id") leaks an internal column
  // name — surface a clearer prompt instead.
  if (/not linked to a dodo/i.test(message) || /dodo_subscription_id/i.test(message))
    return "Your subscription isn't fully set up yet. Wait a few seconds and refresh — the payment provider needs a moment to confirm.";

  return message || fallback;
}
