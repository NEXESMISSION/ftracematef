/**
 * Single source of truth for the public-facing plan catalog.
 * Edit prices, badges, copy here — every page (Pricing landing, Paywall,
 * Account, ChangePlan modal) imports from this file.
 *
 * The Edge Function still owns the actual Dodo product_id mapping
 * (via DODO_PRODUCT_* env vars) — these strings are display-only.
 */

export const PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: 5,
    wasPrice: 7,
    period: '/ month',
    shortPeriod: '/ mo',
    badge: '29% off',
    cta: 'Start Monthly',
    features: [
      'Full quality outlines',
      'All tools unlocked',
      'Works on any device',
      'Cancel anytime',
    ],
  },
  {
    id: 'quarterly',
    name: '3 Months',
    price: 10,
    wasPrice: 13,
    period: '/ 3 months',
    shortPeriod: '/ 3 mo',
    badge: '23% off',
    cta: 'Get 3 Months',
    features: [
      'Full quality outlines',
      'All tools unlocked',
      'Works on any device',
      'Save 33% vs monthly',
    ],
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: 15,
    wasPrice: 20,
    period: 'one-time · forever',
    shortPeriod: 'one-time',
    badge: '25% off',
    cta: 'Claim Lifetime',
    gold: true,
    features: [
      'Full quality outlines',
      'All tools unlocked, forever',
      'Works on any device',
      'Lifetime updates included',
    ],
  },
];

/** Quick lookup helpers. */
export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p]));

export const PLAN_LABEL = {
  free:      'Free',
  monthly:   'Monthly · $5/mo',
  quarterly: '3 Months · $10',
  lifetime:  'Lifetime · $15',
};
