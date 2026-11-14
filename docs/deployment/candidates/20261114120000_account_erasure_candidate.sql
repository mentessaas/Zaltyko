-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging primero, después producción). No aplicado en ningún entorno.
-- Supresión de cuentas (RGPD art. 17) sin perder los registros que la academia
-- debe conservar (docs/privacy/borrado-de-cuentas-y-fichas.md).
--
-- Hoy borrar una fila de auth.users falla en cuanto la persona ha trabajado en
-- una academia: la cascada a zaltyko.organization_members choca con decenas de
-- claves de autoría NO ACTION/RESTRICT, y varias claves directas a auth.users
-- son RESTRICT/NO ACTION o chocan con triggers de solo inserción. Y borrar el
-- perfil legacy (public.profiles) arrastra en cascada su academia legacy entera
-- (con cobros y facturas), las fichas de entrenador y los avisos y mensajes que
-- leen otras personas.
--
-- Decisión: la pertenencia no se borra, se seudonimiza. El servidor la revoca
-- (status='revoked') y, al borrar la cuenta, user_id pasa a null. Los registros
-- de la academia conservan su autoría apuntando a una pertenencia o un autor
-- vacío. Por tabla:
--
--   SET NULL (seudonimizar, la academia conserva el registro):
--     zaltyko.organization_members.user_id      (antes CASCADE; CHECK: sin
--                                                cuenta => revocada)
--     zaltyko.payments.recorded_by_user_id      (antes RESTRICT; el CHECK admite
--                                                pago manual sin quien lo anotó)
--     zaltyko.insight_actions.actor_user_id     (antes RESTRICT)
--     zaltyko.organization_member_invitations.accepted_by_user_id
--                                               (antes NO ACTION; el CHECK de
--                                                aceptada exige accepted_member_id;
--                                                el servidor sustituye email y nombre)
--     zaltyko.audit_log.actor_user_id           (ya SET NULL; el trigger de solo
--     zaltyko.insight_status_history.actor_user_id  inserción lo impedía: ahora
--                                                admite solo ese vaciado y solo
--                                                si la cuenta ya no existe)
--     zaltyko.guardians.auth_user_id            (ya SET NULL, sin cambios)
--     public.directory_grants.approved_by, public.directory_claims.user_id y
--     decided_by, public.directory_revisions.user_id,
--     public.directory_subscriptions.user_id, public.directory_audit.actor_id
--                                               (antes NO ACTION)
--     public.coaches.profile_id, public.announcements.author_id,
--     public.conversation_messages.sender_id, public.invitations.invited_by,
--     public.event_registrations.profile_id (con sus pagos),
--     public.ticket_responses.user_id, public.ticket_attachments.uploaded_by
--                                               (antes CASCADE hacia public.profiles)
--   CASCADE (datos que solo pertenecen a la cuenta):
--     zaltyko.organization_team_command_receipts.actor_user_id (antes NO ACTION;
--                                                recibos de reintento)
--     public.directory_grants.user_id           (antes NO ACTION)
--     sin cambios: organization_bootstrap_commands, owner_dashboard_layouts,
--     owner_signup_consents, public.directory_favorites y, hacia
--     public.profiles, memberships, notificaciones, preferencias, suscripciones
--     push, recibos de lectura propios, tickets propios, valoraciones del
--     marketplace, inscripciones a listas de espera y empleo, solicitudes de
--     vinculación y owner_consent.
--   RESTRICT justificado:
--     zaltyko.organization_saas_webhook_reconciliation_decisions.actor_user_id
--     (sin cambios): evidencia fiscal de solo inserción de Zaltyko.
--     public.academies.owner_id (antes CASCADE): una academia legacy, con sus
--     cobros y facturas, nunca se borra como efecto lateral de suprimir a su
--     dueña; hay que transferirla o cerrarla antes.
--
-- Filas nuevas: donde se quita NOT NULL, un trigger BEFORE INSERT sigue exigiendo
-- el autor; solo la clave foránea puede dejarlo vacío después.
--
-- No crea tablas ni cambia filas, roles, RLS ni permisos. Las autorías por
-- pertenencia (organization_members) no cambian: la pertenencia ya no se borra.
-- Claves y CHECK nuevos se crean NOT VALID (sin recorrer las tablas con bloqueo
-- exclusivo); se validan después con 20261114120000_account_erasure_validate.sql.
-- Aplicar en una sola transacción: psql -v ON_ERROR_STOP=1 -1 -f <archivo>.
-- lock_timeout aborta (sin efectos) si otra sesión retiene una de las tablas.
-- Reaplicar aborta antes de tocar nada; una instalación parcial o divergente
-- exige reconciliación humana, nunca reparación. Verificación:
-- 20261114120000_account_erasure_verify.sql. Vuelta atrás (solo mientras no se
-- haya suprimido ninguna cuenta): 20261114120000_account_erasure_rollback.sql.
set local lock_timeout = '3s';

do $account_erasure_candidate_preflight$
declare
  fk record;
  invitation_checks integer;
  unknown_blockers text;
begin
  for fk in
    select * from (values
      ('zaltyko.organization_members', 'organization_members_user_id_fkey', 'user_id', 'auth.users', 'id', 'c'),
      ('zaltyko.payments', 'payments_recorded_by_user_id_fkey', 'recorded_by_user_id', 'auth.users', 'id', 'r'),
      ('zaltyko.insight_actions', 'insight_actions_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'r'),
      ('zaltyko.audit_log', 'audit_log_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'n'),
      ('zaltyko.insight_status_history', 'insight_status_history_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'n'),
      ('zaltyko.organization_saas_webhook_reconciliation_decisions', 'organization_saas_webhook_reconciliation_dec_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'r'),
      ('zaltyko.organization_member_invitations', 'organization_member_invitations_accepted_by_user_id_fkey', 'accepted_by_user_id', 'auth.users', 'id', 'a'),
      ('zaltyko.organization_team_command_receipts', 'organization_team_command_receipts_actor_user_id_fkey', 'actor_user_id', 'auth.users', 'id', 'a'),
      ('public.directory_grants', 'directory_grants_user_id_fkey', 'user_id', 'auth.users', 'id', 'a'),
      ('public.directory_grants', 'directory_grants_approved_by_fkey', 'approved_by', 'auth.users', 'id', 'a'),
      ('public.directory_claims', 'directory_claims_user_id_fkey', 'user_id', 'auth.users', 'id', 'a'),
      ('public.directory_claims', 'directory_claims_decided_by_fkey', 'decided_by', 'auth.users', 'id', 'a'),
      ('public.directory_revisions', 'directory_revisions_user_id_fkey', 'user_id', 'auth.users', 'id', 'a'),
      ('public.directory_subscriptions', 'directory_subscriptions_user_id_fkey', 'user_id', 'auth.users', 'id', 'a'),
      ('public.directory_audit', 'directory_audit_actor_id_fkey', 'actor_id', 'auth.users', 'id', 'a'),
      ('public.academies', 'academies_owner_id_profiles_id_fk', 'owner_id', 'public.profiles', 'id', 'c'),
      ('public.coaches', 'coaches_profile_id_profiles_id_fk', 'profile_id', 'public.profiles', 'id', 'c'),
      ('public.announcements', 'announcements_author_id_profiles_id_fk', 'author_id', 'public.profiles', 'id', 'c'),
      ('public.conversation_messages', 'conversation_messages_sender_id_profiles_id_fk', 'sender_id', 'public.profiles', 'id', 'c'),
      ('public.invitations', 'invitations_invited_by_profiles_user_id_fk', 'invited_by', 'public.profiles', 'user_id', 'c'),
      ('public.event_registrations', 'event_registrations_profile_id_profiles_id_fk', 'profile_id', 'public.profiles', 'id', 'c'),
      ('public.ticket_responses', 'ticket_responses_user_id_profiles_id_fk', 'user_id', 'public.profiles', 'id', 'c'),
      ('public.ticket_attachments', 'ticket_attachments_uploaded_by_profiles_id_fk', 'uploaded_by', 'public.profiles', 'id', 'c')
    ) as expected(relation, conname, column_name, target, target_column, action)
  loop
    if to_regclass(fk.relation) is null or to_regclass(fk.target) is null or not exists (
      select 1 from pg_constraint k
      where k.conrelid = to_regclass(fk.relation)
        and k.conname = fk.conname
        and k.contype = 'f'
        and k.confrelid = to_regclass(fk.target)
        and k.confdeltype::text = fk.action
        and k.conkey = array[(select attnum from pg_attribute where attrelid = to_regclass(fk.relation) and attname = fk.column_name)]
        and k.confkey = array[(select attnum from pg_attribute where attrelid = to_regclass(fk.target) and attname = fk.target_column)]
    ) then
      raise exception 'Account erasure candidate requires % on % in its reviewed form; inspect existing schema before promotion', fk.conname, fk.relation;
    end if;
  end loop;
  if (
    select count(*) from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where a.attnotnull and not a.attisdropped
      and n.nspname || '.' || c.relname || '.' || a.attname in (
        'zaltyko.organization_members.user_id', 'zaltyko.insight_actions.actor_user_id',
        'public.directory_grants.approved_by', 'public.directory_claims.user_id',
        'public.announcements.author_id', 'public.conversation_messages.sender_id',
        'public.invitations.invited_by', 'public.event_registrations.profile_id',
        'public.ticket_responses.user_id', 'public.ticket_attachments.uploaded_by')
  ) <> 10 then
    raise exception 'Account erasure candidate requires its author columns NOT NULL; inspect existing schema before promotion';
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'zaltyko.organization_members'::regclass and conname = 'organization_members_erased_account_revoked_ck')
     or to_regprocedure('zaltyko_domain_private.require_column_on_insert()') is not null
     or exists (select 1 from pg_trigger where not tgisinternal and tgname like '%\_required\_on\_insert') then
    raise exception 'Account erasure candidate requires its CHECK, trigger function and insert triggers absent; inspect existing schema before promotion';
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
  -- Ninguna otra clave hacia auth.users, en cualquier esquema salvo auth (por
  -- ejemplo storage), puede bloquear el borrado de la cuenta. Sin esto, el
  -- servidor revocaría las pertenencias y después fallaría en Auth.
  select string_agg(k.conrelid::regclass::text || '.' || k.conname, ', ') into unknown_blockers
  from pg_constraint k
  where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype in ('a', 'r')
    and k.connamespace <> 'auth'::regnamespace
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
    foreign key (user_id) references auth.users(id) on delete set null not valid,
  add constraint organization_members_erased_account_revoked_ck
    check (user_id is not null or status = 'revoked') not valid;

-- 2. Cobros: el pago se conserva (obligación contable); quien lo anotó queda
-- vacío. Mismo CHECK salvo que un pago manual ya no exige recorded_by_user_id.
alter table zaltyko.payments
  drop constraint payments_recorded_by_user_id_fkey,
  add constraint payments_recorded_by_user_id_fkey
    foreign key (recorded_by_user_id) references auth.users(id) on delete set null not valid,
  drop constraint payments_source_fields_valid,
  add constraint payments_source_fields_valid check (
    (source = 'provider' and processor is not null and btrim(processor) <> '' and environment is not null
      and provider_payment_id is not null and btrim(provider_payment_id) <> '' and manual_method is null
      and recorded_by_user_id is null)
    or (source = 'manual' and processor is null and environment is null and provider_payment_id is null
      and manual_method is not null)
  ) not valid;

-- 3. Acciones sobre avisos: se conservan con su pertenencia (actor_member_id).
alter table zaltyko.insight_actions alter column actor_user_id drop not null;
alter table zaltyko.insight_actions
  drop constraint insight_actions_actor_user_id_fkey,
  add constraint insight_actions_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete set null not valid;

-- 4. Acceso de equipo. La invitación aceptada conserva accepted_member_id (la
-- pertenencia seudonimizada); el servidor sustituye antes su email y nombre.
-- Los recibos de reintento se borran con la cuenta.
alter table zaltyko.organization_member_invitations
  drop constraint organization_member_invitations_accepted_by_user_id_fkey,
  add constraint organization_member_invitations_accepted_by_user_id_fkey
    foreign key (accepted_by_user_id) references auth.users(id) on delete set null not valid;
do $account_erasure_invitation_check$
declare
  check_name text;
begin
  select conname into strict check_name from pg_constraint
  where conrelid = 'zaltyko.organization_member_invitations'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%''accepted''::text) AND (accepted_by_user_id IS NOT NULL)%';
  -- Mismo nombre y misma expresión salvo accepted_by_user_id en «accepted».
  execute format('alter table zaltyko.organization_member_invitations drop constraint %I, add constraint %I check (%s) not valid',
    check_name, check_name,
    '(status = ''pending'' and accepted_by_user_id is null and accepted_member_id is null and accepted_at is null and revoked_by_member_id is null and revoked_at is null)'
    || ' or (status = ''accepted'' and accepted_member_id is not null and accepted_at is not null and revoked_by_member_id is null and revoked_at is null)'
    || ' or (status = ''revoked'' and accepted_by_user_id is null and accepted_member_id is null and accepted_at is null and revoked_by_member_id is not null and revoked_at is not null)');
end;
$account_erasure_invitation_check$;
alter table zaltyko.organization_team_command_receipts
  drop constraint organization_team_command_receipts_actor_user_id_fkey,
  add constraint organization_team_command_receipts_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete cascade not valid;

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

-- 6. Directorio público. La ficha y su historial se conservan; el derecho a
-- gestionar una ficha se borra con la cuenta. Las pruebas de una reclamación
-- siguen su purga de 30 días (src/lib/directory/maintenance.ts).
alter table public.directory_grants alter column approved_by drop not null;
alter table public.directory_grants
  drop constraint directory_grants_user_id_fkey,
  add constraint directory_grants_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade not valid,
  drop constraint directory_grants_approved_by_fkey,
  add constraint directory_grants_approved_by_fkey foreign key (approved_by) references auth.users(id) on delete set null not valid;
alter table public.directory_claims alter column user_id drop not null;
alter table public.directory_claims
  drop constraint directory_claims_user_id_fkey,
  add constraint directory_claims_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null not valid,
  drop constraint directory_claims_decided_by_fkey,
  add constraint directory_claims_decided_by_fkey foreign key (decided_by) references auth.users(id) on delete set null not valid;
alter table public.directory_revisions
  drop constraint directory_revisions_user_id_fkey,
  add constraint directory_revisions_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null not valid;
alter table public.directory_subscriptions
  drop constraint directory_subscriptions_user_id_fkey,
  add constraint directory_subscriptions_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null not valid;
alter table public.directory_audit
  drop constraint directory_audit_actor_id_fkey,
  add constraint directory_audit_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null not valid;

-- 7. Perfil legacy (public.profiles). La academia legacy nunca se borra como
-- efecto lateral (RESTRICT). Lo que la academia y otras personas conservan
-- (ficha de entrenador con sus clases y pagos, avisos, mensajes, invitaciones,
-- inscripciones a eventos con sus pagos, respuestas de soporte) queda con el
-- autor vacío.
alter table public.academies
  drop constraint academies_owner_id_profiles_id_fk,
  add constraint academies_owner_id_profiles_id_fk foreign key (owner_id) references public.profiles(id) on delete restrict not valid;
alter table public.coaches
  drop constraint coaches_profile_id_profiles_id_fk,
  add constraint coaches_profile_id_profiles_id_fk foreign key (profile_id) references public.profiles(id) on delete set null not valid;
alter table public.announcements alter column author_id drop not null;
alter table public.announcements
  drop constraint announcements_author_id_profiles_id_fk,
  add constraint announcements_author_id_profiles_id_fk foreign key (author_id) references public.profiles(id) on delete set null not valid;
alter table public.conversation_messages alter column sender_id drop not null;
alter table public.conversation_messages
  drop constraint conversation_messages_sender_id_profiles_id_fk,
  add constraint conversation_messages_sender_id_profiles_id_fk foreign key (sender_id) references public.profiles(id) on delete set null not valid;
alter table public.invitations alter column invited_by drop not null;
alter table public.invitations
  drop constraint invitations_invited_by_profiles_user_id_fk,
  add constraint invitations_invited_by_profiles_user_id_fk foreign key (invited_by) references public.profiles(user_id) on delete set null not valid;
alter table public.event_registrations alter column profile_id drop not null;
alter table public.event_registrations
  drop constraint event_registrations_profile_id_profiles_id_fk,
  add constraint event_registrations_profile_id_profiles_id_fk foreign key (profile_id) references public.profiles(id) on delete set null not valid;
alter table public.ticket_responses alter column user_id drop not null;
alter table public.ticket_responses
  drop constraint ticket_responses_user_id_profiles_id_fk,
  add constraint ticket_responses_user_id_profiles_id_fk foreign key (user_id) references public.profiles(id) on delete set null not valid;
alter table public.ticket_attachments alter column uploaded_by drop not null;
alter table public.ticket_attachments
  drop constraint ticket_attachments_uploaded_by_profiles_id_fk,
  add constraint ticket_attachments_uploaded_by_profiles_id_fk foreign key (uploaded_by) references public.profiles(id) on delete set null not valid;

-- 8. Filas nuevas: donde se quitó NOT NULL, el autor sigue siendo obligatorio
-- al insertar. Solo la clave foránea (al suprimir la cuenta) lo deja vacío.
create function zaltyko_domain_private.require_column_on_insert() returns trigger
  language plpgsql set search_path to '' as $$
begin
  if to_jsonb(new) ->> tg_argv[0] is null then
    raise exception 'null value in column "%" of relation "%" violates not-null constraint on insert', tg_argv[0], tg_table_name
      using errcode = '23502';
  end if;
  return new;
end
$$;
revoke all on function zaltyko_domain_private.require_column_on_insert() from public, anon, authenticated;
create trigger organization_members_user_id_required_on_insert before insert on zaltyko.organization_members
  for each row execute function zaltyko_domain_private.require_column_on_insert('user_id');
create trigger insight_actions_actor_user_id_required_on_insert before insert on zaltyko.insight_actions
  for each row execute function zaltyko_domain_private.require_column_on_insert('actor_user_id');
create trigger directory_grants_approved_by_required_on_insert before insert on public.directory_grants
  for each row execute function zaltyko_domain_private.require_column_on_insert('approved_by');
create trigger directory_claims_user_id_required_on_insert before insert on public.directory_claims
  for each row execute function zaltyko_domain_private.require_column_on_insert('user_id');
create trigger announcements_author_id_required_on_insert before insert on public.announcements
  for each row execute function zaltyko_domain_private.require_column_on_insert('author_id');
create trigger conversation_messages_sender_id_required_on_insert before insert on public.conversation_messages
  for each row execute function zaltyko_domain_private.require_column_on_insert('sender_id');
create trigger invitations_invited_by_required_on_insert before insert on public.invitations
  for each row execute function zaltyko_domain_private.require_column_on_insert('invited_by');
create trigger event_registrations_profile_id_required_on_insert before insert on public.event_registrations
  for each row execute function zaltyko_domain_private.require_column_on_insert('profile_id');
create trigger ticket_responses_user_id_required_on_insert before insert on public.ticket_responses
  for each row execute function zaltyko_domain_private.require_column_on_insert('user_id');
create trigger ticket_attachments_uploaded_by_required_on_insert before insert on public.ticket_attachments
  for each row execute function zaltyko_domain_private.require_column_on_insert('uploaded_by');
