CREATE TABLE IF NOT EXISTS academy_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  target_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_by_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_profile_role profile_role NOT NULL,
  requested_membership_role membership_role NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academy_link_requests_academy_status_idx
  ON academy_link_requests(academy_id, status);

CREATE INDEX IF NOT EXISTS academy_link_requests_target_status_idx
  ON academy_link_requests(target_profile_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS academy_link_requests_pending_unique
  ON academy_link_requests(academy_id, target_profile_id)
  WHERE status = 'pending';
