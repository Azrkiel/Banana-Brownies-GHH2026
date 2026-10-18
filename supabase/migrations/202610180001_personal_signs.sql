-- Run in the Supabase SQL editor or with `supabase db push`.
-- Each sample is immutable. Retraining uses only the signed-in user's examples.
begin;

create table public.personal_sign_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null check (label ~ '^[A-Z][A-Z0-9 ''-]{0,39}$' and label = trim(label)),
  feature_version text not null default 'word-v1' check (feature_version = 'word-v1'),
  features real[] not null check (array_ndims(features) = 1 and cardinality(features) = 1260
    and array_position(features, null) is null),
  frames_with_hand smallint not null check (frames_with_hand between 24 and 30),
  created_at timestamptz not null default now()
);

-- Element bounds and per-account quota are checked by the insert trigger below.
create index personal_sign_samples_owner_created on public.personal_sign_samples(user_id, created_at, id);

create function public.validate_personal_sign_sample() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.features) as feature where feature < -2 or feature > 2 or feature = 'NaN'::real) then
    raise exception 'Invalid sign features' using errcode = '23514';
  end if;
  -- Serialize inserts per account so concurrent requests cannot evade the limit.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.personal_sign_samples where user_id = new.user_id) >= 500 then
    raise exception 'Sample limit reached (500). Delete an example before adding another.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_personal_sign_sample before insert on public.personal_sign_samples
  for each row execute function public.validate_personal_sign_sample();

alter table public.personal_sign_samples enable row level security;
alter table public.personal_sign_samples force row level security;
revoke all on public.personal_sign_samples from anon, authenticated;
grant select, insert, delete on public.personal_sign_samples to authenticated;
create policy own_samples_select on public.personal_sign_samples for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_samples_insert on public.personal_sign_samples for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_samples_delete on public.personal_sign_samples for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke all on function public.validate_personal_sign_sample() from public;

commit;
