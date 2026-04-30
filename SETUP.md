# Trace Mate — Auth + Payments Setup

You only do this **once**. Follow it top to bottom.

---

## 1. Supabase

### Create the project
1. Go to [supabase.com](https://supabase.com) → **New project**.
2. From **Settings → API**, copy:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key (kept private — never goes in the frontend)

### Enable Google OAuth
1. **Auth → Providers → Google → Enable**
2. In Google Cloud Console, create an **OAuth 2.0 Client ID** (web app).
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Paste **Client ID** + **Client Secret** into Supabase, save.
4. **Auth → URL Configuration**
   - **Site URL**: your production URL (e.g. `https://tracemate.art`)
   - **Redirect URLs** (additional): `http://localhost:5173/**`

### Run the schema migration
1. **SQL Editor → New query**
2. Paste the contents of `supabase/migrations/20260430000000_init.sql`.
3. Run. (Idempotent — safe to re-run.)

---

## 2. Dodo Payments

### Create your products
[Dashboard → Products → New product](https://app.dodopayments.com), three times:

| Name | Type | Price | Interval | Save the ID as |
|---|---|---|---|---|
| Trace Mate Monthly | Subscription | $5 USD | 1 month | `DODO_PRODUCT_MONTHLY` |
| Trace Mate Quarterly | Subscription | $10 USD | 3 months | `DODO_PRODUCT_QUARTERLY` |
| Trace Mate Lifetime | One-time | $15 USD | — | `DODO_PRODUCT_LIFETIME` |

### Get an API key + webhook secret
1. **Developer → API Keys** — create a key (start in **test mode**).
2. **Developer → Webhooks → Add endpoint**
   - URL: `https://<project-ref>.supabase.co/functions/v1/dodo-webhook`
   - Subscribe to:
     - `subscription.active`
     - `subscription.renewed`
     - `subscription.updated`        ← canonical real-time sync event
     - `subscription.plan_changed`   ← upgrades / downgrades
     - `subscription.cancelled`
     - `subscription.on_hold`
     - `subscription.expired`
     - `subscription.failed`
     - `payment.succeeded`           ← needed for one-time Lifetime purchases
   - Copy the **signing secret** → `DODO_WEBHOOK_SECRET`

---

## 3. Deploy the Edge Functions

```bash
# one-time
npm i -g supabase
supabase login
supabase link --project-ref <project-ref>

# set the secrets the functions need
supabase secrets set \
  DODO_API_KEY=...                       \
  DODO_WEBHOOK_SECRET=...                \
  DODO_ENVIRONMENT=test_mode             \
  DODO_PRODUCT_MONTHLY=prod_xxx          \
  DODO_PRODUCT_QUARTERLY=prod_xxx        \
  DODO_PRODUCT_LIFETIME=prod_xxx         \
  APP_URL=https://tracemate.art

# deploy (6 functions total)
supabase functions deploy create-checkout
supabase functions deploy create-portal-session
supabase functions deploy subscription-action
supabase functions deploy list-payments
supabase functions deploy dev-mutate-subscription
supabase functions deploy dodo-webhook
```

When you're ready to go live, change `DODO_ENVIRONMENT` to `live_mode` and use a live API key.

### Optional: enable the dev self-test panel

The `/account` page has a hidden self-test panel that lets an admin flip
their own subscription state to any plan/status — handy for verifying the
paywall, renewal, and failure flows without involving Dodo. Two env vars
control it:

```bash
# Backend gate (real security boundary — also requires DODO_ENVIRONMENT to NOT
# be live_mode AND ENABLE_DEV_MUTATE=true on the project):
supabase secrets set ADMIN_EMAILS=you@example.com,teammate@example.com
supabase secrets set ENABLE_DEV_MUTATE=true
supabase functions deploy dev-mutate-subscription

# Frontend gate (UI only — the panel only renders when profile.is_admin = true).
# Grant via SQL Editor (or psql):
#   select public.set_admin_by_email('you@example.com', true);
#   select public.set_admin_by_email('teammate@example.com', true);
# To revoke later, pass `false` instead.
```

Mutations are scoped to the caller's own user_id; admins can't reach other
users' rows through this endpoint.

---

## 4. Frontend env vars

### Local dev
Create `app/.env.local`:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Cloudflare Pages
**Workers & Pages → your project → Settings → Environment variables** — add the same two vars under both **Production** and **Preview** environments.

---

## 5. Test the full flow

1. `npm run dev` (locally) or open the Cloudflare Pages preview URL.
2. Click **"Try it Now"** → routed to `/login`.
3. Click **"Continue with Google"** → consent → land on `/upload`.
4. Page shows the **paywall** because you're free.
5. Pick a plan → Dodo checkout opens.
6. Use Dodo test card `4242 4242 4242 4242` (any future date, any CVC).
7. Redirected to `/checkout/success` — within 1–2s the subscription activates and you're sent to `/upload`.
8. Refresh **/account** to see plan + "Manage billing" link to Dodo's portal.

If anything stalls, check:
- **Supabase → Functions → Logs** for `create-checkout` errors
- **Supabase → Database → Tables → webhook_events** for incoming webhooks (each has `processed` + `error_message`)
- **Browser console** for client-side errors
