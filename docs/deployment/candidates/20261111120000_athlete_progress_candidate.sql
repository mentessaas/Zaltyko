-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (sandbox o producción). No aplicado en ningún entorno.
-- P2 #17, primera parte: objetivos y observaciones por gimnasta
-- (docs/producto/objetivos-y-observaciones.md).
-- Aditivo: tres relaciones nuevas en zaltyko; no cambia tablas, filas, roles ni
-- objetos existentes. Reinstalar aborta antes de tocar nada: una instalación
-- parcial o divergente exige reconciliación humana, nunca reparación.
do $athlete_progress_candidate_preflight$
begin
  if to_regclass('zaltyko.athlete_objectives') is not null
     or to_regclass('zaltyko.athlete_objective_status_history') is not null
     or to_regclass('zaltyko.athlete_observations') is not null then
    raise exception 'Athlete progress candidate requires zaltyko.athlete_objectives, zaltyko.athlete_objective_status_history and zaltyko.athlete_observations absent; inspect existing schema before promotion';
  end if;
end;
$athlete_progress_candidate_preflight$;

-- Objetivo de una gimnasta. location_id es la sede desde la que se creó: es el
-- ancla de visibilidad para quien solo tiene algunas sedes (entrenador o
-- coordinación con sedes seleccionadas). Aparato opcional, solo GAF/GAM y sin
-- biblioteca de elementos todavía. Todas las restricciones llevan nombre (< 63
-- caracteres) y el espejo Drizzle las repite: lo comprueba
-- tests/athlete-progress-contract.test.ts.
create table zaltyko.athlete_objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  athlete_id uuid not null,
  location_id uuid not null,
  client_request_id uuid not null,
  title text not null,
  discipline text,
  apparatus text,
  target_date date,
  status text not null default 'in_progress',
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  status_changed_by_member_id uuid not null,
  status_changed_at timestamptz not null default now(),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint athlete_objectives_org_id_uq unique (organization_id, id),
  constraint athlete_objectives_org_athlete_id_uq unique (organization_id, athlete_id, id),
  constraint athlete_objectives_request_uq unique (organization_id, client_request_id),
  constraint athlete_objectives_title_check
    check (length(btrim(title)) between 2 and 120 and title !~ '[[:cntrl:]]'),
  constraint athlete_objectives_discipline_check
    check (discipline is null or discipline in ('gaf', 'gam')),
  constraint athlete_objectives_apparatus_check
    check (apparatus is null or apparatus in ('vault', 'uneven_bars', 'beam', 'floor', 'pommel_horse', 'rings', 'parallel_bars', 'high_bar')),
  -- El aparato pertenece a la disciplina: GAF tiene cuatro y GAM seis.
  constraint athlete_objectives_apparatus_discipline_check
    check (apparatus is null or (discipline = 'gaf' and apparatus in ('vault', 'uneven_bars', 'beam', 'floor')) or (discipline = 'gam' and apparatus in ('floor', 'pommel_horse', 'rings', 'vault', 'parallel_bars', 'high_bar'))),
  constraint athlete_objectives_status_check
    check (status in ('in_progress', 'achieved', 'discarded')),
  constraint athlete_objectives_revision_check
    check (revision > 0),
  foreign key (organization_id, athlete_id) references zaltyko.athletes(organization_id, id) on delete cascade,
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  foreign key (organization_id, created_by_member_id) references zaltyko.organization_members(organization_id, id),
  foreign key (organization_id, status_changed_by_member_id) references zaltyko.organization_members(organization_id, id)
);

create index athlete_objectives_athlete_idx
  on zaltyko.athlete_objectives(organization_id, athlete_id, status, created_at);

-- Historial de estados: una fila al crear (from_status nulo, revisión 1) y una
-- por cada cambio posterior. Solo se inserta, nunca se edita.
create table zaltyko.athlete_objective_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  objective_id uuid not null,
  revision integer not null,
  from_status text,
  to_status text not null,
  changed_by_member_id uuid not null,
  changed_at timestamptz not null default now(),
  constraint athlete_objective_history_revision_uq unique (organization_id, objective_id, revision),
  constraint athlete_objective_history_revision_check
    check (revision > 0),
  constraint athlete_objective_history_from_status_check
    check (from_status is null or from_status in ('in_progress', 'achieved', 'discarded')),
  constraint athlete_objective_history_to_status_check
    check (to_status in ('in_progress', 'achieved', 'discarded')),
  constraint athlete_objective_history_transition_check
    check (from_status is distinct from to_status),
  constraint athlete_objective_history_first_revision_check
    check ((from_status is null and revision = 1) or (from_status is not null and revision > 1)),
  foreign key (organization_id, objective_id) references zaltyko.athlete_objectives(organization_id, id) on delete cascade,
  foreign key (organization_id, changed_by_member_id) references zaltyko.organization_members(organization_id, id)
);

-- Observación breve sobre una gimnasta. visibility = 'family' marca la nota
-- como compartible con la familia, pero el portal de familias NO la muestra
-- todavía: exponerla es una decisión pendiente de Elvis.
-- La FK a sesiones es NO ACTION a propósito: ningún flujo borra sesiones (se
-- cancelan por estado) y un `set null` compuesto anularía también
-- organization_id y location_id. Si algún día se borran sesiones, usar
-- `on delete set null (session_id)` (PostgreSQL 15+) en otra migración.
create table zaltyko.athlete_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  athlete_id uuid not null,
  location_id uuid not null,
  client_request_id uuid not null,
  body text not null,
  visibility text not null default 'team',
  observed_on date not null,
  session_id uuid,
  objective_id uuid,
  author_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_by_member_id uuid not null,
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  constraint athlete_observations_org_id_uq unique (organization_id, id),
  constraint athlete_observations_request_uq unique (organization_id, client_request_id),
  constraint athlete_observations_body_check
    check (length(btrim(body)) between 1 and 1000),
  constraint athlete_observations_visibility_check
    check (visibility in ('team', 'family')),
  constraint athlete_observations_revision_check
    check (revision > 0),
  foreign key (organization_id, athlete_id) references zaltyko.athletes(organization_id, id) on delete cascade,
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  -- La sesión, si la hay, es de la misma sede que la observación.
  foreign key (organization_id, location_id, session_id) references zaltyko.sessions(organization_id, location_id, id),
  -- El objetivo, si lo hay, es de la misma gimnasta.
  foreign key (organization_id, athlete_id, objective_id) references zaltyko.athlete_objectives(organization_id, athlete_id, id) on delete cascade,
  foreign key (organization_id, author_member_id) references zaltyko.organization_members(organization_id, id),
  foreign key (organization_id, updated_by_member_id) references zaltyko.organization_members(organization_id, id)
);

create index athlete_observations_athlete_idx
  on zaltyko.athlete_observations(organization_id, athlete_id, observed_on, created_at);

alter table zaltyko.athlete_objectives enable row level security;
alter table zaltyko.athlete_objectives force row level security;
alter table zaltyko.athlete_objective_status_history enable row level security;
alter table zaltyko.athlete_objective_status_history force row level security;
alter table zaltyko.athlete_observations enable row level security;
alter table zaltyko.athlete_observations force row level security;
revoke all on table zaltyko.athlete_objectives from public, anon, authenticated;
revoke all on table zaltyko.athlete_objective_status_history from public, anon, authenticated;
revoke all on table zaltyko.athlete_observations from public, anon, authenticated;
-- Sin políticas ni grants para clientes directos: el único escritor y lector es
-- el servidor, que autoriza con resolveOwnerScope y assertOperationalAccess.
-- Los datos son de la academia (responsable); Zaltyko los trata por su cuenta.
