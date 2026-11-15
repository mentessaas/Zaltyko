-- Segundo paso de 20261114120000_account_erasure_candidate.sql: valida las
-- claves y CHECK que el candidato creó NOT VALID. Requiere la misma
-- autorización. Ejecutar después del candidato, en otra transacción:
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f 20261114120000_account_erasure_validate.sql
-- VALIDATE CONSTRAINT recorre la tabla con SHARE UPDATE EXCLUSIVE: no bloquea
-- lecturas ni escrituras. No cambia definiciones ni filas. Si ya están
-- validadas, no hace nada; si una fila existente no cumple, aborta y lo dice.
set local lock_timeout = '3s';

do $account_erasure_validate$
declare
  item record;
  validated integer := 0;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'zaltyko.organization_members'::regclass and conname = 'organization_members_erased_account_revoked_ck'
  ) then
    raise exception 'Account erasure validation requires the installed account erasure candidate';
  end if;
  for item in
    select k.conrelid::regclass as relation, k.conname
    from pg_constraint k
    join (values
      ('zaltyko.organization_members', 'organization_members_user_id_fkey'),
      ('zaltyko.organization_members', 'organization_members_erased_account_revoked_ck'),
      ('zaltyko.payments', 'payments_recorded_by_user_id_fkey'),
      ('zaltyko.payments', 'payments_source_fields_valid'),
      ('zaltyko.insight_actions', 'insight_actions_actor_user_id_fkey'),
      ('zaltyko.organization_member_invitations', 'organization_member_invitations_accepted_by_user_id_fkey'),
      ('zaltyko.organization_team_command_receipts', 'organization_team_command_receipts_actor_user_id_fkey'),
      ('public.directory_grants', 'directory_grants_user_id_fkey'),
      ('public.directory_grants', 'directory_grants_approved_by_fkey'),
      ('public.directory_claims', 'directory_claims_user_id_fkey'),
      ('public.directory_claims', 'directory_claims_decided_by_fkey'),
      ('public.directory_revisions', 'directory_revisions_user_id_fkey'),
      ('public.directory_subscriptions', 'directory_subscriptions_user_id_fkey'),
      ('public.directory_audit', 'directory_audit_actor_id_fkey'),
      ('public.academies', 'academies_owner_id_profiles_id_fk'),
      ('public.coaches', 'coaches_profile_id_profiles_id_fk'),
      ('public.announcements', 'announcements_author_id_profiles_id_fk'),
      ('public.conversation_messages', 'conversation_messages_sender_id_profiles_id_fk'),
      ('public.invitations', 'invitations_invited_by_profiles_user_id_fk'),
      ('public.event_registrations', 'event_registrations_profile_id_profiles_id_fk'),
      ('public.ticket_responses', 'ticket_responses_user_id_profiles_id_fk'),
      ('public.ticket_attachments', 'ticket_attachments_uploaded_by_profiles_id_fk')
    ) as expected(relation, conname)
      on k.conrelid = to_regclass(expected.relation) and k.conname = expected.conname
    where not k.convalidated
    union all
    -- El CHECK de estado de las invitaciones conserva su nombre generado.
    select k.conrelid::regclass, k.conname
    from pg_constraint k
    where k.conrelid = 'zaltyko.organization_member_invitations'::regclass and k.contype = 'c' and not k.convalidated
      and pg_get_constraintdef(k.oid) like '%''accepted''::text) AND (accepted_member_id IS NOT NULL)%'
  loop
    execute format('alter table %s validate constraint %I', item.relation, item.conname);
    validated := validated + 1;
  end loop;
  raise notice 'Account erasure constraints validated: %', validated;
end;
$account_erasure_validate$;
