-- ZAL-336 / ZAL-157: persist the first landing path with signup attribution.
-- Additive and idempotent. This migration is versioned but intentionally not
-- applied to any remote environment by this task.

BEGIN;

ALTER TABLE "academies"
  ADD COLUMN IF NOT EXISTS "utm_landing_path" text;

CREATE INDEX IF NOT EXISTS "academies_utm_landing_path_idx"
  ON "academies" ("utm_landing_path");

COMMENT ON COLUMN "academies"."utm_landing_path" IS
  'ZAL-157: first landing path where valid signup UTMs were captured.';

COMMIT;
