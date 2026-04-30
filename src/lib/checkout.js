import { supabase } from './supabase.js';

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
  if (error) throw error;
  if (!data?.checkout_url) throw new Error('No checkout_url returned from Edge Function');
  return data.checkout_url;
}
