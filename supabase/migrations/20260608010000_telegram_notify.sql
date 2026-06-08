-- =============================================================================
-- Telegram notifications — ping the operator's Telegram on key live events.
-- =============================================================================
-- Same pg_net pattern as the email notifications, but pointed at the
-- telegram-notify Edge Function (Bot API). Fires on:
--   * new visitor   — AFTER INSERT on analytics_visitors (the upsert only
--     INSERTs for a genuinely new visitor; returning visitors hit ON CONFLICT
--     → UPDATE, which does NOT fire this trigger).
--   * signup        — AFTER INSERT on profiles.
--   * start tracing — AFTER INSERT on trace_session_runs (operator/excluded
--     accounts skipped so the chat isn't pinged by your own testing).
--
-- All trigger bodies swallow errors so a notification hiccup can NEVER break
-- ingest / signup / trace. Inert until app_settings.telegram_fn_url is set AND
-- the function has TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID secrets.
-- =============================================================================

-- ── poster ───────────────────────────────────────────────────────────────────
create or replace function public.notify_telegram(p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from public.app_settings where key = 'telegram_fn_url';
  select value into v_secret from public.app_settings where key = 'notify_fn_secret';
  if v_url is null or v_url = '' then return; end if;  -- not configured → no-op
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-notify-secret', coalesce(v_secret, '')
    ),
    body    := jsonb_build_object('event', p_event) || coalesce(p_payload, '{}'::jsonb)
  );
exception when others then
  raise warning '[notify_telegram] %', sqlerrm;
end $$;

revoke all on function public.notify_telegram(text, jsonb) from public;

-- ── new visitor ──────────────────────────────────────────────────────────────
create or replace function public.tg_telegram_visitor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_telegram('visitor', to_jsonb(NEW));
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists analytics_visitors_telegram on public.analytics_visitors;
create trigger analytics_visitors_telegram
  after insert on public.analytics_visitors
  for each row execute function public.tg_telegram_visitor();

-- ── signup ───────────────────────────────────────────────────────────────────
create or replace function public.tg_telegram_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_telegram('signup', jsonb_build_object(
    'email',        NEW.email,
    'display_name', NEW.display_name,
    'source',       NEW.signup_source,
    'created_at',   NEW.created_at
  ));
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists profiles_telegram_signup on public.profiles;
create trigger profiles_telegram_signup
  after insert on public.profiles
  for each row execute function public.tg_telegram_signup();

-- ── start tracing ────────────────────────────────────────────────────────────
create or replace function public.tg_telegram_trace()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_skip  boolean;
begin
  select email, (coalesce(is_admin, false) or coalesce(exclude_from_analytics, false))
    into v_email, v_skip
    from public.profiles where id = NEW.user_id;
  if coalesce(v_skip, false) then return NEW; end if;  -- skip operator/excluded
  perform public.notify_telegram('trace_start', jsonb_build_object(
    'email',       v_email,
    'image_label', NEW.image_label,
    'started_at',  NEW.started_at
  ));
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists trace_runs_telegram on public.trace_session_runs;
create trigger trace_runs_telegram
  after insert on public.trace_session_runs
  for each row execute function public.tg_telegram_trace();

-- ── point the poster at the deployed function ────────────────────────────────
insert into public.app_settings (key, value)
values ('telegram_fn_url', 'https://gihmcbggfpogmisxvqyf.supabase.co/functions/v1/telegram-notify')
on conflict (key) do update set value = excluded.value, updated_at = now();
