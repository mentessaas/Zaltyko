BEGIN;

CREATE TABLE IF NOT EXISTS academy_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted', 'cancelled')),
  granted_plan_code text NOT NULL DEFAULT 'pro' CHECK (granted_plan_code = 'pro'),
  source text NOT NULL DEFAULT 'self_serve',
  started_by uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  ended_at timestamptz,
  converted_at timestamptz,
  day_five_notified_at timestamptz,
  expiry_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academy_trials_academy_started_idx
  ON academy_trials (academy_id, started_at DESC);
CREATE INDEX IF NOT EXISTS academy_trials_tenant_status_idx
  ON academy_trials (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS academy_trials_active_academy_unique
  ON academy_trials (academy_id, status)
  WHERE status = 'active';

ALTER TABLE academy_trials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academy_trials_tenant_access" ON academy_trials;
CREATE POLICY "academy_trials_tenant_access" ON academy_trials
  FOR ALL USING (
    is_super_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = get_current_tenant()
  );

ALTER TABLE billing_events
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stripe_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_object_id text,
  ADD COLUMN IF NOT EXISTS livemode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS billing_events_object_type_idx
  ON billing_events (stripe_object_id, type);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS last_stripe_event_id text,
  ADD COLUMN IF NOT EXISTS last_stripe_event_created_at timestamptz;

COMMIT;
