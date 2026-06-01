-- =============================================================================
-- One-shot cleanup: remove the post-deploy smoke-test row.
-- =============================================================================
-- Right after the super-analytics pipeline went live we POSTed a single
-- synthetic batch to /functions/v1/ingest-events to confirm the end-to-end path
-- (CORS → IP hash → geo → ingest_analytics_batch → insert) returned 204. That
-- inserted one fake visitor + two events whose source/ua is the literal
-- 'smoketest'. This deletes them so the dashboard starts from genuinely clean,
-- real traffic only. Idempotent: a no-op on any environment that never received
-- the smoke test.
-- =============================================================================

delete from public.analytics_events   where source = 'smoketest';
delete from public.analytics_visitors where source = 'smoketest' or ua = 'smoketest';
