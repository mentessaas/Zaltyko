-- Vuelta atrás de 20261114120000_account_erasure_candidate.sql. Requiere
-- autorización de Elvis, como el candidato. Aplicar en una sola transacción:
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f 20261114120000_account_erasure_rollback.sql
-- Restaura las claves, las columnas NOT NULL, los CHECK y las funciones de
-- solo inserción tal como estaban, y retira los triggers de autor obligatorio.
-- Vale también si el paso de validación no llegó a ejecutarse. No borra ni
-- inventa datos: si ya se ha suprimido alguna cuenta (hay filas con la
-- referencia vacía que el esquema anterior no admite), aborta antes de tocar
-- nada. En ese caso no hay vuelta
-- atrás sin decidir qué hacer con esas filas; nunca se rellenan con otra cuenta.
set local lock_timeout = '3s';

do $account_erasure_rollback_preflight$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'zaltyko.organization_members'::regclass and conname = 'organization_members_user_id_fkey' and confdeltype = 'n'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'zaltyko.organization_members'::regclass and conname = 'organization_members_erased_account_revoked_ck'
  ) then
    raise exception 'Account erasure rollback requires the installed account erasure candidate; inspect existing schema before rollback';
  end if;
  if exists (select 1 from zaltyko.organization_members where user_id is null)
     or exists (select 1 from zaltyko.insight_actions where actor_user_id is null)
     or exists (select 1 from zaltyko.payments where source = 'manual' and recorded_by_user_id is null)
     or exists (select 1 from zaltyko.organization_member_invitations where status = 'accepted' and accepted_by_user_id is null) then
    raise exception 'Account erasure rollback refused: accounts were already erased (rows with an emptied account reference exist)';
  end if;
  if exists (select 1 from public.directory_grants where approved_by is null)
     or exists (select 1 from public.directory_claims where user_id is null)
     or exists (select 1 from public.announcements where author_id is null)
     or exists (select 1 from public.conversation_messages where sender_id is null)
     or exists (select 1 from public.invitations where invited_by is null)
     or exists (select 1 from public.event_registrations where profile_id is null)
     or exists (select 1 from public.ticket_responses where user_id is null)
     or exists (select 1 from public.ticket_attachments where uploaded_by is null) then
    raise exception 'Account erasure rollback refused: accounts were already erased (rows with an emptied account reference exist)';
  end if;
end;
$account_erasure_rollback_preflight$;

alter table zaltyko.organization_members
  drop constraint organization_members_erased_account_revoked_ck,
  drop constraint organization_members_user_id_fkey,
  add constraint organization_members_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
alter table zaltyko.organization_members alter column user_id set not null;

alter table zaltyko.payments
  drop constraint payments_recorded_by_user_id_fkey,
  add constraint payments_recorded_by_user_id_fkey
    foreign key (recorded_by_user_id) references auth.users(id) on delete restrict,
  drop constraint payments_source_fields_valid,
  add constraint payments_source_fields_valid check (
    (source = 'provider' and processor is not null and btrim(processor) <> '' and environment is not null
      and provider_payment_id is not null and btrim(provider_payment_id) <> '' and manual_method is null
      and recorded_by_user_id is null)
    or (source = 'manual' and processor is null and environment is null and provider_payment_id is null
      and manual_method is not null and recorded_by_user_id is not null)
  );

alter table zaltyko.insight_actions
  drop constraint insight_actions_actor_user_id_fkey,
  add constraint insight_actions_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete restrict;
alter table zaltyko.insight_actions alter column actor_user_id set not null;

alter table zaltyko.organization_member_invitations
  drop constraint organization_member_invitations_accepted_by_user_id_fkey,
  add constraint organization_member_invitations_accepted_by_user_id_fkey
    foreign key (accepted_by_user_id) references auth.users(id);
do $account_erasure_rollback_invitation_check$
declare
  check_name text;
begin
  select conname into strict check_name from pg_constraint
  where conrelid = 'zaltyko.organization_member_invitations'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%''accepted''::text) AND (accepted_member_id IS NOT NULL)%';
  execute format('alter table zaltyko.organization_member_invitations drop constraint %I, add constraint %I check (%s)',
    check_name, check_name,
    '(status = ''pending'' and accepted_by_user_id is null and accepted_member_id is null and accepted_at is null and revoked_by_member_id is null and revoked_at is null)'
    || ' or (status = ''accepted'' and accepted_by_user_id is not null and accepted_member_id is not null and accepted_at is not null and revoked_by_member_id is null and revoked_at is null)'
    || ' or (status = ''revoked'' and accepted_by_user_id is null and accepted_member_id is null and accepted_at is null and revoked_by_member_id is not null and revoked_at is not null)');
end;
$account_erasure_rollback_invitation_check$;
alter table zaltyko.organization_team_command_receipts
  drop constraint organization_team_command_receipts_actor_user_id_fkey,
  add constraint organization_team_command_receipts_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id);

create or replace function zaltyko_domain_private.reject_audit_mutation() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  raise exception 'zaltyko.audit_log is append-only' using errcode = '55000';
end
$$;

create or replace function zaltyko_domain_private.reject_insight_history_mutation() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  raise exception 'zaltyko.insight_status_history is append-only' using errcode = '55000';
end
$$;

drop trigger organization_members_user_id_required_on_insert on zaltyko.organization_members;
drop trigger insight_actions_actor_user_id_required_on_insert on zaltyko.insight_actions;
drop trigger directory_grants_approved_by_required_on_insert on public.directory_grants;
drop trigger directory_claims_user_id_required_on_insert on public.directory_claims;
drop trigger announcements_author_id_required_on_insert on public.announcements;
drop trigger conversation_messages_sender_id_required_on_insert on public.conversation_messages;
drop trigger invitations_invited_by_required_on_insert on public.invitations;
drop trigger event_registrations_profile_id_required_on_insert on public.event_registrations;
drop trigger ticket_responses_user_id_required_on_insert on public.ticket_responses;
drop trigger ticket_attachments_uploaded_by_required_on_insert on public.ticket_attachments;
drop function zaltyko_domain_private.require_column_on_insert();
drop trigger payments_manual_recorder_required on zaltyko.payments;
drop function zaltyko_domain_private.require_manual_payment_recorder();
drop trigger organization_member_invitations_acceptor_required on zaltyko.organization_member_invitations;
drop function zaltyko_domain_private.require_invitation_acceptor();

alter table public.directory_grants
  drop constraint directory_grants_user_id_fkey,
  add constraint directory_grants_user_id_fkey foreign key (user_id) references auth.users(id),
  drop constraint directory_grants_approved_by_fkey,
  add constraint directory_grants_approved_by_fkey foreign key (approved_by) references auth.users(id);
alter table public.directory_grants alter column approved_by set not null;
alter table public.directory_claims
  drop constraint directory_claims_user_id_fkey,
  add constraint directory_claims_user_id_fkey foreign key (user_id) references auth.users(id),
  drop constraint directory_claims_decided_by_fkey,
  add constraint directory_claims_decided_by_fkey foreign key (decided_by) references auth.users(id);
alter table public.directory_claims alter column user_id set not null;
alter table public.directory_revisions
  drop constraint directory_revisions_user_id_fkey,
  add constraint directory_revisions_user_id_fkey foreign key (user_id) references auth.users(id);
alter table public.directory_subscriptions
  drop constraint directory_subscriptions_user_id_fkey,
  add constraint directory_subscriptions_user_id_fkey foreign key (user_id) references auth.users(id);
alter table public.directory_audit
  drop constraint directory_audit_actor_id_fkey,
  add constraint directory_audit_actor_id_fkey foreign key (actor_id) references auth.users(id);

alter table public.academies
  drop constraint academies_owner_id_profiles_id_fk,
  add constraint academies_owner_id_profiles_id_fk foreign key (owner_id) references public.profiles(id) on delete cascade;
alter table public.coaches
  drop constraint coaches_profile_id_profiles_id_fk,
  add constraint coaches_profile_id_profiles_id_fk foreign key (profile_id) references public.profiles(id) on delete cascade;
alter table public.announcements
  drop constraint announcements_author_id_profiles_id_fk,
  add constraint announcements_author_id_profiles_id_fk foreign key (author_id) references public.profiles(id) on delete cascade;
alter table public.announcements alter column author_id set not null;
alter table public.conversation_messages
  drop constraint conversation_messages_sender_id_profiles_id_fk,
  add constraint conversation_messages_sender_id_profiles_id_fk foreign key (sender_id) references public.profiles(id) on delete cascade;
alter table public.conversation_messages alter column sender_id set not null;
alter table public.invitations
  drop constraint invitations_invited_by_profiles_user_id_fk,
  add constraint invitations_invited_by_profiles_user_id_fk foreign key (invited_by) references public.profiles(user_id) on delete cascade;
alter table public.invitations alter column invited_by set not null;
alter table public.event_registrations
  drop constraint event_registrations_profile_id_profiles_id_fk,
  add constraint event_registrations_profile_id_profiles_id_fk foreign key (profile_id) references public.profiles(id) on delete cascade;
alter table public.event_registrations alter column profile_id set not null;
alter table public.ticket_responses
  drop constraint ticket_responses_user_id_profiles_id_fk,
  add constraint ticket_responses_user_id_profiles_id_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.ticket_responses alter column user_id set not null;
alter table public.ticket_attachments
  drop constraint ticket_attachments_uploaded_by_profiles_id_fk,
  add constraint ticket_attachments_uploaded_by_profiles_id_fk foreign key (uploaded_by) references public.profiles(id) on delete cascade;
alter table public.ticket_attachments alter column uploaded_by set not null;
