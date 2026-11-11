-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (sandbox o producción). No aplicado en ningún entorno.
-- O1: entrenadora titular por clase y sustitución por sesión
-- (docs/producto/entrenadoras-por-clase.md).
-- Aditivo: dos relaciones nuevas en zaltyko; no cambia tablas, filas ni roles.
-- El único cambio sobre un objeto existente es retirar a anon y authenticated
-- el acceso directo a zaltyko.session_staff (ver el final). Las entrenadoras de cada sesión siguen viviendo en
-- zaltyko.session_staff (ya aplicada en 20261006080702); este candidato solo
-- añade la titular de la clase y la marca de sustitución con su motivo.
-- Reinstalar aborta antes de tocar nada: una instalación parcial o divergente
-- exige reconciliación humana, nunca reparación.
do $coach_assignment_candidate_preflight$
begin
  if to_regclass('zaltyko.class_template_staff') is not null
     or to_regclass('zaltyko.session_staff_overrides') is not null then
    raise exception 'Coach assignment candidate requires zaltyko.class_template_staff and zaltyko.session_staff_overrides absent; inspect existing schema before promotion';
  end if;
end;
$coach_assignment_candidate_preflight$;

-- Entrenadoras titulares de una clase. Las sesiones que se generan heredan
-- estas filas en zaltyko.session_staff. staff_profile_id apunta a la ficha de
-- equipo; el servidor solo admite fichas activas vinculadas a un miembro
-- activo con rol entrenador y acceso a la sede de la clase. Todas las
-- restricciones llevan nombre (< 63 caracteres) y el espejo Drizzle las
-- repite: lo comprueba tests/coach-assignment-contract.test.ts.
--
-- Borrados (ninguno bloquea a data-rights ni el borrado de cuentas):
-- - Clase o academia: la fila se borra en cascada.
-- - Ficha de equipo: la asignación se borra en cascada; el histórico queda en
--   zaltyko.audit_log (ids, sin nombres).
-- - Miembro que asignó (por ejemplo, al borrar su usuario de Auth, que borra
--   en cascada su organization_members): assigned_by_member_id pasa a null y
--   el resto de la fila se conserva. SET NULL con lista de columnas
--   (PostgreSQL 15+) para no anular organization_id.
create table zaltyko.class_template_staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  class_template_id uuid not null,
  staff_profile_id uuid not null,
  assigned_by_member_id uuid,
  assigned_at timestamptz not null default now(),
  constraint class_template_staff_uq unique (organization_id, class_template_id, staff_profile_id),
  constraint class_template_staff_template_fk
    foreign key (organization_id, class_template_id) references zaltyko.class_templates(organization_id, id) on delete cascade,
  constraint class_template_staff_profile_fk
    foreign key (organization_id, staff_profile_id) references zaltyko.staff_profiles(organization_id, id) on delete cascade,
  constraint class_template_staff_member_fk
    foreign key (organization_id, assigned_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (assigned_by_member_id)
);

create index class_template_staff_profile_idx
  on zaltyko.class_template_staff(organization_id, staff_profile_id);

-- Marca de sustitución: existe una fila cuando la dirección cambió las
-- entrenadoras de una sesión y ya no coinciden con las titulares de la clase.
-- Volver a las titulares borra la fila. El motivo es un código cerrado, sin
-- texto libre, para no guardar datos de salud ni otros datos personales en
-- una nota. Quién y cuándo quedan aquí y en zaltyko.audit_log. La sesión se
-- borra en cascada; si se borra el miembro que la hizo, changed_by_member_id
-- pasa a null (PostgreSQL 15+) y la marca se conserva.
create table zaltyko.session_staff_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  session_id uuid not null,
  reason text,
  changed_by_member_id uuid,
  changed_at timestamptz not null default now(),
  constraint session_staff_overrides_session_uq unique (organization_id, session_id),
  constraint session_staff_overrides_reason_check
    check (reason is null or reason in ('absence', 'reinforcement', 'one_off_change', 'other')),
  constraint session_staff_overrides_session_fk
    foreign key (organization_id, session_id) references zaltyko.sessions(organization_id, id) on delete cascade,
  constraint session_staff_overrides_member_fk
    foreign key (organization_id, changed_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (changed_by_member_id)
);

alter table zaltyko.class_template_staff enable row level security;
alter table zaltyko.class_template_staff force row level security;
alter table zaltyko.session_staff_overrides enable row level security;
alter table zaltyko.session_staff_overrides force row level security;
revoke all on table zaltyko.class_template_staff from public, anon, authenticated;
revoke all on table zaltyko.session_staff_overrides from public, anon, authenticated;
-- session_staff tiene GRANT SELECT a authenticated y una política por
-- academia desde 20261006080702. Hasta ahora estaba vacía; con titulares y
-- sustituciones tendrá datos reales, y esa política dejaría a cualquier
-- miembro leer las asignaciones de todas las sedes si el esquema zaltyko se
-- expone en la Data API. Nada en la app la lee con la clave de cliente: el
-- servidor autoriza con assertOperationalAccess. Se retira el acceso directo.
revoke all on table zaltyko.session_staff from anon, authenticated;
-- Sin políticas ni grants para clientes directos: el único escritor y lector es
-- el servidor, que autoriza con resolveOwnerScope y assertOperationalAccess.
-- Los datos son de la academia (responsable); Zaltyko los trata por su cuenta.
