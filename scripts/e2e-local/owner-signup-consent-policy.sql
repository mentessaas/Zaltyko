-- Synthetic policy data for the disposable local E2E database only.
-- Never apply this fixture to Supabase sandbox or production.
INSERT INTO zaltyko.owner_signup_consent_policy (
  singleton,
  policy_version
)
VALUES (
  true,
  'v1-2026-10-25'
)
ON CONFLICT (singleton)
DO UPDATE SET
  policy_version = EXCLUDED.policy_version,
  rollout_at = clock_timestamp();
