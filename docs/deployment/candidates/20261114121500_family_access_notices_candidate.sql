-- CANDIDATE ONLY. Not applied or approved for hosted databases.
-- Requiere autorización de Elvis antes de cualquier aplicación (staging o producción).
-- Familias: alta en el portal por invitación y avisos de sesión (2026-11-14).
-- Additive: four new relations. No change to existing tables, rows, roles or
-- legacy objects. The server writes guardians.auth_user_id and
-- family_guardians.can_view_athletes (both already exist) when an invitation
-- is accepted; nothing here grants a client role direct access.
-- Reapplication deliberately aborts before touching any existing object. A
-- partial/divergent installation requires human reconciliation, never repair.
do $family_access_candidate_preflight$
begin
  -- Single-column ON DELETE SET NULL (col) needs PostgreSQL 15+ (production: 17.6).
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Family access candidate requires PostgreSQL 15 or later; inspect existing schema before promotion';
  end if;
  if to_regclass('zaltyko.guardian_access_invitations') is not null
     or to_regclass('zaltyko.family_notices') is not null
     or to_regclass('zaltyko.family_notice_recipients') is not null
     or to_regclass('zaltyko.guardian_notification_preferences') is not null then
    raise exception 'Family access candidate requires all four new relations absent; inspect existing schema before promotion';
  end if;
  if to_regclass('zaltyko.guardians') is null or to_regclass('zaltyko.sessions') is null
     or to_regclass('zaltyko.groups') is null or to_regclass('zaltyko.class_templates') is null then
    raise exception 'Family access candidate requires the canonical domain installation; inspect existing schema before promotion';
  end if;
end;
$family_access_candidate_preflight$;

-- One-time invitation to the family portal, bound to one guardian of one
-- academy. Only the SHA-256 of the 32-byte token is stored. Acceptance requires
-- the signed-in account's verified email to equal normalized_email.
create table zaltyko.guardian_access_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  guardian_id uuid not null,
  normalized_email text not null check (normalized_email = lower(btrim(normalized_email)) and length(normalized_email) >= 3 and length(normalized_email) <= 254 and strpos(normalized_email,'@') > 1),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  grant_view_athletes boolean not null default false,
  -- Vínculos familia-tutor concretos (id y updated_at) que la academia vio al
  -- invitar. Al aceptar solo se concede ver gimnastas en esos vínculos y solo
  -- si no han cambiado desde entonces (custodia, orden judicial).
  grant_links jsonb not null default '[]'::jsonb check (jsonb_typeof(grant_links) = 'array' and jsonb_array_length(grant_links) <= 50),
  invited_by_member_id uuid,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revision integer not null default 1 check (revision > 0),
  last_sent_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_by_member_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, guardian_id) references zaltyko.guardians(organization_id, id) on delete cascade,
  -- Single-column SET NULL (PostgreSQL 15+): erasing a member keeps the
  -- academy's invitation history without nulling organization_id.
  foreign key (organization_id, invited_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (invited_by_member_id),
  foreign key (organization_id, revoked_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (revoked_by_member_id),
  check (
    (status = 'pending' and accepted_at is null and accepted_by_user_id is null and revoked_at is null)
    or (status = 'accepted' and accepted_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null and accepted_at is null and accepted_by_user_id is null)
  )
);
-- One pending invitation per guardian; expired pending rows count until an
-- explicit reissue rotates the token or a revoke closes them.
create unique index guardian_access_invitations_pending_uq
  on zaltyko.guardian_access_invitations(organization_id, guardian_id) where status = 'pending';
create index guardian_access_invitations_guardian_idx
  on zaltyko.guardian_access_invitations(organization_id, guardian_id, created_at);

-- A notice the academy sends to families: a cancelled, rescheduled or
-- substituted session, or a manual message to one class or one group.
create table zaltyko.family_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  kind text not null check (kind in ('session_cancelled', 'session_rescheduled', 'session_substitution', 'manual')),
  session_id uuid,
  class_template_id uuid,
  group_id uuid,
  title text not null check (length(btrim(title)) >= 1 and length(title) <= 140),
  body text not null check (length(btrim(body)) >= 1 and length(body) <= 2000),
  dedupe_key text not null check (dedupe_key ~ '^[0-9a-f]{64}$'),
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, dedupe_key),
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  -- NO ACTION on purpose: sessions are cancelled by status, never deleted
  -- (tests/zaltyko-sessions-never-deleted.test.ts); templates and groups are
  -- archived by status as well.
  foreign key (organization_id, session_id) references zaltyko.sessions(organization_id, id),
  foreign key (organization_id, class_template_id) references zaltyko.class_templates(organization_id, id),
  foreign key (organization_id, group_id) references zaltyko.groups(organization_id, id),
  foreign key (organization_id, created_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (created_by_member_id),
  check (
    (kind = 'manual' and session_id is null and ((class_template_id is not null and group_id is null) or (class_template_id is null and group_id is not null)))
    or (kind <> 'manual' and session_id is not null and class_template_id is not null and group_id is null)
  )
);
create index family_notices_organization_created_idx
  on zaltyko.family_notices(organization_id, created_at desc);

-- One row per guardian the notice was addressed to: portal read receipt and
-- email outcome. No email address is stored here.
create table zaltyko.family_notice_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  notice_id uuid not null,
  guardian_id uuid not null,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed', 'skipped_preference', 'skipped_no_account')),
  -- Intentos de envío: un correo fallido vuelve a intentarse (lotes y cron)
  -- hasta 3 veces antes de quedar en 'failed'.
  email_attempts integer not null default 0 check (email_attempts >= 0 and email_attempts <= 20),
  email_attempted_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, notice_id, guardian_id),
  foreign key (organization_id, notice_id) references zaltyko.family_notices(organization_id, id) on delete cascade,
  foreign key (organization_id, guardian_id) references zaltyko.guardians(organization_id, id) on delete cascade
);
create index family_notice_recipients_guardian_idx
  on zaltyko.family_notice_recipients(organization_id, guardian_id, created_at desc);
-- Cola de correos pendientes (lotes de la petición y cron de reintento).
create index family_notice_recipients_pending_idx
  on zaltyko.family_notice_recipients(created_at, id) where email_status = 'pending';

-- Email preferences a family sets in the portal. A missing row means the
-- defaults (both true). The portal notice is always recorded.
create table zaltyko.guardian_notification_preferences (
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  guardian_id uuid not null,
  email_session_changes boolean not null default true,
  email_manual_notices boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, guardian_id),
  foreign key (organization_id, guardian_id) references zaltyko.guardians(organization_id, id) on delete cascade
);

alter table zaltyko.guardian_access_invitations enable row level security;
alter table zaltyko.guardian_access_invitations force row level security;
alter table zaltyko.family_notices enable row level security;
alter table zaltyko.family_notices force row level security;
alter table zaltyko.family_notice_recipients enable row level security;
alter table zaltyko.family_notice_recipients force row level security;
alter table zaltyko.guardian_notification_preferences enable row level security;
alter table zaltyko.guardian_notification_preferences force row level security;
revoke all on table zaltyko.guardian_access_invitations, zaltyko.family_notices,
  zaltyko.family_notice_recipients, zaltyko.guardian_notification_preferences from public, anon, authenticated;
-- No direct-client policy or grant: verified server transactions are the writer.
