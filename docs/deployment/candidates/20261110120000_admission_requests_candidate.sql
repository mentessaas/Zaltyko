-- CANDIDATE ONLY. Requires Elvis's explicit authorization before any hosted apply.
-- P2 #15: trial requests from the public academy link (docs/producto/embudo-captacion.md).
-- Additive: one new relation; no legacy tables, rows, roles or existing objects change.
-- Reapplication deliberately aborts before touching anything. A partial or
-- divergent installation requires human reconciliation, never repair.
do $admission_candidate_preflight$
begin
  if to_regclass('zaltyko.admission_requests') is not null then
    raise exception 'Admission candidate requires zaltyko.admission_requests absent; inspect existing schema before promotion';
  end if;
end;
$admission_candidate_preflight$;

create table zaltyko.admission_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  submission_id uuid not null,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'converted', 'waitlisted', 'declined')),
  contact_name text not null
    check (length(btrim(contact_name)) between 2 and 100),
  contact_email text not null
    check (contact_email = lower(btrim(contact_email)) and length(contact_email) between 3 and 254 and strpos(contact_email, '@') > 1),
  contact_phone text
    check (contact_phone is null or length(btrim(contact_phone)) between 6 and 40),
  athlete_given_name text not null
    check (length(btrim(athlete_given_name)) between 1 and 60),
  athlete_birth_year integer
    check (athlete_birth_year is null or athlete_birth_year between 1940 and 2100),
  message text
    check (message is null or length(message) <= 500),
  privacy_consent_version text not null
    check (privacy_consent_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  privacy_consent_at timestamptz not null,
  converted_athlete_id uuid,
  waitlist_entry_id uuid,
  handled_by_member_id uuid,
  handled_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, submission_id),
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  foreign key (organization_id, converted_athlete_id) references zaltyko.athletes(organization_id, id),
  foreign key (organization_id, location_id, waitlist_entry_id) references zaltyko.waitlist_entries(organization_id, location_id, id),
  foreign key (organization_id, handled_by_member_id) references zaltyko.organization_members(organization_id, id),
  check (
    (status = 'new' and handled_by_member_id is null and handled_at is null and converted_athlete_id is null and waitlist_entry_id is null)
    or (status in ('contacted', 'declined') and handled_by_member_id is not null and handled_at is not null and converted_athlete_id is null and waitlist_entry_id is null)
    or (status = 'converted' and handled_by_member_id is not null and handled_at is not null and converted_athlete_id is not null and waitlist_entry_id is null)
    or (status = 'waitlisted' and handled_by_member_id is not null and handled_at is not null and converted_athlete_id is not null and waitlist_entry_id is not null)
  )
);

create index admission_requests_inbox_idx
  on zaltyko.admission_requests(organization_id, location_id, status, created_at);

alter table zaltyko.admission_requests enable row level security;
alter table zaltyko.admission_requests force row level security;
revoke all on table zaltyko.admission_requests from public, anon, authenticated;
-- No direct-client policy or grant: verified server transactions are the only writer.
-- Contact data belongs to the academy (controller); Zaltyko processes it on its behalf.
