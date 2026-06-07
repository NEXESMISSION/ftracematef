# Trace Mate — Scalability Audit & Benchmark Scorecard

> Goal: can the webapp handle **tens of thousands of users** cleanly? Method: 8
> parallel subsystem deep-audits (DB, edge functions, frontend load, React
> runtime, realtime/presence, analytics pipeline, concurrency, caching/cost/
> resilience) → adversarial verification of every critical/high finding →
> calibrated /10 scoring. Findings cross-checked against **live production
> database metrics** (`pg_stat_user_tables`, `pg_stat_statements`).
>
> Date: 2026-06-07 · Today's scale: ~175 profiles, 60 analytics visitors.

## Overall: **4.6 / 10** (weighted)

Works comfortably today, but **cannot reach 10k–50k concurrent users without
two structural changes**: the realtime connection model and analytics
retention/rollup. None of the issues corrupt data — they are
capacity/latency/cost failures — and most fixes are low-effort.

Weighting: user-facing-breakage benchmarks **B1, B2, B3, B4, B7 ×2**; the rest ×1.
`(2·(4+5+6+2+3) + 1·(6+6+7+5+5+6+4)) / (2·5 + 7) = 79/17 = 4.6`

---

## Benchmark scorecard

| # | Benchmark | Score | One-line justification |
|---|---|:---:|---|
| **B1** | Database scalability | **4/10** | Hot point-reads/writes are indexed, but presence writes churn the hot `profiles` table and `analytics_events`/`page_visits`/`rate_limits` grow with **no scheduled pruning**. |
| **B2** | Backend / edge-function scalability | **5/10** | Good fail-closed/idempotent fundamentals, but `get_analytics_overview` full-scans an ever-growing firehose, `ingest-events` **blocks on a synchronous `ipwho.is` call**, and `admin-list-users` over-fetches. |
| **B3** | Concurrency & data integrity | **6/10** | Webhook claim + lifetime advisory lock are genuinely race-safe; gaps are the non-atomic subscription cancel-then-insert and a missing unique backstop on `dodo_payment_id` (medium, not catastrophic). |
| **B4** | Realtime & presence scalability | **2/10** | **The dominant 10k risk.** Every signed-in tab opens a persistent Realtime WebSocket; exceeds the Supabase connection cap ~20×. Saved from 0–1 only by a graceful REST-polling fallback. |
| **B5** | Frontend load performance | **6/10** | Excellent route-level JS code-splitting, dragged down by a 192 KB (33 KB gz) monolithic CSS bundle and the full `supabase-js` client on the anonymous landing path. |
| **B6** | Frontend runtime efficiency | **6/10** | Trace gesture pipeline is the best-engineered code in the app; bounded costs from admin 5s/30s timers and per-run 1s `LiveDuration` intervals. |
| **B7** | Analytics pipeline scalability | **3/10** | Thoughtful batching/dedup/caching, undermined by unbounded firehose growth, uncapped per-session click events, a NAT-shared per-IP rate limit, and no rollup table on the read path. |
| **B8** | Caching & CDN efficiency | **7/10** | Strong immutable hashed assets, SWR images, no-store `version.json`, PWA precache; main gap is public Storage feed images egressing with no CDN in front. |
| **B9** | Abuse resistance & security at scale | **5/10** | Consistently fail-closed per-key rate limits + good RLS, but the per-IP ingest limit clips CGNAT/mobile clusters and unique-index violations surface as raw 500s. |
| **B10** | Resilience & graceful degradation | **5/10** | Client-side timeouts/backoff/idle-stop + idempotent webhook are good; server-side Dodo/`ipwho.is` calls have no timeout/circuit-breaker. |
| **B11** | Observability & operability | **6/10** | Robust webhook claim/dedupe + a live health panel, but alerting is daily-batch (>24 h), no-ops silently if unconfigured, and nothing watches geo/ingest error rates. |
| **B12** | Cost scalability | **4/10** | Response sizes mostly bounded, but five tables grow without retention, plus persistent Realtime connections and uncached storage egress drive cost linearly with usage. |

---

## 🔴 Live production evidence (hard numbers behind the scores)

Pulled directly from the prod DB during the audit — these confirm the findings
aren't theoretical:

- **Realtime is already the busiest thing in the database.** The two
  highest-call queries are Supabase Realtime's WAL polling: **~972,000 + 83,000
  calls** (`SELECT wal->>...`) at 5.4 ms mean. At 175 users it already dominates;
  this is what saturates first at 10k concurrent. → **B4**
- **Per-request hot paths ARE properly indexed** (softens the seq-scan alarm):
  `subscriptions WHERE user_id` = 7,146 calls @ **0.24 ms**; `profiles.is_admin
  WHERE id` = 7,028 calls @ **0.13 ms**. So the 65.5%-seq-scan figure on
  `subscriptions` is Postgres correctly preferring a seq-scan on a tiny 181-row
  table + operator-only aggregate queries (`get_admin_stats`), **not** a
  user-facing hot path. → **B1** (calibrated up from the raw stat).
- **`trace_session_runs`** (the trace heartbeat): 9,197 seq scans / 664 K tuples
  read / 59.7% seq. **`profiles`**: 14,844 seq / 1.36 M tuples. → **B1/B3** presence churn.
- **`page_visits`** writes at **5.16 ms × ~9,500 calls**, 1,783 rows, **no
  retention** — a per-navigation write that grows with all traffic. → **B1/B7/B12**
- **`rate_limits`** 444 rows, **no prune**; **`analytics_events`** 1,040 rows /
  2.7 MB *today* (post-cleanup) — so the firehose risk is about **growth rate**,
  not current size, matching the "slow-burn" verdict. → **B7/B12**

---

## 🚧 The blockers (must fix before 10k users)

Ordered by impact. Severity = post-verification (claims were downgraded where the
code didn't fully support them).

### 1. Every signed-in tab holds a persistent Realtime WebSocket — connection cap exceeded ~20× · `severity: high`
`src/auth/AuthProvider.jsx:657-697` opens `supabase.channel('subs:${userId}')`
with `postgres_changes` listeners, keyed on `session.user.id`, so it fires for
**every** authenticated tab. Supabase Realtime defaults ~200 (Free) / ~500 (Pro)
concurrent connections; 10k tabs ≈ 20× over. Past the cap, tabs get
`CHANNEL_ERROR`/`TIMED_OUT` and fall back to 4 s REST polling
(`AuthProvider.jsx:607-644`) — shedding realtime *and* hammering REST at once.
**Prod confirms realtime is already the #1 DB workload.**
**Fix:** scope the subscription-flip channel to the checkout/account window;
keep only the lightweight single-session takeover watch persistent; load-test the
plan's ceiling and request an Enterprise raise before launch.

### 2. `analytics_events` firehose grows unbounded — `prune_analytics` defined but never scheduled · `severity: high`
`supabase/migrations/20260601000000_super_analytics.sql:507` exists but is
self-described as "a retention valve for a future cron" — the only scheduled
crons are the daily digest and stuck-webhook alert. One row per
click/scroll/rage/pageview for **every anonymous visitor**, nothing deletes →
table + 4 indexes grow without bound; every rollup and autovacuum slows; disk fills.
**Fix:** `cron.schedule('prune-analytics','0 3 * * *', $$ select public.prune_analytics(90); $$)`
(batched first run); ideally monthly range-partition `created_at` so retention = `DROP PARTITION`.

### 3. Presence heartbeats churn the hot `profiles` table · `severity: medium` *(downgraded from high — the realtime fan-out amplification was refuted: `profiles` is not in the realtime publication)*
`touch_last_seen` (60 s, `AuthProvider.jsx:781-842`) + `heartbeat_trace_run`
(30 s, `Trace.jsx:620`) `UPDATE profiles` with no skip-when-unchanged guard, and
`last_seen_at` is indexed (defeats HOT → dead tuple + index write each tick) on
the most widely-joined table. At 10k users that's sustained MVCC/autovacuum
pressure slowing every leaderboard/feed/admin join.
**Fix:** move volatile presence (`last_seen_at`, `current_page`, `current_run_id`)
to a thin dedicated table (`fillfactor 70`, no extra indexes) or Realtime Presence;
add a write-skip fast path; decouple the trace heartbeat from `profiles`.

### 4. `ingest-events` blocks on a synchronous `ipwho.is` geo lookup on the highest-QPS path · `severity: high`
`supabase/functions/ingest-events/index.ts:133-181` (`resolveGeo`) is awaited
*before* persisting events. On a cache miss (every new/stale IP) it blocks up to
2.5 s on a no-SLA free provider. A traffic spike is mostly cache-misses exactly
when load is highest → thousands of 2.5 s-held isolates exhaust the function's
concurrency and `ipwho.is` throttles the project IP.
**Fix:** persist events immediately with null geo and resolve `ip_hash`es
asynchronously; add a circuit breaker (cooldown after N failures); lengthen geo TTL.

### 5. `get_analytics_overview` re-aggregates the whole window ~13 ways with no rollup · `severity: medium` *(downgraded — admin-only, triple-gated, 60/min, 7-day default; funnel-distortion sub-claim refuted)*
`20260604010000_exclude_accounts_from_analytics.sql:34-218` builds one CTE then
runs ~10 `count(distinct)` group-bys + funnel/pwa/lifetime passes; `count(distinct)`
can't use indexes for grouping, and the `'all'` (3650-day) range over a large
firehose is the tail risk (multi-second queries pinning a core).
**Fix:** daily rollup table refreshed by cron; read the rollup for ranges >1 day,
scan raw events only for the live 5-min slice; cache the jsonb a few minutes; cap the max window.

---

## 🟡 High-value next tier (confirmed medium)

- **Unbounded `rate_limits` / `page_visits` / `analytics_ip_geo` / `webhook_events`** — bundle one nightly maintenance cron (delete `rate_limits` <1 day, `page_visits` >90 days, `webhook_events` processed >30 days).
- **Non-atomic subscription cancel-then-insert** (`dodo-webhook/index.ts:699-714`) — two un-transactioned calls can hit `subscriptions_one_active_per_user` and surface as a raw 500 → Dodo retry. Move into a security-definer fn under a per-user advisory lock; catch 23505.
- **No unique backstop on `subscriptions.dodo_payment_id`** — add `create unique index ... where dodo_payment_id is not null` as defense-in-depth.
- **Post-commit refund can strand a charge** (`dodo-webhook/index.ts:478-498`) — persist a `needs_refund` flag and drain via reconciliation (mirror `needs_dodo_cancel`).
- **Monolithic 192 KB CSS on landing** (`main.jsx:9-22`) — move `trace.css`/`live.css`/`community.css` imports into their lazy components.
- **Full `supabase-js` on the anonymous critical path** (`vite.config.js:67-69`) — defer client init / use a lightweight session check (note: AuthProvider must resolve session before first paint for the Home redirect, so this is non-trivial).
- **Per-IP ingest limit clips CGNAT/mobile** (`ingest-events/index.ts:239-242`) — add a `visitor_id` bucket dimension or raise the cap.
- **`admin-list-users` silently truncates** past 1000 subscription rows — filter `status='active'`/scope to displayed ids.
- **Main-thread image pipeline** (`imageOptimize.js`, `watermark.js`, `recorder.js`) — move decode/encode to OffscreenCanvas/Worker; pre-render the watermark once.
- **Uncached public storage egress** (`creations.js:18-19`) — front the bucket with a CDN + immutable `Cache-Control` + responsive `srcset`.
- **Alerting gaps** — lower the stuck-webhook threshold to 1–2 h hourly, self-check when unscheduled, add ingest/geo error-rate alerts.

---

## ✅ What's already good (don't touch)

- **Payment correctness is genuinely robust** — race-safe webhook claim (unique `webhook_id`), lifetime grants serialized under a txn-scoped advisory lock with `payment_id` idempotency + atomic seat-cap, referral commissions `charge_key`-unique.
- **Rate limiting is consistently fail-closed and per-key** (`allowed !== true`) — no global contention, no fail-open window.
- **Route-level JS code splitting is well executed** — heavy routes lazy with stale-chunk reload guard; `cobe`/social-login/`removeBackground` confined to lazy chunks.
- **The Trace studio gesture pipeline** uses rAF-coalesced imperative DOM writes with no per-pointermove setState — the hottest interactive path is the best code in the app.
- **Static caching/CSP hygiene is strong** — immutable hashed assets, SWR images, no-store `version.json`, vendor chunk split, PWA precache.
- **Client-side resilience** — every `functions.invoke` wrapped in `withTimeout`, `friendlyError` mapping, realtime polling fallback with backoff + idle stop, ErrorBoundary.

---

## 🗺️ Remediation roadmap

**This week (cheap, high-leverage — stops the bleeding):**
1. Schedule `prune_analytics(90)` via `pg_cron` (one do-block migration). → B7/B12
2. Nightly maintenance cron deleting stale `rate_limits` / old `page_visits` / processed `webhook_events`. → B1/B12
3. Partial unique index on `subscriptions.dodo_payment_id`; treat 23505 as `'duplicate'`. → B3
4. Fix `admin-list-users` truncation (filter `status='active'`). → B2 correctness

**This month (structural pressure):**
5. Move presence off `profiles` into a thin presence table + write-skip fast path; decouple the trace heartbeat. → B1/B3
6. Take geo off the `ingest-events` synchronous path + circuit breaker. → B2/B10
7. Daily analytics rollup table; `get_analytics_overview` reads it for wide ranges + caches. → B7/B2
8. Make subscription cancel-then-insert atomic; persist `needs_refund`. → B3/B9/B10
9. Split the monolithic CSS per-route; keep supabase-js off the anonymous path. → B5

**Before launch (the hard ceiling):**
10. **Re-architect Realtime** — scope the subscription channel to checkout/account, keep only the takeover watch persistent, load-test the connection ceiling, negotiate an Enterprise raise. *This is the gating item.* → B4
11. CDN in front of public storage; lower alert thresholds + add ingest/geo error-rate alerting. → B8/B11/B12

After the **week + month** tiers: expect B7→6, B1→6, B2→7, B3→8, B12→6 (overall into the ~6 range). B4 stays at 2 until the Realtime re-architecture lands, after which **overall reaches ~7 — solid for 10k–50k users.**
