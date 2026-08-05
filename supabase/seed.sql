-- ZAL-336 [E2E] — Seed for the claim-preservation test scenario.
--
-- Pre-creates one academy row whose contactEmail matches a known user
-- that the Playwright suite will register during the test, AND whose
-- utm_* columns are already populated (simulating "the academy arrived
-- with first-touch attribution from a previous campaign"). The claim
-- flow MUST preserve those UTM values when the owner signs up.
--
-- The owner_id is set to a sentinel placeholder; the claim path will
-- reasign it to the newly created profile via `academies.owner_id =
-- profile.id` (see owner-claim.ts). The placeholder profile is created
-- to satisfy the NOT NULL FK constraint.

DO $$
DECLARE
  sentinel_profile_id uuid := '00000000-0000-0000-0000-0000000000aa';
  sentinel_tenant_id  uuid := '00000000-0000-0000-0000-0000000000bb';
BEGIN
  INSERT INTO profiles (id, user_id, tenant_id, name, role, can_login)
  VALUES (
    sentinel_profile_id,
    '00000000-0000-0000-0000-0000000000a0',  -- placeholder auth user
    sentinel_tenant_id,
    'ZAL-336 Seed Owner',
    'owner',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO academies (
    id,
    tenant_id,
    owner_id,
    name,
    academy_type,
    country,
    region,
    city,
    contact_email,
    contact_phone,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    utm_landing_path,
    utm_captured_at,
    canal_registro
  )
  VALUES (
    '00000000-0000-0000-0000-0000000000c1',
    sentinel_tenant_id,
    sentinel_profile_id,
    'ZAL-336 Pre-Registered Demo',
    'artistica',
    'España',
    'Madrid',
    'Madrid',
    -- Email that the E2E will use to register and trigger the claim flow.
    -- MUST match in lowercase to satisfy `findClaimableAcademyByEmail`.
    'zal336-preserved@zaltyko.test',
    '+34600000000',
    -- Existing first-touch attribution that must NOT be overwritten on claim.
    'instagram',
    'social',
    'summer_awareness_2026',
    'madrid',
    'hero_v1',
    '/es/trampolin/espana',
    now() - interval '7 days',
    'social'
  )
  ON CONFLICT (id) DO NOTHING;
END $$;