-- Preserve the business-effective date separately from command execution time.
alter table zaltyko.enrollment_status_history
  add column effective_on date;

update zaltyko.enrollment_status_history
set effective_on = (changed_at at time zone 'UTC')::date
where effective_on is null;

alter table zaltyko.enrollment_status_history
  alter column effective_on set not null;

create index enrollment_status_history_effective_idx
  on zaltyko.enrollment_status_history (
    organization_id,
    enrollment_id,
    effective_on,
    changed_at
  );

-- A service lock protects normal commands; the database also enforces the
-- invariant against manual writers and future code paths.
create unique index enrollment_pauses_one_open_uq
  on zaltyko.enrollment_pauses (organization_id, enrollment_id)
  where ends_on is null;
