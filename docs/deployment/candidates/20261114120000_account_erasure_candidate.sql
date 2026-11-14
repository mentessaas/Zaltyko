-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging primero, después producción). No aplicado en ningún entorno.
-- Supresión de cuentas (RGPD art. 17) sin perder los registros que la academia
-- debe conservar (docs/privacy/borrado-de-cuentas-y-fichas.md).
--
-- Hoy borrar una fila de auth.users falla en cuanto la persona ha trabajado en
-- una academia: la cascada a zaltyko.organization_members choca con decenas de
-- claves de autoría NO ACTION/RESTRICT, y varias claves directas a auth.users
-- son RESTRICT/NO ACTION o chocan con triggers de solo inserción.
--
-- Decisión: la pertenencia no se borra, se seudonimiza. El servidor la revoca
-- (status='revoked') y, al borrar la cuenta, user_id pasa a null. Los registros
-- de la academia (asistencia, objetivos, cobros, auditoría) conservan su autoría
-- apuntando a una pertenencia sin persona. Por tabla:
--
--   SET NULL (seudonimizar, la academia conserva el registro):
--     zaltyko.organization_members.user_id      (antes CASCADE; NOT NULL fuera,
--                                                CHECK: sin cuenta => revocada)
--     zaltyko.payments.recorded_by_user_id      (antes RESTRICT; el CHECK admite
--                                                pago manual sin quien lo anotó)
--     zaltyko.insight_actions.actor_user_id     (antes RESTRICT; NOT NULL fuera)
--     zaltyko.organization_member_invitations.accepted_by_user_id
--                                               (antes NO ACTION; el CHECK de
--                                                aceptada exige accepted_member_id)
--     zaltyko.audit_log.actor_user_id           (ya SET NULL; el trigger de solo
--     zaltyko.insight_status_history.actor_user_id  inserción lo impedía: ahora
--                                                admite solo ese vaciado y solo
--                                                si la cuenta ya no existe)
--     zaltyko.guardians.auth_user_id            (ya SET NULL, sin cambios)
--     public.directory_grants.approved_by, public.directory_claims.user_id y
--     decided_by, public.directory_revisions.user_id,
--     public.directory_subscriptions.user_id, public.directory_audit.actor_id
--                                               (antes NO ACTION)
--   CASCADE (datos que solo pertenecen a la cuenta):
--     zaltyko.organization_team_command_receipts.actor_user_id (antes NO ACTION;
--                                                recibos de reintento)
--     public.directory_grants.user_id           (antes NO ACTION; derecho de
--                                                gestionar una ficha del directorio)
--     ya CASCADE sin cambios: organization_bootstrap_commands,
--     owner_dashboard_layouts, owner_signup_consents, public.directory_favorites
--   RESTRICT justificado (sin cambios):
--     zaltyko.organization_saas_webhook_reconciliation_decisions.actor_user_id:
--     decisiones de conciliación de cobros SaaS de Zaltyko, firmadas por una
--     persona del equipo interno y de solo inserción; son evidencia fiscal. El
--     servidor rechaza la supresión con un motivo claro.
--
-- No cambia filas, roles, RLS, permisos ni tablas nuevas. Las autorías por
-- pertenencia (organization_members) no cambian: la pertenencia ya no se borra.
-- Aplicar en una sola transacción: psql -v ON_ERROR_STOP=1 -1 -f <archivo>.
-- Reaplicar aborta antes de tocar nada; una instalación parcial o divergente
-- exige reconciliación humana, nunca reparación. Verificación:
-- 20261114120000_account_erasure_verify.sql. Vuelta atrás (solo mientras no se
-- haya suprimido ninguna cuenta): 20261114120000_account_erasure_rollback.sql.
do $account_erasure_candidate_preflight$
declare
  fk record;
  invitation_checks integer;
  unknown_blockers text;
begin
  for fk in
    select * from (values
      ('zaltyko.organization_members', 'organization_members_user_id_fkey', 'user_id', 'c'),
      ('zaltyko.payments', 'payments_recorded_by_user_id_fkey', 'recorded_by_user_id', 'r'),
      ('zaltyko.insight_actions', 'insight_actions_actor_user_id_fkey', 'actor_user_id', 'r'),
      ('zaltyko.audit_log', 'audit_log_actor_user_id_fkey', 'actor_user_id', 'n'),
      ('zaltyko.insight_status_history', 'insight_status_history_actor_user_id_fkey', 'actor_user_id', 'n'),
      ('zaltyko.organization_saas_webhook_reconciliation_decisions', 'organization_saas_webhook_reconciliation_dec_actor_user_id_fkey', 'actor_user_id', 'r'),
      ('zaltyko.organization_member_invitations', 'organization_member_invitations_accepted_by_user_id_fkey', 'accepted_by_user_id', 'a'),
      ('zaltyko.organization_team_command_receipts', 'organization_team_command_receipts_actor_user_id_fkey', 'actor_user_id', 'a')
    ) as expected(relation, conname, column_name, action)
  loop
    if to_regclass(fk.relation) is null or not exists (
      select 1 from pg_constraint k
      where k.conrelid = to_regclass(fk.relation)
        and k.conname = fk.conname
        and k.contype = 'f'
        and k.confrelid = 'auth.users'::regclass
        and k.confdeltype::text = fk.action
        and k.conkey = array[(select attnum from pg_attribute where attrelid = to_regclass(fk.relation) and attname = fk.column_name)]
    ) then
      raise exception 'Account erasure candidate requires % on % in its reviewed form; inspect existing schema before promotion', fk.conname, fk.relation;
    end if;
  end loop;
  if not (select attnotnull from pg_attribute where attrelid = 'zaltyko.organization_members'::regclass and attname = 'user_id')
     or not (select attnotnull from pg_attribute where attrelid = 'zaltyko.insight_actions'::regclass and attname = 'actor_user_id') then
    raise exception 'Account erasure candidate requires organization_members.user_id and insight_actions.actor_user_id NOT NULL; inspect existing schema before promotion';
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'zaltyko.organization_members'::regclass and conname = 'organization_members_erased_account_revoked_ck') then
    raise exception 'Account erasure candidate requires organization_members_erased_account_revoked_ck absent; inspect existing schema before promotion';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'zaltyko.payments'::regclass and conname = 'payments_source_fields_valid' and contype = 'c'
      and pg_get_constraintdef(oid) like '%manual_method IS NOT NULL) AND (recorded_by_user_id IS NOT NULL)%'
  ) then
    raise exception 'Account erasure candidate requires payments_source_fields_valid in its reviewed form; inspect existing schema before promotion';
  end if;
  select count(*) into invitation_checks from pg_constraint
  where conrelid = 'zaltyko.organization_member_invitations'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%''accepted''::text) AND (accepted_by_user_id IS NOT NULL)%';
  if invitation_checks <> 1 then
    raise exception 'Account erasure candidate requires exactly one reviewed invitation status CHECK; inspect existing schema before promotion';
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure('zaltyko_domain_private.reject_audit_mutation()') and prosrc not like '%actor_user_id%')
     or not exists (select 1 from pg_proc where oid = to_regprocedure('zaltyko_domain_private.reject_insight_history_mutation()') and prosrc not like '%actor_user_id%') then
    raise exception 'Account erasure candidate requires the reviewed append-only trigger functions; inspect existing schema before promotion';
  end if;
  -- Directorio público: todas sus tablas o ninguna, con las claves revisadas.
  if to_regclass('public.directory_grants') is not null then
    for fk in
      select * from (values
        ('public.directory_grants', 'directory_grants_user_id_fkey', 'user_id'),
        ('public.directory_grants', 'directory_grants_approved_by_fkey', 'approved_by'),
        ('public.directory_claims', 'directory_claims_user_id_fkey', 'user_id'),
        ('public.directory_claims', 'directory_claims_decided_by_fkey', 'decided_by'),
        ('public.directory_revisions', 'directory_revisions_user_id_fkey', 'user_id'),
        ('public.directory_subscriptions', 'directory_subscriptions_user_id_fkey', 'user_id'),
        ('public.directory_audit', 'directory_audit_actor_id_fkey', 'actor_id')
      ) as expected(relation, conname, column_name)
    loop
      if to_regclass(fk.relation) is null or not exists (
        select 1 from pg_constraint k
        where k.conrelid = to_regclass(fk.relation)
          and k.conname = fk.conname
          and k.contype = 'f'
          and k.confrelid = 'auth.users'::regclass
          and k.confdeltype = 'a'
          and k.conkey = array[(select attnum from pg_attribute where attrelid = to_regclass(fk.relation) and attname = fk.column_name)]
      ) then
        raise exception 'Account erasure candidate requires % on % in its reviewed form; inspect existing schema before promotion', fk.conname, fk.relation;
      end if;
    end loop;
  elsif to_regclass('public.directory_claims') is not null
     or to_regclass('public.directory_revisions') is not null
     or to_regclass('public.directory_subscriptions') is not null
     or to_regclass('public.directory_audit') is not null then
    raise exception 'Account erasure candidate requires the public directory complete or absent; inspect existing schema before promotion';
  end if;
  -- Ninguna otra clave de zaltyko o public hacia auth.users puede bloquear.
  select string_agg(k.conrelid::regclass::text || '.' || k.conname, ', ') into unknown_blockers
  from pg_constraint k
  where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype in ('a', 'r')
    and k.connamespace in ('zaltyko'::regnamespace, 'public'::regnamespace)
    and k.conname not in (
      'payments_recorded_by_user_id_fkey', 'insight_actions_actor_user_id_fkey',
      'organization_saas_webhook_reconciliation_dec_actor_user_id_fkey',
      'organization_member_invitations_accepted_by_user_id_fkey', 'organization_team_command_receipts_actor_user_id_fkey',
      'directory_grants_user_id_fkey', 'directory_grants_approved_by_fkey', 'directory_claims_user_id_fkey',
      'directory_claims_decided_by_fkey', 'directory_revisions_user_id_fkey', 'directory_subscriptions_user_id_fkey',
      'directory_audit_actor_id_fkey');
  if unknown_blockers is not null then
    raise exception 'Account erasure candidate found unreviewed blocking references to auth.users (%); inspect existing schema before promotion', unknown_blockers;
  end if;
end;
$account_erasure_candidate_preflight$;

-- 1. Pertenencias: se conservan revocadas y sin cuenta. El CHECK obliga a
-- revocarlas antes de borrar la cuenta: un borrado directo de auth.users (por
-- ejemplo desde el panel de Supabase) falla entero si la cuenta sigue activa
-- en alguna academia.
alter table zaltyko.organization_members alter column user_id drop not null;
alter table zaltyko.organization_members
  drop constraint organization_members_user_id_fkey,
  add constraint organization_members_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null,
  add constraint organization_members_erased_account_revoked_ck
    check (user_id is not null or status = 'revoked');

-- 2. Cobros: el pago se conserva (obligación contable); quien lo anotó queda
-- vacío. Mismo CHECK salvo que un pago manual ya no exige recorded_by_user_id.
alter table zaltyko.payments
  drop constraint payments_recorded_by_user_id_fkey,
  add constraint payments_recorded_by_user_id_fkey
    foreign key (recorded_by_user_id) references auth.users(id) on delete set null,
  drop constraint payments_source_fields_valid,
  add constraint payments_source_fields_valid check (
    (source = 'provider' and processor is not null and btrim(processor) <> '' and environment is not null
      and provider_payment_id is not null and btrim(provider_payment_id) <> '' and manual_method is null
      and recorded_by_user_id is null)
    or (source = 'manual' and processor is null and environment is null and provider_payment_id is null
      and manual_method is not null)
  );

-- 3. Acciones sobre avisos: se conservan con su pertenencia (actor_member_id).
alter table zaltyko.insight_actions alter column actor_user_id drop not null;
alter table zaltyko.insight_actions
  drop constraint insight_actions_actor_user_id_fkey,
  add constraint insight_actions_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null;

-- 4. Acceso de equipo. La invitación aceptada conserva accepted_member_id (la
-- pertenencia seudonimizada); los recibos de reintento se borran con la cuenta.
alter table zaltyko.organization_member_invitations
  drop constraint organization_member_invitations_accepted_by_user_id_fkey,
  add constraint organization_member_invitations_accepted_by_user_id_fkey
    foreign key (accepted_by_user_id) references auth.users(id) on delete set null;
do $account_erasure_invitation_check$
declare
  check_name text;
begin
  select conname into strict check_name from pg_constraint
  where conrelid = 'zaltyko.organization_member_invitations'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%''accepted''::text) AND (accepted_by_user_id IS NOT NULL)%';
  -- Mismo nombre y misma expresión salvo accepted_by_user_id en «accepted».
  execute format('alter table zaltyko.organization_member_invitations drop constraint %I, add constraint %I check (%s)',
    check_name, check_name,
    '(status = ''pending'' and accepted_by_user_id is null and accepted_member_id is null and accepted_at is null and revoked_by_member_id is null and revoked_at is null)'
    || ' or (status = ''accepted'' and accepted_member_id is not null and accepted_at is not null and revoked_by_member_id is null and revoked_at is null)'
    || ' or (status = ''revoked'' and accepted_by_user_id is null and accepted_member_id is null and accepted_at is null and revoked_by_member_id is not null and revoked_at is not null)');
end;
$account_erasure_invitation_check$;
alter table zaltyko.organization_team_command_receipts
  drop constraint organization_team_command_receipts_actor_user_id_fkey,
  add constraint organization_team_command_receipts_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete cascade;

-- 5. Registros de solo inserción. Siguen rechazando UPDATE y DELETE, salvo el
-- vaciado de actor_user_id que hace la propia clave foránea al borrar la
-- cuenta: solo cambia esa columna, de un valor a null, y la cuenta ya no existe.
create or replace function zaltyko_domain_private.reject_audit_mutation() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.actor_user_id is not null and new.actor_user_id is null
       and (to_jsonb(new) - 'actor_user_id') = (to_jsonb(old) - 'actor_user_id')
       and not exists (select 1 from auth.users where id = old.actor_user_id) then
      return new;
    end if;
  end if;
  raise exception 'zaltyko.audit_log is append-only' using errcode = '55000';
end
$$;

create or replace function zaltyko_domain_private.reject_insight_history_mutation() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.actor_user_id is not null and new.actor_user_id is null
       and (to_jsonb(new) - 'actor_user_id') = (to_jsonb(old) - 'actor_user_id')
       and not exists (select 1 from auth.users where id = old.actor_user_id) then
      return new;
    end if;
  end if;
  raise exception 'zaltyko.insight_status_history is append-only' using errcode = '55000';
end
$$;

-- 6. Directorio público (si existe). La ficha y su historial se conservan;
-- el derecho a gestionar una ficha se borra con la cuenta. Las pruebas de una
-- reclamación siguen su purga de 30 días (src/lib/directory/maintenance.ts).
do $account_erasure_directory$
begin
  if to_regclass('public.directory_grants') is null then
    return;
  end if;
  alter table public.directory_grants alter column approved_by drop not null;
  alter table public.directory_grants
    drop constraint directory_grants_user_id_fkey,
    add constraint directory_grants_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
    drop constraint directory_grants_approved_by_fkey,
    add constraint directory_grants_approved_by_fkey foreign key (approved_by) references auth.users(id) on delete set null;
  alter table public.directory_claims alter column user_id drop not null;
  alter table public.directory_claims
    drop constraint directory_claims_user_id_fkey,
    add constraint directory_claims_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null,
    drop constraint directory_claims_decided_by_fkey,
    add constraint directory_claims_decided_by_fkey foreign key (decided_by) references auth.users(id) on delete set null;
  alter table public.directory_revisions
    drop constraint directory_revisions_user_id_fkey,
    add constraint directory_revisions_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
  alter table public.directory_subscriptions
    drop constraint directory_subscriptions_user_id_fkey,
    add constraint directory_subscriptions_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
  alter table public.directory_audit
    drop constraint directory_audit_actor_id_fkey,
    add constraint directory_audit_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;
end;
$account_erasure_directory$;
