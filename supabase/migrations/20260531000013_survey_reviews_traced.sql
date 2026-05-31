-- ============================================================================
-- Survey gender · Reviews · Traced-image capture · Streak own-rank
-- ============================================================================
-- Bundles several product additions. All idempotent.

-- ── 1. Survey: add a gender question ────────────────────────────────────────
alter table public.profiles
  add column if not exists survey_gender text;

drop function if exists public.record_survey(text, text[]);
drop function if exists public.record_survey(text, text[], text);
drop function if exists public.record_survey(text, text[], text, text);
create or replace function public.record_survey(
  p_age    text,
  p_draws  text[] default '{}',
  p_note   text   default null,
  p_gender text   default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_age    text;
  v_draws  text[];
  v_note   text;
  v_gender text;
begin
  if v_uid is null then return; end if;

  v_age := lower(trim(coalesce(p_age, '')));
  if v_age not in ('13-17','18-24','25-34','35-44','45+') then v_age := null; end if;

  v_gender := lower(trim(coalesce(p_gender, '')));
  if v_gender not in ('girl','boy','other') then v_gender := null; end if;

  select array_agg(d order by d) into v_draws
  from (
    select distinct lower(trim(x)) as d
    from unnest(coalesce(p_draws, '{}'::text[])) as x
    where lower(trim(x)) in (
      'anime','characters','animals','portraits','tattoos',
      'nature','lettering','fanart','other'
    )
    limit 8
  ) s;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 280 then
    v_note := substring(v_note from 1 for 280);
  end if;

  update public.profiles
     set survey_completed_at = now(),
         survey_age          = v_age,
         survey_gender       = v_gender,
         survey_draws        = coalesce(v_draws, '{}'::text[]),
         survey_note         = v_note
   where id = v_uid
     and survey_completed_at is null;
end $$;

revoke all    on function public.record_survey(text, text[], text, text) from public;
grant execute on function public.record_survey(text, text[], text, text) to authenticated;

-- ── 2. Reviews — stars + honest note, shown on its own admin page ───────────
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id)            -- one review per user; re-submitting updates it
);
create index if not exists reviews_created_idx on public.reviews (created_at desc);
alter table public.reviews enable row level security;

do $$ begin
  create policy reviews_admin_read on public.reviews for select
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy reviews_own on public.reviews for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create or replace function public.submit_review(p_rating int, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1–5';
  end if;
  if not public.check_rate_limit('submit_review:' || v_uid::text, 10, 3600) then
    raise exception 'Too many submissions, slow down.' using errcode = 'check_violation';
  end if;
  v_note := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  insert into public.reviews (user_id, rating, note)
  values (v_uid, p_rating, v_note)
  on conflict (user_id) do update set rating = excluded.rating, note = excluded.note, created_at = now();
end $$;

grant execute on function public.submit_review(int, text) to authenticated;

-- Admin reader: reviews joined with a safe display name (no email leak).
create or replace function public.get_reviews(p_limit int default 100)
returns table (
  id           uuid,
  rating       smallint,
  note         text,
  created_at   timestamptz,
  display_name text
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.rating, r.note, r.created_at,
         coalesce(nullif(p.display_name, ''), split_part(coalesce(p.email,'Artist'),'@',1)) as display_name
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  order by r.created_at desc
  limit greatest(1, least(p_limit, 500));
$$;

grant execute on function public.get_reviews(int) to authenticated;

-- ── 3. Traced-image capture — operator can see WHAT users trace ─────────────
-- A tiny optimized thumbnail of each traced reference, uploaded client-side on
-- studio entry. Public bucket (random uuid paths) + admin-read catalog.
create table if not exists public.traced_images (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  thumb_path   text not null,
  label        text,
  created_at   timestamptz not null default now()
);
create index if not exists traced_images_created_idx on public.traced_images (created_at desc);
alter table public.traced_images enable row level security;

do $$ begin
  create policy traced_images_owner_insert on public.traced_images for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy traced_images_admin_read on public.traced_images for select
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('traced', 'traced', true, 2097152, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif'];

do $$ begin
  create policy traced_obj_owner_write on storage.objects for insert
    with check (bucket_id = 'traced' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null; end $$;

-- Throttle capture inserts so a refresh loop can't flood storage.
create or replace function public.traced_images_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.check_rate_limit('traced_capture:' || coalesce(auth.uid()::text,'anon'), 60, 3600) then
    return null;  -- silently skip; capture is best-effort telemetry
  end if;
  if new.label is not null then new.label := nullif(left(btrim(new.label), 120), ''); end if;
  return new;
end $$;
drop trigger if exists traced_images_guard on public.traced_images;
create trigger traced_images_guard before insert on public.traced_images
  for each row execute function public.traced_images_guard();

-- Admin reader for the traced-images gallery.
create or replace function public.get_traced_images(p_limit int default 120, p_before timestamptz default null)
returns table (
  id           uuid,
  thumb_path   text,
  label        text,
  created_at   timestamptz,
  display_name text
)
language sql
security definer
set search_path = public
as $$
  select t.id, t.thumb_path, t.label, t.created_at,
         coalesce(nullif(p.display_name, ''), split_part(coalesce(p.email,'Artist'),'@',1)) as display_name
  from public.traced_images t
  left join public.profiles p on p.id = t.user_id
  where p_before is null or t.created_at < p_before
  order by t.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;

grant execute on function public.get_traced_images(int, timestamptz) to authenticated;

-- ── 4. Streak: caller's own rank (so users outside the top 20 see their spot) ─
create or replace function public.my_streak_rank()
returns table (rank bigint, current_streak integer, total integer)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select id,
           row_number() over (
             order by coalesce(current_streak,0) desc,
                      coalesce(longest_streak,0) desc,
                      first_trace_at asc nulls last
           ) as rnk,
           coalesce(current_streak,0) as cs
    from public.profiles
    where coalesce(is_admin,false) = false and coalesce(current_streak,0) > 0
  )
  select r.rnk as rank, r.cs as current_streak,
         (select count(*)::int from ranked) as total
  from ranked r
  where r.id = auth.uid();
$$;

grant execute on function public.my_streak_rank() to authenticated;
