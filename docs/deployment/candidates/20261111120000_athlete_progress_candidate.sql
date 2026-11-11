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
-- biblioteca de elementos todavía.
create table zaltyko.athlete_objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  athlete_id uuid not null,
  location_id uuid not null,
  client_request_id uuid not null,
  title text not null
    check (length(btrim(title)) between 2 and 120 and title !~ '[[:cntrl:]]'),
  discipline text
    check (discipline is null or discipline in ('gaf', 'gam')),
  apparatus text
    check (apparatus is null or apparatus in (
      'vault', 'uneven_bars', 'beam', 'floor', 'pommel_horse', 'rings', 'parallel_bars', 'high_bar'
    )),
  target_date date,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'achieved', 'discarded')),
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  status_changed_by_member_id uuid not null,
  status_changed_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, athlete_id, id),
  unique (organization_id, client_request_id),
  foreign key (organization_id, athlete_id) references zaltyko.athletes(organization_id, id) on delete cascade,
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  foreign key (organization_id, created_by_member_id) references zaltyko.organization_members(organization_id, id),
  foreign key (organization_id, status_changed_by_member_id) references zaltyko.organization_members(organization_id, id),
  -- El aparato pertenece a la disciplina: GAF tiene cuatro y GAM seis.
  check (
    apparatus is null
    or (discipline = 'gaf' and apparatus in ('vault', 'uneven_bars', 'beam', 'floor'))
    or (discipline = 'gam' and apparatus in ('floor', 'pommel_horse', 'rings', 'vault', 'parallel_bars', 'high_bar'))
  )
);

create index athlete_objectives_athlete_idx
  on zaltyko.athlete_objectives(organization_id, athlete_id, status, created_at);

-- Historial de estados: una fila al crear (from_status nulo, revisión 1) y una
-- por cada cambio posterior. Solo se inserta, nunca se edita.
create table zaltyko.athlete_objective_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  objective_id uuid not null,
  revision integer not null check (revision > 0),
  from_status text
    check (from_status is null or from_status in ('in_progress', 'achieved', 'discarded')),
  to_status text not null
    check (to_status in ('in_progress', 'achieved', 'discarded')),
  changed_by_member_id uuid not null,
  changed_at timestamptz not null default now(),
  unique (organization_id, objective_id, revision),
  foreign key (organization_id, objective_id) references zaltyko.athlete_objectives(organization_id, id) on delete cascade,
  foreign key (organization_id, changed_by_member_id) references zaltyko.organization_members(organization_id, id),
  check (from_status is distinct from to_status),
  check ((from_status is null and revision = 1) or (from_status is not null and revision > 1))
);

-- Observación breve sobre una gimnasta. visibility = 'family' marca la nota
-- como compartible con la familia, pero el portal de familias NO la muestra
-- todavía: exponerla es una decisión pendiente de Elvis.
create table zaltyko.athlete_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  athlete_id uuid not null,
  location_id uuid not null,
  client_request_id uuid not null,
  body text not null
    check (length(btrim(body)) between 1 and 1000),
  visibility text not null default 'team'
    check (visibility in ('team', 'family')),
  observed_on date not null,
  session_id uuid,
  objective_id uuid,
  author_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_by_member_id uuid not null,
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  unique (organization_id, id),
  unique (organization_id, client_request_id),
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
