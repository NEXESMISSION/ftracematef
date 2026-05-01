import { supabase } from './supabase.js';
import { unwrapFunctionError } from './errors.js';

/**
 * Calls the `create-checkout` Supabase Edge Function with the chosen plan.
 * Returns the Dodo checkout URL on success — call site should then do
 * `window.location.href = url` to send the user to Dodo.
 *
 * @param {'monthly'|'quarterly'|'lifetime'} plan
 */
export async function startCheckout(plan) {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { plan },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (!data?.checkout_url) throw new Error('No checkout_url returned from Edge Function');
  return data.checkout_url;
}

const PRECHECKOUT_KEY = 'tm:checkout:before';
// 6 hours — long enough for a slow webhook + a user finishing up Dodo's
// 3DS / Apple Pay flow, short enough that an abandoned session a day later
// can't accidentally compare against a fresh isPaid=true and skip the
// "did anything actually change?" check.
const PRECHECKOUT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Snapshot the user's subscription state immediately BEFORE redirecting to
 * Dodo. /checkout/success uses this to tell apart:
 *
 *   - "I just paid" → new subscription row, or existing row's updated_at
 *     advanced past the snapshot → celebrate + send to /upload?welcome=1
 *   - "Payment failed/cancelled but I was already paid before" → row
 *     unchanged since snapshot → bounce to /pricing?checkout=cancelled
 *     instead of falsely celebrating
 *
 * Without this snapshot, an already-paid user who attempts an upgrade and
 * has the second payment fail still has isPaid=true on return (their old
 * sub is still active), and CheckoutSuccess used to celebrate that as a
 * fresh purchase.
 *
 * @param {object|null} subscription  current subscription row from useAuth()
 */
export function markPreCheckout(subscription) {
  try {
    sessionStorage.setItem(PRECHECKOUT_KEY, JSON.stringify({
      sub_id:     subscription?.id ?? null,
      updated_at: subscription?.updated_at ?? null,
      plan:       subscription?.plan ?? null,
      status:     subscription?.status ?? null,
      ts:         Date.now(),
    }));
  } catch { /* private mode / quota — best-effort */ }
}

/** Read + drop the snapshot. Returns null if missing or expired. */
export function consumePreCheckoutSnapshot() {
  try {
    const raw = sessionStorage.getItem(PRECHECKOUT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PRECHECKOUT_KEY);
    const snap = JSON.parse(raw);
    if (!snap || typeof snap !== 'object') return null;
    if (Date.now() - (snap.ts ?? 0) > PRECHECKOUT_MAX_AGE_MS) return null;
    return snap;
  } catch { return null; }
}
