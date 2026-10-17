begin;

create table zaltyko.organization_bootstrap_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 150),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid not null,
  location_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  constraint organization_bootstrap_commands_user_key_uq
    unique (user_id, idempotency_key),
  constraint organization_bootstrap_commands_organization_fk
    foreign key (organization_id) references zaltyko.organizations(id) on delete cascade,
  constraint organization_bootstrap_commands_location_fk
    foreign key (organization_id, location_id)
      references zaltyko.locations(organization_id, id) on delete cascade,
  constraint organization_bootstrap_commands_member_fk
    foreign key (organization_id, member_id)
      references zaltyko.organization_members(organization_id, id) on delete cascade
);

comment on table zaltyko.organization_bootstrap_commands is
  'Idempotent clean-start command receipts. Contains technical identifiers only.';

alter table zaltyko.organization_bootstrap_commands enable row level security;
alter table zaltyko.organization_bootstrap_commands force row level security;

revoke all on table zaltyko.organization_bootstrap_commands
  from public, anon, authenticated;
grant select, insert, update, delete on table zaltyko.organization_bootstrap_commands
  to service_role;

commit;
