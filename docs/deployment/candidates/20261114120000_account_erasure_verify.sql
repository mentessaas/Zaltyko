-- Verificación de 20261114120000_account_erasure_candidate.sql. Solo lectura:
-- no cambia filas ni el esquema (usa una vista temporal de la sesión). Ejecutar después de aplicar el candidato:
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f 20261114120000_account_erasure_verify.sql
-- Muestra una fila por comprobación (ok = true) y termina con error si alguna
-- falla. La prueba funcional (suprimir una cuenta de prueba) está en
-- docs/privacy/borrado-de-cuentas-y-fichas.md, «Verificar en staging».
create temporary view account_erasure_checks as
with fk(relation, conname, column_name, action) as (
  values
    ('zaltyko.organization_members', 'organization_members_user_id_fkey', 'user_id', 'n'),
    ('zaltyko.payments', 'payments_recorded_by_user_id_fkey', 'recorded_by_user_id', 'n'),
    ('zaltyko.insight_actions', 'insight_actions_actor_user_id_fkey', 'actor_user_id', 'n'),
    ('zaltyko.audit_log', 'audit_log_actor_user_id_fkey', 'actor_user_id', 'n'),
    ('zaltyko.insight_status_history', 'insight_status_history_actor_user_id_fkey', 'actor_user_id', 'n'),
    ('zaltyko.guardians', 'guardians_auth_user_id_fkey', 'auth_user_id', 'n'),
    ('zaltyko.organization_member_invitations', 'organization_member_invitations_accepted_by_user_id_fkey', 'accepted_by_user_id', 'n'),
    ('zaltyko.organization_team_command_receipts', 'organization_team_command_receipts_actor_user_id_fkey', 'actor_user_id', 'c'),
    ('zaltyko.organization_bootstrap_commands', 'organization_bootstrap_commands_user_id_fkey', 'user_id', 'c'),
    ('zaltyko.owner_dashboard_layouts', 'owner_dashboard_layouts_user_id_fkey', 'user_id', 'c'),
    ('zaltyko.owner_signup_consents', 'owner_signup_consents_user_id_fkey', 'user_id', 'c'),
    ('zaltyko.organization_saas_webhook_reconciliation_decisions', 'organization_saas_webhook_reconciliation_dec_actor_user_id_fkey', 'actor_user_id', 'r')
), directory_fk(relation, conname, column_name, action) as (
  values
    ('public.directory_grants', 'directory_grants_user_id_fkey', 'user_id', 'c'),
    ('public.directory_grants', 'directory_grants_approved_by_fkey', 'approved_by', 'n'),
    ('public.directory_claims', 'directory_claims_user_id_fkey', 'user_id', 'n'),
    ('public.directory_claims', 'directory_claims_decided_by_fkey', 'decided_by', 'n'),
    ('public.directory_revisions', 'directory_revisions_user_id_fkey', 'user_id', 'n'),
    ('public.directory_subscriptions', 'directory_subscriptions_user_id_fkey', 'user_id', 'n'),
    ('public.directory_audit', 'directory_audit_actor_id_fkey', 'actor_id', 'n'),
    ('public.directory_favorites', 'directory_favorites_user_id_fkey', 'user_id', 'c')
), expected_fk as (
  select * from fk
  union all
  select * from directory_fk where to_regclass('public.directory_grants') is not null
)
select 'fk ' || e.relation || '.' || e.column_name || ' -> ' || e.action as check_name,
  exists (
    select 1 from pg_constraint k
    where k.conrelid = to_regclass(e.relation) and k.conname = e.conname and k.contype = 'f'
      and k.confrelid = 'auth.users'::regclass and k.confdeltype::text = e.action and k.convalidated
      and k.conkey = array[(select attnum from pg_attribute where attrelid = to_regclass(e.relation) and attname = e.column_name)]
  ) as ok
from expected_fk e
union all
-- Ninguna clave de zaltyko o public hacia auth.users queda en NO ACTION.
select 'sin claves NO ACTION hacia auth.users',
  not exists (
    select 1 from pg_constraint k
    where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype = 'a'
      and k.connamespace in ('zaltyko'::regnamespace, 'public'::regnamespace)
  )
union all
select 'organization_members.user_id admite null',
  not (select attnotnull from pg_attribute where attrelid = 'zaltyko.organization_members'::regclass and attname = 'user_id')
union all
select 'insight_actions.actor_user_id admite null',
  not (select attnotnull from pg_attribute where attrelid = 'zaltyko.insight_actions'::regclass and attname = 'actor_user_id')
union all
select 'CHECK: pertenencia sin cuenta => revocada',
  exists (
    select 1 from pg_constraint
    where conrelid = 'zaltyko.organization_members'::regclass and conname = 'organization_members_erased_account_revoked_ck'
      and contype = 'c' and convalidated
      and pg_get_constraintdef(oid) like '%user_id IS NOT NULL%status = ''revoked''%'
  )
union all
select 'CHECK de pagos: manual sin recorded_by_user_id obligatorio',
  exists (
    select 1 from pg_constraint
    where conrelid = 'zaltyko.payments'::regclass and conname = 'payments_source_fields_valid' and contype = 'c' and convalidated
      and pg_get_constraintdef(oid) not like '%(recorded_by_user_id IS NOT NULL)%'
      and pg_get_constraintdef(oid) like '%(recorded_by_user_id IS NULL)%'
  )
union all
select 'CHECK de invitaciones: aceptada sin accepted_by_user_id obligatorio',
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
) as t(relation, trigger_name, function_name);

select check_name, ok from account_erasure_checks order by ok, check_name;

do $account_erasure_verify$
declare
  failed text;
begin
  select string_agg(check_name, '; ') into failed from account_erasure_checks where not ok;
  if failed is not null then
    raise exception 'Account erasure verification failed: %', failed;
  end if;
  raise notice 'Account erasure verification passed';
end;
$account_erasure_verify$;

drop view account_erasure_checks;
