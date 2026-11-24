-- ADR-0029 phase D: permit academy-owned copies imported from a verified
-- federation template. This candidate changes only the allowed source value.
-- Review the existing constraint before promotion; do not apply automatically.
BEGIN;

DO $$
DECLARE
  existing text;
BEGIN
  IF to_regclass('zaltyko.skill_templates') IS NULL THEN
    RAISE EXCEPTION 'Expected zaltyko.skill_templates; inspect the installed schema before applying this candidate';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO existing
    FROM pg_constraint
   WHERE conrelid = 'zaltyko.skill_templates'::regclass
     AND conname = 'skill_templates_source_check';

  IF existing IS NULL THEN
    RAISE EXCEPTION 'Expected skill_templates_source_check; inspect the installed constraint before applying this candidate';
  END IF;

  IF existing NOT LIKE '%federation%' THEN
    ALTER TABLE zaltyko.skill_templates DROP CONSTRAINT skill_templates_source_check;
    ALTER TABLE zaltyko.skill_templates
      ADD CONSTRAINT skill_templates_source_check
      CHECK (source IN ('blank', 'starter', 'copy', 'federation'));
  END IF;
END $$;

COMMIT;
