begin;

create unique index group_memberships_organization_id_id_uq
  on zaltyko.group_memberships (organization_id, id);

create table zaltyko.group_membership_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  membership_id uuid not null,
  from_status zaltyko.group_membership_status,
  to_status zaltyko.group_membership_status not null,
  reason_code text,
  changed_by_member_id uuid not null,
  idempotency_key text not null,
  effective_on date not null,
  changed_at timestamptz not null default now(),
  constraint group_membership_history_idempotency_uq
    unique (organization_id, idempotency_key),
  constraint group_membership_history_idempotency_not_blank
    check (btrim(idempotency_key) <> ''),
  constraint group_membership_history_reason_code_valid
    check (reason_code is null or reason_code in (
      'academy_request', 'family_request', 'athlete_request',
      'schedule_change', 'temporary_pause', 'other'
    )),
  constraint group_membership_history_membership_fk
    foreign key (organization_id, membership_id)
    references zaltyko.group_memberships (organization_id, id) on delete cascade,
  constraint group_membership_history_member_fk
    foreign key (organization_id, changed_by_member_id)
    references zaltyko.organization_members (organization_id, id) on delete restrict
);

create index group_membership_history_membership_idx
  on zaltyko.group_membership_history (organization_id, membership_id, changed_at);
create index group_membership_history_effective_idx
  on zaltyko.group_membership_history (
    organization_id, membership_id, effective_on, changed_at
  );

drop policy group_memberships_select_member on zaltyko.group_memberships;
create policy group_memberships_select_member
on zaltyko.group_memberships
for select to authenticated
using (
  exists (
    select 1
    from zaltyko.groups group_row
    where group_row.organization_id = group_memberships.organization_id
      and group_row.id = group_memberships.group_id
      and (select zaltyko_domain_private.has_location_access(
        group_row.organization_id, group_row.location_id
      ))
  )
);

alter table zaltyko.group_membership_history enable row level security;
alter table zaltyko.group_membership_history force row level security;
alter table zaltyko.group_memberships enable row level security;
alter table zaltyko.group_memberships force row level security;

create policy group_membership_history_select_member
on zaltyko.group_membership_history
for select to authenticated
using (
  exists (
    select 1
    from zaltyko.group_memberships membership
    join zaltyko.groups group_row
      on group_row.organization_id = membership.organization_id
     and group_row.id = membership.group_id
    where membership.organization_id = group_membership_history.organization_id
      and membership.id = group_membership_history.membership_id
      and (select zaltyko_domain_private.has_location_access(
        group_row.organization_id, group_row.location_id
      ))
  )
);

revoke all on table zaltyko.group_memberships from public, anon, authenticated, service_role;
revoke all on table zaltyko.group_membership_history from public, anon, authenticated, service_role;
grant select on table zaltyko.group_memberships to authenticated;
grant select on table zaltyko.group_membership_history to authenticated;
grant select, insert, update on table zaltyko.group_memberships to service_role;
grant select, insert on table zaltyko.group_membership_history to service_role;

comment on table zaltyko.group_membership_history is
  'Append-only temporal history for canonical many-to-many athlete-group membership.';

commit;
