begin;

create type zaltyko.family_relationship as enum (
  'parent', 'legal_guardian', 'foster_guardian', 'other'
);
create type zaltyko.guardian_contact_kind as enum ('email', 'phone');
create type zaltyko.contact_consent_status as enum (
  'unknown', 'granted', 'denied', 'revoked'
);
create type zaltyko.trial_status as enum (
  'booked', 'attended', 'completed', 'no_show', 'cancelled', 'converted'
);
create type zaltyko.trial_followup_channel as enum (
  'email', 'phone', 'sms', 'in_person'
);
create type zaltyko.trial_followup_outcome as enum (
  'contacted', 'no_answer', 'converted', 'waitlisted',
  'not_interested', 'follow_up_needed'
);
create type zaltyko.waitlist_status as enum (
  'waiting', 'offered', 'converted', 'withdrawn', 'expired'
);
create type zaltyko.waitlist_offer_status as enum (
  'pending', 'accepted', 'declined', 'expired', 'revoked'
);

create table zaltyko.families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  external_reference text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint families_organization_id_id_uq unique (organization_id, id)
);
create index families_organization_active_idx
  on zaltyko.families (organization_id, is_active);

create table zaltyko.guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  person_id uuid not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardians_organization_person_uq unique (organization_id, person_id),
  constraint guardians_organization_auth_user_uq unique (organization_id, auth_user_id),
  constraint guardians_organization_id_id_uq unique (organization_id, id),
  constraint guardians_person_fk foreign key (organization_id, person_id)
    references zaltyko.people (organization_id, id) on delete restrict
);
create index guardians_auth_user_idx on zaltyko.guardians (auth_user_id);

create table zaltyko.guardian_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  guardian_id uuid not null,
  kind zaltyko.guardian_contact_kind not null,
  value text not null check (btrim(value) <> ''),
  normalized_value text not null check (btrim(normalized_value) <> ''),
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_contacts_value_uq
    unique (organization_id, guardian_id, kind, normalized_value),
  constraint guardian_contacts_guardian_fk foreign key (organization_id, guardian_id)
    references zaltyko.guardians (organization_id, id) on delete cascade
);
create unique index guardian_contacts_primary_kind_uq
  on zaltyko.guardian_contacts (organization_id, guardian_id, kind)
  where is_primary;

create table zaltyko.family_guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  family_id uuid not null,
  guardian_id uuid not null,
  relationship zaltyko.family_relationship not null,
  can_view_athletes boolean not null default true,
  can_manage_enrollments boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_guardians_family_guardian_uq
    unique (organization_id, family_id, guardian_id),
  constraint family_guardians_family_fk foreign key (organization_id, family_id)
    references zaltyko.families (organization_id, id) on delete cascade,
  constraint family_guardians_guardian_fk foreign key (organization_id, guardian_id)
    references zaltyko.guardians (organization_id, id) on delete cascade
);

create table zaltyko.family_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  family_id uuid not null,
  athlete_id uuid not null,
  relationship zaltyko.family_relationship not null,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_members_dates_valid check (ends_on is null or ends_on >= starts_on),
  constraint family_members_family_fk foreign key (organization_id, family_id)
    references zaltyko.families (organization_id, id) on delete cascade,
  constraint family_members_athlete_fk foreign key (organization_id, athlete_id)
    references zaltyko.athletes (organization_id, id) on delete restrict
);
create unique index family_members_one_open_uq
  on zaltyko.family_members (organization_id, family_id, athlete_id)
  where ends_on is null;
create index family_members_athlete_idx
  on zaltyko.family_members (organization_id, athlete_id, ends_on);

create table zaltyko.family_payers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  family_id uuid not null,
  guardian_id uuid not null,
  is_primary boolean not null default false,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_payers_dates_valid check (ends_on is null or ends_on >= starts_on),
  constraint family_payers_family_guardian_uq
    unique (organization_id, family_id, guardian_id, starts_on),
  constraint family_payers_family_guardian_link_fk
    foreign key (organization_id, family_id, guardian_id)
    references zaltyko.family_guardians (organization_id, family_id, guardian_id)
    on delete restrict
);
create unique index family_payers_one_primary_uq
  on zaltyko.family_payers (organization_id, family_id)
  where is_primary and ends_on is null;
create index family_payers_guardian_idx
  on zaltyko.family_payers (organization_id, guardian_id, ends_on);

-- Location is repeated deliberately so RLS and compound foreign keys reject a
-- trial, offer, or enrollment accidentally attached to another location.
create unique index sessions_organization_location_id_uq
  on zaltyko.sessions (organization_id, location_id, id);
create unique index class_templates_organization_location_id_uq
  on zaltyko.class_templates (organization_id, location_id, id);
create unique index enrollments_organization_location_id_uq
  on zaltyko.enrollments (organization_id, location_id, id);

create table zaltyko.trials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  athlete_id uuid not null,
  session_id uuid not null,
  trial_enrollment_id uuid not null,
  converted_enrollment_id uuid,
  status zaltyko.trial_status not null default 'booked',
  version integer not null default 1 check (version > 0),
  booked_at timestamptz not null default now(),
  attended_at timestamptz,
  completed_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trials_organization_id_id_uq unique (organization_id, id),
  constraint trials_organization_location_id_uq unique (organization_id, location_id, id),
  constraint trials_enrollment_uq unique (organization_id, trial_enrollment_id),
  constraint trials_athlete_session_uq unique (organization_id, athlete_id, session_id),
  constraint trials_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint trials_athlete_fk foreign key (organization_id, athlete_id)
    references zaltyko.athletes (organization_id, id) on delete restrict,
  constraint trials_session_fk foreign key (organization_id, location_id, session_id)
    references zaltyko.sessions (organization_id, location_id, id) on delete restrict,
  constraint trials_trial_enrollment_fk
    foreign key (organization_id, location_id, trial_enrollment_id)
    references zaltyko.enrollments (organization_id, location_id, id) on delete restrict,
  constraint trials_converted_enrollment_fk
    foreign key (organization_id, location_id, converted_enrollment_id)
    references zaltyko.enrollments (organization_id, location_id, id) on delete restrict
);
create index trials_location_status_idx
  on zaltyko.trials (organization_id, location_id, status, booked_at);

create table zaltyko.trial_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  trial_id uuid not null,
  from_status zaltyko.trial_status,
  to_status zaltyko.trial_status not null,
  effective_at timestamptz not null,
  changed_by_member_id uuid,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  changed_at timestamptz not null default now(),
  constraint trial_status_history_idempotency_uq
    unique (organization_id, idempotency_key),
  constraint trial_status_history_trial_fk
    foreign key (organization_id, location_id, trial_id)
    references zaltyko.trials (organization_id, location_id, id) on delete cascade,
  constraint trial_status_history_member_fk foreign key (organization_id, changed_by_member_id)
    references zaltyko.organization_members (organization_id, id) on delete restrict
);
create index trial_status_history_trial_idx
  on zaltyko.trial_status_history (organization_id, trial_id, effective_at, changed_at);

create table zaltyko.trial_followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  trial_id uuid not null,
  channel zaltyko.trial_followup_channel not null,
  outcome zaltyko.trial_followup_outcome not null,
  completed_by_member_id uuid,
  completed_at timestamptz not null,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null default now(),
  constraint trial_followups_idempotency_uq unique (organization_id, idempotency_key),
  constraint trial_followups_trial_fk
    foreign key (organization_id, location_id, trial_id)
    references zaltyko.trials (organization_id, location_id, id) on delete cascade,
  constraint trial_followups_member_fk foreign key (organization_id, completed_by_member_id)
    references zaltyko.organization_members (organization_id, id) on delete restrict
);
create index trial_followups_trial_completed_idx
  on zaltyko.trial_followups (organization_id, trial_id, completed_at);

create table zaltyko.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  athlete_id uuid not null,
  class_template_id uuid,
  program_id uuid,
  source_trial_id uuid,
  contact_guardian_id uuid,
  contactable boolean not null default false,
  contact_consent_status zaltyko.contact_consent_status not null default 'unknown',
  contact_consent_recorded_at timestamptz,
  priority integer not null default 0 check (priority >= 0),
  preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object'),
  status zaltyko.waitlist_status not null default 'waiting',
  converted_enrollment_id uuid,
  joined_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_entries_target_required check (
    (class_template_id is not null and program_id is null)
    or (class_template_id is null and program_id is not null)
  ),
  constraint waitlist_entries_contactable_valid check (
    not contactable
    or (contact_guardian_id is not null and contact_consent_status = 'granted')
  ),
  constraint waitlist_entries_consent_timestamp_valid check (
    contact_consent_status = 'unknown' or contact_consent_recorded_at is not null
  ),
  constraint waitlist_entries_organization_id_id_uq unique (organization_id, id),
  constraint waitlist_entries_organization_location_id_uq
    unique (organization_id, location_id, id),
  constraint waitlist_entries_location_fk foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint waitlist_entries_athlete_fk foreign key (organization_id, athlete_id)
    references zaltyko.athletes (organization_id, id) on delete restrict,
  constraint waitlist_entries_template_fk
    foreign key (organization_id, location_id, class_template_id)
    references zaltyko.class_templates (organization_id, location_id, id) on delete restrict,
  constraint waitlist_entries_program_fk foreign key (organization_id, program_id)
    references zaltyko.programs (organization_id, id) on delete restrict,
  constraint waitlist_entries_source_trial_fk
    foreign key (organization_id, location_id, source_trial_id)
    references zaltyko.trials (organization_id, location_id, id) on delete restrict,
  constraint waitlist_entries_contact_guardian_fk
    foreign key (organization_id, contact_guardian_id)
    references zaltyko.guardians (organization_id, id) on delete restrict,
  constraint waitlist_entries_converted_enrollment_fk
    foreign key (organization_id, location_id, converted_enrollment_id)
    references zaltyko.enrollments (organization_id, location_id, id) on delete restrict
);
create unique index waitlist_entries_open_template_uq
  on zaltyko.waitlist_entries (organization_id, athlete_id, class_template_id)
  where class_template_id is not null and status in ('waiting', 'offered');
create unique index waitlist_entries_open_program_uq
  on zaltyko.waitlist_entries (organization_id, location_id, athlete_id, program_id)
  where program_id is not null and status in ('waiting', 'offered');
create index waitlist_entries_actionable_idx
  on zaltyko.waitlist_entries (
    organization_id,
    location_id,
    status,
    contactable,
    priority desc,
    joined_at
  );

create table zaltyko.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  waitlist_entry_id uuid not null,
  class_template_id uuid not null,
  reserved_enrollment_id uuid not null,
  status zaltyko.waitlist_offer_status not null default 'pending',
  sent_at timestamptz not null,
  expires_at timestamptz not null,
  responded_at timestamptz,
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_offers_dates_valid check (expires_at > sent_at),
  constraint waitlist_offers_idempotency_uq unique (organization_id, idempotency_key),
  constraint waitlist_offers_organization_id_id_uq unique (organization_id, id),
  constraint waitlist_offers_entry_fk
    foreign key (organization_id, location_id, waitlist_entry_id)
    references zaltyko.waitlist_entries (organization_id, location_id, id) on delete cascade,
  constraint waitlist_offers_template_fk
    foreign key (organization_id, location_id, class_template_id)
    references zaltyko.class_templates (organization_id, location_id, id) on delete restrict,
  constraint waitlist_offers_enrollment_fk
    foreign key (organization_id, location_id, reserved_enrollment_id)
    references zaltyko.enrollments (organization_id, location_id, id) on delete restrict
);
create unique index waitlist_offers_one_pending_uq
  on zaltyko.waitlist_offers (organization_id, waitlist_entry_id)
  where status = 'pending';
create index waitlist_offers_expiry_idx
  on zaltyko.waitlist_offers (organization_id, status, expires_at);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'families', 'guardians', 'guardian_contacts', 'family_guardians',
    'family_members', 'family_payers', 'trials', 'trial_status_history',
    'trial_followups', 'waitlist_entries', 'waitlist_offers'
  ]
  loop
    execute format('alter table zaltyko.%I enable row level security', target_table);
    execute format('alter table zaltyko.%I force row level security', target_table);
  end loop;
end
$$;

create policy families_select_member on zaltyko.families
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy guardians_select_member on zaltyko.guardians
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy guardian_contacts_select_member on zaltyko.guardian_contacts
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy family_guardians_select_member on zaltyko.family_guardians
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy family_members_select_member on zaltyko.family_members
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));
create policy family_payers_select_member on zaltyko.family_payers
for select to authenticated
using ((select zaltyko_private.has_organization_access(organization_id)));

create policy trials_select_scoped on zaltyko.trials
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));
create policy trial_status_history_select_scoped on zaltyko.trial_status_history
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));
create policy trial_followups_select_scoped on zaltyko.trial_followups
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));
create policy waitlist_entries_select_scoped on zaltyko.waitlist_entries
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));
create policy waitlist_offers_select_scoped on zaltyko.waitlist_offers
for select to authenticated
using ((select zaltyko_private.has_location_access(organization_id, location_id)));

revoke all on table
  zaltyko.families,
  zaltyko.guardians,
  zaltyko.guardian_contacts,
  zaltyko.family_guardians,
  zaltyko.family_members,
  zaltyko.family_payers,
  zaltyko.trials,
  zaltyko.trial_status_history,
  zaltyko.trial_followups,
  zaltyko.waitlist_entries,
  zaltyko.waitlist_offers
from anon, authenticated;

grant all privileges on table
  zaltyko.families,
  zaltyko.guardians,
  zaltyko.guardian_contacts,
  zaltyko.family_guardians,
  zaltyko.family_members,
  zaltyko.family_payers,
  zaltyko.trials,
  zaltyko.trial_status_history,
  zaltyko.trial_followups,
  zaltyko.waitlist_entries,
  zaltyko.waitlist_offers
to service_role;

commit;
