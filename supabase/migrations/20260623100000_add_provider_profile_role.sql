DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'provider'
      AND enumtypid = 'profile_role'::regtype
  ) THEN
    ALTER TYPE profile_role ADD VALUE 'provider';
  END IF;
END $$;
