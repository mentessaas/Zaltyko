begin;

create table zaltyko.owner_dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_order text[] not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint owner_dashboard_layouts_organization_user_uq
    unique (organization_id, user_id),
  constraint owner_dashboard_layouts_order_cardinality
    check (cardinality(module_order) = 4),
  constraint owner_dashboard_layouts_version_positive check (version > 0)
);

alter table zaltyko.owner_dashboard_layouts enable row level security;
alter table zaltyko.owner_dashboard_layouts force row level security;

create policy owner_dashboard_layouts_select_self
on zaltyko.owner_dashboard_layouts
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from zaltyko.organization_members member
    where member.organization_id = owner_dashboard_layouts.organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'manager', 'admin')
  )
);

create policy owner_dashboard_layouts_insert_self
on zaltyko.owner_dashboard_layouts
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from zaltyko.organization_members member
    where member.organization_id = owner_dashboard_layouts.organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'manager', 'admin')
  )
);

create policy owner_dashboard_layouts_update_self
on zaltyko.owner_dashboard_layouts
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from zaltyko.organization_members member
    where member.organization_id = owner_dashboard_layouts.organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'manager', 'admin')
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from zaltyko.organization_members member
    where member.organization_id = owner_dashboard_layouts.organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'manager', 'admin')
  )
);

revoke all on table zaltyko.owner_dashboard_layouts from anon, authenticated;
grant select, insert, update on table zaltyko.owner_dashboard_layouts to authenticated;
grant all privileges on table zaltyko.owner_dashboard_layouts to service_role;

comment on table zaltyko.owner_dashboard_layouts is
  'Per-user presentation preference for the Owner Dashboard; it does not change authorization, metrics, or data scope.';

commit;
