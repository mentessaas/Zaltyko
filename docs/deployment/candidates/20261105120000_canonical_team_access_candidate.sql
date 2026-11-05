-- CANDIDATE ONLY. Not applied or approved for hosted databases.
-- Additive phase 1: invitation lifecycle only; no legacy tables or profile links.
-- Inspect provenance, backup, grants and all constraints before any promotion.
-- Reapplication deliberately aborts before touching any existing object. A
-- partial/divergent installation requires human reconciliation, never repair.
do $team_candidate_preflight$
begin
  if to_regclass('zaltyko.organization_member_invitations') is not null
     or to_regclass('zaltyko.organization_member_invitation_scopes') is not null
     or to_regclass('zaltyko.organization_team_command_receipts') is not null then
    raise exception 'Team candidate requires all three new relations absent; inspect existing schema before promotion';
  end if;
end;
$team_candidate_preflight$;
create table zaltyko.organization_member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  normalized_email text not null check (normalized_email = lower(btrim(normalized_email)) and length(normalized_email) between 3 and 254 and position('@' in normalized_email) > 1),
  role zaltyko.member_role not null check (role in ('manager', 'coach')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by_member_id uuid not null,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revision integer not null default 1 check (revision > 0),
  accepted_by_user_id uuid references auth.users(id),
  accepted_member_id uuid,
  accepted_at timestamptz,
  revoked_by_member_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, invited_by_member_id) references zaltyko.organization_members(organization_id,id),
  foreign key (organization_id, accepted_member_id) references zaltyko.organization_members(organization_id,id),
  foreign key (organization_id, revoked_by_member_id) references zaltyko.organization_members(organization_id,id),
  check (
    (status = 'pending' and accepted_by_user_id is null and accepted_member_id is null and accepted_at is null and revoked_by_member_id is null and revoked_at is null)
    or (status = 'accepted' and accepted_by_user_id is not null and accepted_member_id is not null and accepted_at is not null and revoked_by_member_id is null and revoked_at is null)
    or (status = 'revoked' and accepted_by_user_id is null and accepted_member_id is null and accepted_at is null and revoked_by_member_id is not null and revoked_at is not null)
  )
);
-- Deliberately includes expired pending invitations: only explicit reissue rotates.
create unique index organization_member_invitations_pending_email_uq
  on zaltyko.organization_member_invitations(organization_id,normalized_email) where status='pending';
create index organization_member_invitations_organization_idx
  on zaltyko.organization_member_invitations(organization_id,id);

create table zaltyko.organization_member_invitation_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  invitation_id uuid not null,
  location_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id,invitation_id,location_id),
  foreign key (organization_id,invitation_id) references zaltyko.organization_member_invitations(organization_id,id) on delete cascade,
  foreign key (organization_id,location_id) references zaltyko.locations(organization_id,id)
);

create table zaltyko.organization_team_command_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  operation text not null check (operation in ('invite','reissue','revoke','accept')),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  invitation_id uuid not null,
  invitation_status text not null check (invitation_status in ('pending','accepted','revoked')),
  invitation_revision integer not null check (invitation_revision > 0),
  invitation_expires_at timestamptz not null,
  member_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id,actor_user_id,idempotency_key),
  foreign key (organization_id,invitation_id) references zaltyko.organization_member_invitations(organization_id,id),
  foreign key (organization_id,member_id) references zaltyko.organization_members(organization_id,id),
  check ((operation='accept' and invitation_status='accepted' and member_id is not null)
    or (operation in ('invite','reissue') and invitation_status='pending' and member_id is null)
    or (operation='revoke' and invitation_status='revoked' and member_id is null))
);

alter table zaltyko.organization_member_invitations enable row level security;
alter table zaltyko.organization_member_invitations force row level security;
alter table zaltyko.organization_member_invitation_scopes enable row level security;
alter table zaltyko.organization_member_invitation_scopes force row level security;
alter table zaltyko.organization_team_command_receipts enable row level security;
alter table zaltyko.organization_team_command_receipts force row level security;
revoke all on table zaltyko.organization_member_invitations, zaltyko.organization_member_invitation_scopes,
  zaltyko.organization_team_command_receipts from public, anon, authenticated;
-- No direct-client policy or grant: verified server transactions are the writer.
