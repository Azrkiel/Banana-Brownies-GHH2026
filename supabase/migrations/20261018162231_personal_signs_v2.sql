-- Extend immutable private samples in place; no row conversion or deletion.
begin;
alter table public.personal_sign_samples
  drop constraint personal_sign_samples_feature_version_check,
  drop constraint personal_sign_samples_features_check,
  drop constraint personal_sign_samples_frames_with_hand_check,
  add column model_sha256 text,
  add constraint personal_sign_samples_v2_shape check (
    array_ndims(features) = 1 and array_position(features, null) is null and
    ((feature_version = 'word-v1' and cardinality(features) = 1260 and frames_with_hand between 24 and 30)
     or (feature_version = 'holistic-v2' and cardinality(features) = 5568 and frames_with_hand between 24 and 32)
     or (feature_version = 'holistic_v2_emb192' and cardinality(features) = 192 and frames_with_hand between 24 and 32
         and model_sha256 is not null and model_sha256 ~ '^[a-f0-9]{64}$'))
  );
create or replace function public.validate_personal_sign_sample() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  bound real;
  norm double precision;
begin
  bound := case new.feature_version when 'word-v1' then 2 when 'holistic-v2' then 20 else 1.001 end;
  if exists (select 1 from unnest(new.features) as feature
             where feature < -bound or feature > bound or feature = 'NaN'::real) then
    raise exception 'Invalid sign features' using errcode = '23514';
  end if;
  if new.feature_version = 'holistic_v2_emb192' then
    select sqrt(sum(feature::double precision * feature::double precision)) into norm from unnest(new.features) as feature;
    if norm is null or abs(norm - 1) > .02 then
      raise exception 'Invalid embedding norm' using errcode = '23514';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.personal_sign_samples where user_id = new.user_id) >= 500 then
    raise exception 'Sample limit reached (500). Delete an example before adding another.' using errcode = '23514';
  end if;
  return new;
end;
$$;
-- Existing grants, forced RLS, immutable rows, owner policies and quota remain.
revoke all on function public.validate_personal_sign_sample() from public;
commit;
