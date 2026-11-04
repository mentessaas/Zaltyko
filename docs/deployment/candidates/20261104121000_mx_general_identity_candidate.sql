-- REVIEW CANDIDATE ONLY: sandbox delivery, never production by inference.
-- Hosted execution requires exact target revalidation and separate approval.
begin;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES ('artistic'), ('rhythmic')) AS expected(discipline_key)
    JOIN zaltyko.sport_profiles profile
      ON profile.country_code = 'MX'
     AND profile.discipline_key = expected.discipline_key
     AND profile.federation_code = 'unconfigured'
     AND profile.profile_version = 'identity-v1'
    WHERE profile.status IS DISTINCT FROM 'identity_only'::zaltyko.sport_profile_status
       OR profile.configuration_schema_version IS DISTINCT FROM 1
       OR profile.configuration IS DISTINCT FROM '{}'::jsonb
  ) THEN
    RAISE EXCEPTION
      'MX disciplinary identity profile exists with an unexpected shape';
  END IF;

  INSERT INTO zaltyko.sport_profiles (
    country_code,
    discipline_key,
    federation_code,
    profile_version,
    status,
    configuration_schema_version,
    configuration
  )
  VALUES (
    'MX',
    'artistic',
    'unconfigured',
    'identity-v1',
    'identity_only',
    1,
    '{}'::jsonb
  ), (
    'MX',
    'rhythmic',
    'unconfigured',
    'identity-v1',
    'identity_only',
    1,
    '{}'::jsonb
  )
  ON CONFLICT (
    country_code,
    discipline_key,
    federation_code,
    profile_version
  ) DO NOTHING;

  IF (
    SELECT count(*)
    FROM zaltyko.sport_profiles
    WHERE country_code = 'MX'
      AND discipline_key IN ('artistic', 'rhythmic')
      AND federation_code = 'unconfigured'
      AND profile_version = 'identity-v1'
      AND status = 'identity_only'
      AND configuration_schema_version = 1
      AND configuration = '{}'::jsonb
  ) <> 2 THEN
    RAISE EXCEPTION
      'MX disciplinary identity profiles were not created in the expected shape';
  END IF;
END
$migration$;

commit;
