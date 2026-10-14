begin;

create extension if not exists btree_gist;

-- Composite keys let historical invoice coverage prove that the line,
-- enrollment, athlete, class, assignment, plan, and location are the same row
-- scope. Existing rows are not rewritten.
alter table zaltyko.enrollments
  add constraint enrollments_billing_coverage_fk_uq
  unique (organization_id, location_id, athlete_id, class_template_id, id);

alter table zaltyko.enrollment_price_assignments
  add constraint enrollment_price_assignments_coverage_fk_uq
  unique (organization_id, location_id, price_plan_id, enrollment_id, id);

alter table zaltyko.invoices
  add constraint invoices_billing_line_location_fk_uq
  unique (organization_id, location_id, id);

alter table zaltyko.invoice_lines
  add column location_id uuid,
  add column athlete_id uuid;

alter table zaltyko.invoice_lines
  add constraint invoice_lines_location_fk
    foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  add constraint invoice_lines_athlete_fk
    foreign key (organization_id, athlete_id)
    references zaltyko.athletes (organization_id, id) on delete restrict,
  add constraint invoice_lines_athlete_monthly_shape
    check (
      athlete_id is null
      or (
        line_type = 'monthly_fee'
        and location_id is not null
        and price_plan_id is not null
        and enrollment_id is null
        and quantity = 1
        and service_period_start = date_trunc('month', service_period_start)::date
        and service_period_end = (
          date_trunc('month', service_period_start) + interval '1 month - 1 day'
        )::date
      )
    ),
  add constraint invoice_lines_location_invoice_fk
    foreign key (organization_id, location_id, invoice_id)
    references zaltyko.invoices (organization_id, location_id, id)
    on delete cascade;

create unique index invoice_lines_coverage_parent_fk_uq
  on zaltyko.invoice_lines (
    organization_id, location_id, athlete_id, price_plan_id, id
  );

create unique index invoice_lines_monthly_athlete_uq
  on zaltyko.invoice_lines (
    organization_id, invoice_id, athlete_id,
    service_period_start, service_period_end
  )
  where line_type = 'monthly_fee' and athlete_id is not null;

create table zaltyko.price_plan_class_template_coverage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  price_plan_id uuid not null,
  class_template_id uuid not null,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint price_plan_class_template_coverage_org_id_uq
    unique (organization_id, id),
  constraint price_plan_class_template_coverage_dates_valid
    check (ends_on is null or ends_on >= starts_on),
  constraint price_plan_class_template_coverage_location_fk
    foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint price_plan_class_template_coverage_plan_fk
    foreign key (organization_id, price_plan_id)
    references zaltyko.price_plans (organization_id, id) on delete restrict,
  constraint price_plan_class_template_coverage_template_fk
    foreign key (organization_id, location_id, class_template_id)
    references zaltyko.class_templates (organization_id, location_id, id)
    on delete restrict,
  constraint price_plan_class_template_coverage_no_overlap
    exclude using gist (
      organization_id with =,
      location_id with =,
      price_plan_id with =,
      class_template_id with =,
      daterange(starts_on, ends_on, '[]') with &&
    )
);

create index price_plan_class_template_coverage_lookup_idx
  on zaltyko.price_plan_class_template_coverage (
    organization_id, location_id, price_plan_id, class_template_id,
    starts_on, ends_on
  );

create table zaltyko.invoice_line_enrollments (
  organization_id uuid not null
    references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  athlete_id uuid not null,
  invoice_line_id uuid not null,
  price_plan_id uuid not null,
  enrollment_id uuid not null,
  class_template_id uuid not null,
  price_assignment_id uuid not null,
  class_name_snapshot text not null,
  created_at timestamptz not null default now(),
  constraint invoice_line_enrollments_pkey
    primary key (organization_id, invoice_line_id, enrollment_id),
  constraint invoice_line_enrollments_line_template_uq
    unique (organization_id, invoice_line_id, class_template_id),
  constraint invoice_line_enrollments_class_name_not_blank
    check (char_length(btrim(class_name_snapshot)) between 2 and 120),
  constraint invoice_line_enrollments_location_fk
    foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint invoice_line_enrollments_athlete_fk
    foreign key (organization_id, athlete_id)
    references zaltyko.athletes (organization_id, id) on delete restrict,
  constraint invoice_line_enrollments_line_fk
    foreign key (
      organization_id, location_id, athlete_id, price_plan_id, invoice_line_id
    )
    references zaltyko.invoice_lines (
      organization_id, location_id, athlete_id, price_plan_id, id
    ) on delete restrict,
  constraint invoice_line_enrollments_enrollment_fk
    foreign key (
      organization_id, location_id, athlete_id, class_template_id, enrollment_id
    )
    references zaltyko.enrollments (
      organization_id, location_id, athlete_id, class_template_id, id
    ) on delete restrict,
  constraint invoice_line_enrollments_class_template_fk
    foreign key (organization_id, location_id, class_template_id)
    references zaltyko.class_templates (organization_id, location_id, id)
    on delete restrict,
  constraint invoice_line_enrollments_price_assignment_fk
    foreign key (
      organization_id, location_id, price_plan_id, enrollment_id,
      price_assignment_id
    )
    references zaltyko.enrollment_price_assignments (
      organization_id, location_id, price_plan_id, enrollment_id, id
    ) on delete restrict
);

create index invoice_line_enrollments_enrollment_idx
  on zaltyko.invoice_line_enrollments (
    organization_id, location_id, enrollment_id
  );

create or replace function zaltyko_domain_private.prevent_invoice_line_enrollment_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'invoice line enrollment history is immutable';
end
$$;

revoke all on function zaltyko_domain_private.prevent_invoice_line_enrollment_mutation()
  from public, anon, authenticated, service_role;

create trigger invoice_line_enrollments_immutable_row
  before update or delete on zaltyko.invoice_line_enrollments
  for each row
  execute function zaltyko_domain_private.prevent_invoice_line_enrollment_mutation();

create trigger invoice_line_enrollments_immutable_truncate
  before truncate on zaltyko.invoice_line_enrollments
  for each statement
  execute function zaltyko_domain_private.prevent_invoice_line_enrollment_mutation();

alter table zaltyko.price_plan_class_template_coverage
  enable row level security;
alter table zaltyko.price_plan_class_template_coverage
  force row level security;
alter table zaltyko.invoice_line_enrollments
  enable row level security;
alter table zaltyko.invoice_line_enrollments
  force row level security;

create policy price_plan_class_template_coverage_deny_clients
  on zaltyko.price_plan_class_template_coverage
  for all to anon, authenticated
  using (false) with check (false);
create policy invoice_line_enrollments_deny_clients
  on zaltyko.invoice_line_enrollments
  for all to anon, authenticated
  using (false) with check (false);

revoke all on table
  zaltyko.price_plan_class_template_coverage,
  zaltyko.invoice_line_enrollments
from public, anon, authenticated, service_role;

grant select, insert, update on table
  zaltyko.price_plan_class_template_coverage
to service_role;
grant select, insert on table zaltyko.invoice_line_enrollments to service_role;

comment on table zaltyko.price_plan_class_template_coverage is
  'Effective-dated class coverage declared by a tariff within one organization and location.';
comment on table zaltyko.invoice_line_enrollments is
  'Immutable enrollment and class snapshots covered by one athlete monthly invoice line.';

commit;
