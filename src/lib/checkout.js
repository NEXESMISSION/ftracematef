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
 * The snapshot is namespaced by user id so a stale snapshot from user A
 * can't be consumed by user B on a shared device — the consume side
 * checks `user_id === currentUserId` before trusting it. Without that
 * check, a token-swap or sibling-tab sign-in could land user B on
 * /checkout/success with user A's snapshot still in sessionStorage.
 *
 * @param {object|null} subscription  current subscription row from useAuth()
 * @param {string|null|undefined} userId  current user id from useAuth()
 */
export function markPreCheckout(subscription, userId) {
  if (!userId) return; // never stamp without an owning user
  try {
    sessionStorage.setItem(PRECHECKOUT_KEY, JSON.stringify({
      user_id:    userId,
      sub_id:     subscription?.id ?? null,
      updated_at: subscription?.updated_at ?? null,
      plan:       subscription?.plan ?? null,
      status:     subscription?.status ?? null,
      ts:         Date.now(),
    }));
  } catch { /* private mode / quota — best-effort */ }
}

/**
 * Read + drop the snapshot — but only when we can validate it. Returns null if:
 *   - missing
 *   - expired (older than PRECHECKOUT_MAX_AGE_MS) — also removed
 *   - malformed JSON — also removed
 *   - currentUserId is missing (auth still loading) — KEPT for next call
 *   - belongs to a different user — KEPT (it's not ours to remove)
 *   - matches: returned and removed
 *
 * The key is only deleted in the cases where deletion is safe (expired,
 * malformed, or successfully consumed by the rightful owner). Without that
 * care, calling this during the brief window where `user.id` is still null
 * (auth not yet settled) used to silently consume + drop the snapshot,
 * making the subsequent call see "no snapshot" and route to /account.
 */
export function consumePreCheckoutSnapshot(currentUserId) {
  try {
    const raw = sessionStorage.getItem(PRECHECKOUT_KEY);
    if (!raw) return null;

    let snap;
    try { snap = JSON.parse(raw); } catch {
      sessionStorage.removeItem(PRECHECKOUT_KEY);
      return null;
    }
    if (!snap || typeof snap !== 'object') {
      sessionStorage.removeItem(PRECHECKOUT_KEY);
      return null;
    }
    if (Date.now() - (snap.ts ?? 0) > PRECHECKOUT_MAX_AGE_MS) {
      sessionStorage.removeItem(PRECHECKOUT_KEY);
      return null;
    }
    // Auth not yet settled — leave the snapshot in storage and try again
    // on the next render once user?.id resolves.
    if (!currentUserId) return null;
    // Belongs to a different user — leave it where it is. Their signOut
    // (or our user-id-transition cleanup in AuthProvider) will drop it.
    if (snap.user_id !== currentUserId) return null;

    sessionStorage.removeItem(PRECHECKOUT_KEY);
    return snap;
  } catch { return null; }
}

/**
 * Drop the snapshot without consuming its contents. Call this from the
 * checkout-call-site catch block when `startCheckout` throws — without
 * this, a stamped snapshot from a never-completed checkout sits in
 * sessionStorage and contaminates the next /checkout/success visit.
 */
export function clearPreCheckoutSnapshot() {
  try { sessionStorage.removeItem(PRECHECKOUT_KEY); } catch { /* ignore */ }
}
