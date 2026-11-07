-- Minimal public identity catalog required by Owner academy bootstrap.
-- These rows are authored application reference data, not copied from sandbox.
BEGIN;

INSERT INTO zaltyko.sport_profiles (
  country_code,
  discipline_key,
  federation_code,
  profile_version,
  status,
  configuration_schema_version,
  configuration
)
VALUES
  ('ES', 'artistic', 'unconfigured', 'identity-v1', 'identity_only', 1, '{}'::jsonb),
  ('ES', 'rhythmic', 'unconfigured', 'identity-v1', 'identity_only', 1, '{}'::jsonb)
ON CONFLICT (country_code, discipline_key, federation_code, profile_version)
DO NOTHING;

COMMIT;
