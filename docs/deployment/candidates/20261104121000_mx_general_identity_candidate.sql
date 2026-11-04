-- REVIEW CANDIDATE ONLY: sandbox delivery, never production by inference.
-- Hosted execution requires exact target revalidation and separate approval.
begin;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM zaltyko.sport_profiles
    WHERE country_code = 'MX'
      AND discipline_key = 'general'
      AND federation_code = 'unconfigured'
      AND profile_version = 'identity-v1'
      AND (
        status IS DISTINCT FROM 'identity_only'::zaltyko.sport_profile_status
        OR configuration_schema_version IS DISTINCT FROM 1
        OR configuration IS DISTINCT FROM '{}'::jsonb
      )
  ) THEN
    RAISE EXCEPTION
      'MX general identity profile exists with an unexpected shape';
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
    'general',
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

  IF NOT EXISTS (
    SELECT 1
    FROM zaltyko.sport_profiles
    WHERE country_code = 'MX'
      AND discipline_key = 'general'
      AND federation_code = 'unconfigured'
      AND profile_version = 'identity-v1'
      AND status = 'identity_only'
      AND configuration_schema_version = 1
      AND configuration = '{}'::jsonb
  ) THEN
    RAISE EXCEPTION
      'MX general identity profile was not created in the expected shape';
  END IF;
END
$migration$;

commit;
