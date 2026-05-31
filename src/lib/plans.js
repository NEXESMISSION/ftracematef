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
    price: 7,
    wasPrice: 9,
    period: '/ month',
    shortPeriod: '/ mo',
    badge: '22% off',
    cta: 'Start Monthly',
    features: [
      'Full quality outlines',
      'All tools unlocked',
      'Works on any device',
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
    // Temporarily hidden from public pricing surfaces. PLAN_BY_ID /
    // PLAN_LABEL still resolve the entry so existing quarterly subscribers
    // see their plan name on /account; only display lists filter by this.
    hidden: true,
    features: [
      'Full quality outlines',
      'All tools unlocked',
      'Works on any device',
      'Save 52% vs monthly',
    ],
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: 15,
    wasPrice: 25,
    period: 'one-time · forever',
    shortPeriod: 'one-time',
    badge: '40% off',
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

/**
 * Plans to actually render on pricing surfaces (landing Pricing, /pricing,
 * Paywall). Filters out anything flagged `hidden`. Lookup tables below
 * intentionally keep hidden plans so existing subscribers' labels still
 * resolve and so a stale checkout intent for a hidden plan can still be
 * processed if it somehow fires.
 */
export const VISIBLE_PLANS = PLANS.filter((p) => !p.hidden);

/** Quick lookup helpers. */
export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p]));

export const PLAN_LABEL = {
  free:      'Free tier',
  monthly:   'Monthly · $7/mo',
  quarterly: '3 Months · $10',
  lifetime:  'Lifetime · $15',
};
