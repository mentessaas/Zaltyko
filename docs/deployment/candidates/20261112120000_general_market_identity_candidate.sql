-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (sandbox o producción). No aplicado en ningún entorno.
-- Alta abierta a cualquier país (decisión de producto del 12-11-2026).
-- Aditivo: crea una sola función en zaltyko_domain_private; no cambia tablas,
-- filas existentes, restricciones, roles ni objetos legacy, y no siembra
-- países por adelantado.
--
-- Por qué una función y no un perfil genérico: organization_sports exige el
-- mismo country_code en la organización y en el perfil deportivo
-- (organization_sports_country_fk y organization_sports_profile_fk), así que un
-- país reservado común no encaja sin cambiar esas claves. En su lugar, el alta
-- de un país del nivel general crea, solo si falta, el perfil de identidad
-- vacío de ese país y disciplina, con la misma forma que los de ES y MX:
-- federation_code 'unconfigured', profile_version 'identity-v1', status
-- 'identity_only', configuration_schema_version 1 y configuration '{}'. Sin
-- reglas federativas, categorías ni requisitos de ningún país.
--
-- España y México quedan fuera: sus perfiles son datos revisados y la función
-- se niega a tocarlos. Solo admite las disciplinas del alta (artistic,
-- rhythmic). SECURITY INVOKER: no eleva privilegios; la ejecuta el servidor
-- con su propio rol. Sin EXECUTE para public, anon ni authenticated.
-- Reinstalar aborta antes de tocar nada.
do $general_market_identity_candidate_preflight$
begin
  if to_regclass('zaltyko.sport_profiles') is null then
    raise exception 'General market identity candidate requires zaltyko.sport_profiles';
  end if;
  if to_regnamespace('zaltyko_domain_private') is null then
    raise exception 'General market identity candidate requires the zaltyko_domain_private schema';
  end if;
  if to_regprocedure('zaltyko_domain_private.ensure_general_identity_sport_profile(text,text)') is not null then
    raise exception 'General market identity candidate requires ensure_general_identity_sport_profile(text,text) absent; inspect existing schema before promotion';
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'zaltyko.sport_profiles'::regclass
      and conname = 'sport_profiles_version_uq'
      and contype = 'u'
  ) then
    raise exception 'General market identity candidate requires the sport_profiles_version_uq unique constraint';
  end if;
end;
$general_market_identity_candidate_preflight$;

create function zaltyko_domain_private.ensure_general_identity_sport_profile(
  p_country_code text,
  p_discipline_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $ensure_general_identity_sport_profile$
declare
  v_profile_id uuid;
begin
  if p_country_code is null or p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'General identity profile requires an ISO 3166-1 alpha-2 country code'
      using errcode = '22023';
  end if;
  if p_country_code in ('ES', 'MX') then
    raise exception 'ES and MX sport profiles are reviewed data and are not provisioned here'
      using errcode = '22023';
  end if;
  if p_discipline_key is null or p_discipline_key not in ('artistic', 'rhythmic') then
    raise exception 'General identity profile supports only artistic and rhythmic'
      using errcode = '22023';
  end if;

  insert into zaltyko.sport_profiles (
    country_code,
    discipline_key,
    federation_code,
    profile_version,
    status,
    configuration_schema_version,
    configuration
  )
  values (
    p_country_code,
    p_discipline_key,
    'unconfigured',
    'identity-v1',
    'identity_only'::zaltyko.sport_profile_status,
    1,
    '{}'::jsonb
  )
  on conflict (country_code, discipline_key, federation_code, profile_version)
  do nothing;

  select profile.id
  into v_profile_id
  from zaltyko.sport_profiles profile
  where profile.country_code = p_country_code
    and profile.discipline_key = p_discipline_key
    and profile.federation_code = 'unconfigured'
    and profile.profile_version = 'identity-v1'
    and profile.status = 'identity_only'::zaltyko.sport_profile_status
    and profile.configuration_schema_version = 1
    and profile.configuration = '{}'::jsonb;

  -- null: ya existe un perfil con otra forma (por ejemplo, con reglas). No se
  -- modifica; el alta, que solo acepta perfiles de identidad vacíos, falla
  -- cerrada con 422 y sin escrituras.
  return v_profile_id;
end;
$ensure_general_identity_sport_profile$;

comment on function zaltyko_domain_private.ensure_general_identity_sport_profile(text, text) is
  'Creates, only if missing, the empty identity-only sport profile of a general-market country (not ES/MX) for artistic or rhythmic. No federation rules.';

revoke all on function zaltyko_domain_private.ensure_general_identity_sport_profile(text, text)
  from public, anon, authenticated;
grant execute on function zaltyko_domain_private.ensure_general_identity_sport_profile(text, text)
  to service_role;
