-- Verificación de 20261114120000_account_erasure_candidate.sql, después del
-- paso de validación (20261114120000_account_erasure_validate.sql). Solo lee el
-- catálogo: no crea objetos ni cambia filas. Para garantizarlo, ejecutar con la
-- sesión en solo lectura:
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f 20261114120000_account_erasure_verify.sql
-- Escribe una línea por comprobación (ok / FALLA) y termina con error si alguna
-- falla. La prueba funcional (suprimir una cuenta de prueba) está en
-- docs/privacy/borrado-de-cuentas-y-fichas.md, «Verificar en staging».
do $account_erasure_verify$
declare
  item record;
  failed text[] := array[]::text[];
begin
  for item in
    with fk(relation, conname, column_name, target, target_column, action) as (
      values
        ('zaltyko.organization_members', 'organization_members_user_id_fkey', 'user_id', 'auth.users', 'id', 'n'),
        ('zaltyko.payments', 'payments_recorded_by_user_id_fkey', 'recorded_by_user_id', 'auth.users', 'id', 'n'),
        ('zaltyko.insight_actions', 'insight_actions_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'n'),
        ('zaltyko.audit_log', 'audit_log_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'n'),
        ('zaltyko.insight_status_history', 'insight_status_history_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'n'),
        ('zaltyko.guardians', 'guardians_auth_user_id_fkey', 'auth_user_id', 'auth.users', 'id', 'n'),
        ('zaltyko.organization_member_invitations', 'organization_member_invitations_accepted_by_user_id_fkey', 'accepted_by_user_id', 'auth.users', 'id', 'n'),
        ('zaltyko.organization_team_command_receipts', 'organization_team_command_receipts_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'c'),
        ('zaltyko.organization_bootstrap_commands', 'organization_bootstrap_commands_user_id_fkey', 'user_id', 'auth.users', 'id', 'c'),
        ('zaltyko.owner_dashboard_layouts', 'owner_dashboard_layouts_user_id_fkey', 'user_id', 'auth.users', 'id', 'c'),
        ('zaltyko.owner_signup_consents', 'owner_signup_consents_user_id_fkey', 'user_id', 'auth.users', 'id', 'c'),
        ('zaltyko.organization_saas_webhook_reconciliation_decisions', 'organization_saas_webhook_reconciliation_dec_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'r'),
        ('public.directory_grants', 'directory_grants_user_id_fkey', 'user_id', 'auth.users', 'id', 'c'),
        ('public.directory_grants', 'directory_grants_approved_by_fkey', 'approved_by', 'auth.users', 'id', 'n'),
        ('public.directory_claims', 'directory_claims_user_id_fkey', 'user_id', 'auth.users', 'id', 'n'),
        ('public.directory_claims', 'directory_claims_decided_by_fkey', 'decided_by', 'auth.users', 'id', 'n'),
        ('public.directory_revisions', 'directory_revisions_user_id_fkey', 'user_id', 'auth.users', 'id', 'n'),
        ('public.directory_subscriptions', 'directory_subscriptions_user_id_fkey', 'user_id', 'auth.users', 'id', 'n'),
        ('public.directory_audit', 'directory_audit_actor_id_fkey', 'actor_id', 'auth.users', 'id', 'n'),
        ('public.directory_favorites', 'directory_favorites_user_id_fkey', 'user_id', 'auth.users', 'id', 'c'),
        ('public.academies', 'academies_owner_id_profiles_id_fk', 'owner_id', 'public.profiles', 'id', 'r'),
        ('public.coaches', 'coaches_profile_id_profiles_id_fk', 'profile_id', 'public.profiles', 'id', 'n'),
        ('public.announcements', 'announcements_author_id_profiles_id_fk', 'author_id', 'public.profiles', 'id', 'n'),
        ('public.conversation_messages', 'conversation_messages_sender_id_profiles_id_fk', 'sender_id', 'public.profiles', 'id', 'n'),
        ('public.invitations', 'invitations_invited_by_profiles_user_id_fk', 'invited_by', 'public.profiles', 'user_id', 'n'),
        ('public.event_registrations', 'event_registrations_profile_id_profiles_id_fk', 'profile_id', 'public.profiles', 'id', 'n'),
        ('public.ticket_responses', 'ticket_responses_user_id_profiles_id_fk', 'user_id', 'public.profiles', 'id', 'n'),
        ('public.ticket_attachments', 'ticket_attachments_uploaded_by_profiles_id_fk', 'uploaded_by', 'public.profiles', 'id', 'n')
    ), required(relation, column_name) as (
      values
        ('zaltyko.organization_members', 'user_id'), ('zaltyko.insight_actions', 'actor_user_id'),
        ('public.directory_grants', 'approved_by'), ('public.directory_claims', 'user_id'),
        ('public.announcements', 'author_id'), ('public.conversation_messages', 'sender_id'),
        ('public.invitations', 'invited_by'), ('public.event_registrations', 'profile_id'),
        ('public.ticket_responses', 'user_id'), ('public.ticket_attachments', 'uploaded_by')
    )
    select 'clave ' || fk.relation || '.' || fk.column_name || ' -> ' || fk.target || ' (' || fk.action || ', validada)' as check_name,
      exists (
        select 1 from pg_constraint k
        where k.conrelid = to_regclass(fk.relation) and k.conname = fk.conname and k.contype = 'f'
          and k.confrelid = to_regclass(fk.target) and k.confdeltype::text = fk.action and k.convalidated
          and k.conkey = array[(select attnum from pg_attribute where attrelid = to_regclass(fk.relation) and attname = fk.column_name)]
          and k.confkey = array[(select attnum from pg_attribute where attrelid = to_regclass(fk.target) and attname = fk.target_column)]
      ) as ok
    from fk
    union all
    select 'columna ' || r.relation || '.' || r.column_name || ' admite null y exige valor al insertar',
      exists (
        select 1 from pg_attribute a
        where a.attrelid = to_regclass(r.relation) and a.attname = r.column_name and not a.attnotnull
      )
      and exists (
        select 1 from pg_trigger g
        where g.tgrelid = to_regclass(r.relation)
          and g.tgname = split_part(r.relation, '.', 2) || '_' || r.column_name || '_required_on_insert'
          and g.tgfoid = to_regprocedure('zaltyko_domain_private.require_column_on_insert()')
          and g.tgenabled = 'O'
      )
    from required r
    union all
    select 'ninguna clave hacia auth.users fuera de auth en NO ACTION, ni en RESTRICT salvo conciliación SaaS',
      not exists (
        select 1 from pg_constraint k
        where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.connamespace <> 'auth'::regnamespace
          and (k.confdeltype = 'a'
            or (k.confdeltype = 'r' and k.conname <> 'organization_saas_webhook_reconciliation_dec_actor_user_id_fkey'))
      )
    union all
    select 'CHECK: pertenencia sin cuenta => revocada (validado)',
      exists (
        select 1 from pg_constraint
        where conrelid = 'zaltyko.organization_members'::regclass and conname = 'organization_members_erased_account_revoked_ck'
          and contype = 'c' and convalidated
          and pg_get_constraintdef(oid) like '%user_id IS NOT NULL%status = ''revoked''%'
      )
    union all
    select 'CHECK de pagos: manual sin recorded_by_user_id obligatorio (validado)',
      exists (
        select 1 from pg_constraint
        where conrelid = 'zaltyko.payments'::regclass and conname = 'payments_source_fields_valid' and contype = 'c' and convalidated
          and pg_get_constraintdef(oid) not like '%(recorded_by_user_id IS NOT NULL)%'
          and pg_get_constraintdef(oid) like '%(recorded_by_user_id IS NULL)%'
      )
    union all
    select 'CHECK de invitaciones: aceptada sin accepted_by_user_id obligatorio (validado)',
      (select count(*) = 1 from pg_constraint
       where conrelid = 'zaltyko.organization_member_invitations'::regclass and contype = 'c' and convalidated
         and pg_get_constraintdef(oid) like '%''accepted''::text) AND (accepted_member_id IS NOT NULL)%')
      and not exists (
        select 1 from pg_constraint
        where conrelid = 'zaltyko.organization_member_invitations'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%(accepted_by_user_id IS NOT NULL)%'
      )
    union all
    select 'trigger de solo inserción en ' || t.relation || ' admite solo el vaciado por supresión',
      exists (
        select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
        where g.tgrelid = to_regclass(t.relation) and g.tgname = t.trigger_name and g.tgenabled = 'O'
          and p.oid = to_regprocedure(t.function_name)
          and p.prosrc like '%not exists (select 1 from auth.users where id = old.actor_user_id)%'
          and p.prosrc like '%append-only%'
      )
    from (values
      ('zaltyko.audit_log', 'audit_log_immutable', 'zaltyko_domain_private.reject_audit_mutation()'),
      ('zaltyko.insight_status_history', 'insight_status_history_immutable', 'zaltyko_domain_private.reject_insight_history_mutation()')
    ) as t(relation, trigger_name, function_name)
    union all
    select 'trigger ' || t.relation || '.' || t.trigger_name || ' (pago manual y aceptación siguen exigiendo cuenta)',
      exists (
        select 1 from pg_trigger g
        where g.tgrelid = to_regclass(t.relation) and g.tgname = t.trigger_name and not g.tgisinternal
          and g.tgfoid = to_regprocedure(t.function_name) and g.tgenabled = 'O' and g.tgtype = t.trigger_type
      )
      and not has_function_privilege('anon', t.function_name, 'EXECUTE')
      and not has_function_privilege('authenticated', t.function_name, 'EXECUTE')
    from (values
      ('zaltyko.payments', 'payments_manual_recorder_required', 'zaltyko_domain_private.require_manual_payment_recorder()', 7::smallint),
      ('zaltyko.organization_member_invitations', 'organization_member_invitations_acceptor_required', 'zaltyko_domain_private.require_invitation_acceptor()', 23::smallint)
    ) as t(relation, trigger_name, function_name, trigger_type)
    union all
    select 'función de autor obligatorio sin ejecución para anon ni authenticated',
      to_regprocedure('zaltyko_domain_private.require_column_on_insert()') is not null
      and not has_function_privilege('anon', 'zaltyko_domain_private.require_column_on_insert()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'zaltyko_domain_private.require_column_on_insert()', 'EXECUTE')
  loop
    raise notice '% %', case when item.ok then 'ok   ' else 'FALLA' end, item.check_name;
    if not item.ok then
      failed := failed || item.check_name;
    end if;
  end loop;
  if cardinality(failed) > 0 then
    raise exception 'Account erasure verification failed: %', array_to_string(failed, '; ');
  end if;
  raise notice 'Account erasure verification passed';
end;
$account_erasure_verify$;
