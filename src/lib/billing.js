import { supabase } from './supabase.js';
import { unwrapFunctionError } from './errors.js';

/** POST a subscription action to the Edge Function. */
export async function subscriptionAction(action, extras = {}) {
  const { data, error } = await supabase.functions.invoke('subscription-action', {
    body: { action, ...extras },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Fetch the user's payment history from Dodo via Edge Function. */
export async function listPayments() {
  const { data, error } = await supabase.functions.invoke('list-payments', {
    method: 'POST',
    body: {},
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  return data?.payments ?? [];
}

/** Open the Dodo Customer Portal in a new tab. */
export async function openBillingPortal() {
  const { data, error } = await supabase.functions.invoke('create-portal-session');
  if (error) throw new Error(await unwrapFunctionError(error));
  if (!data?.portal_url) throw new Error('No portal URL returned');
  window.open(data.portal_url, '_blank', 'noopener,noreferrer');
}
