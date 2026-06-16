alter table public.academies
  add column if not exists country_code text,
  add column if not exists discipline text,
  add column if not exists discipline_variant text,
  add column if not exists federation_config_version text,
  add column if not exists specialization_status text not null default 'legacy';

create index if not exists academies_country_code_idx on public.academies (country_code);
create index if not exists academies_discipline_variant_idx on public.academies (discipline_variant);

update public.academies
set
  country_code = case
    when country is null then null
    when lower(trim(country)) = 'es' then 'ES'
    when lower(trim(country)) = 'espana' then 'ES'
    when lower(trim(country)) = 'españa' then 'ES'
    when lower(trim(country)) = 'mx' then 'MX'
    when lower(trim(country)) = 'mexico' then 'MX'
    when lower(trim(country)) = 'méxico' then 'MX'
    when lower(trim(country)) = 'ar' then 'AR'
    when lower(trim(country)) = 'argentina' then 'AR'
    else upper(trim(country))
  end,
  discipline = case
    when academy_type = 'artistica' then 'artistic'
    when academy_type = 'ritmica' then 'rhythmic'
    when academy_type = 'trampolin' then 'trampoline'
    when academy_type = 'parkour' then 'parkour'
    when academy_type = 'danza' then 'dance'
    else 'general'
  end,
  discipline_variant = case
    when academy_type = 'artistica' then 'artistic_female'
    when academy_type = 'ritmica' then 'rhythmic'
    when academy_type = 'trampolin' then 'trampoline'
    when academy_type = 'parkour' then 'parkour'
    when academy_type = 'danza' then 'dance'
    else 'general'
  end,
  federation_config_version = case
    when (
      case
        when country is null then null
        when lower(trim(country)) = 'es' then 'ES'
        when lower(trim(country)) = 'espana' then 'ES'
        when lower(trim(country)) = 'españa' then 'ES'
        else upper(trim(country))
      end
    ) = 'ES' then 'rfeg-2026-v1'
    else 'legacy-default-v1'
  end,
  specialization_status = case
    when academy_type in ('artistica', 'ritmica') then 'inferred'
    else 'legacy'
  end
where
  country_code is null
  or discipline is null
  or discipline_variant is null
  or federation_config_version is null;
