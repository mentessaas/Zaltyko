-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (sandbox o producción). No aplicado en ningún entorno.
-- P2 #17, segunda parte: planificación sobre sesiones
-- (docs/producto/planificacion-sesiones.md).
-- Aditivo: cuatro relaciones nuevas en zaltyko; no cambia tablas, filas, roles
-- ni objetos existentes. Depende del candidato de objetivos y observaciones
-- (20261111120000_athlete_progress_candidate.sql), que debe aplicarse antes:
-- el vínculo de un plan con objetivos de gimnastas apunta a athlete_objectives.
-- Reinstalar aborta antes de tocar nada.
do $session_plans_candidate_preflight$
begin
  if to_regclass('zaltyko.athlete_objectives') is null then
    raise exception 'Session plans candidate requires zaltyko.athlete_objectives (athlete progress candidate) installed first';
  end if;
  if to_regclass('zaltyko.session_plans') is not null
     or to_regclass('zaltyko.session_plan_blocks') is not null
     or to_regclass('zaltyko.session_plan_objectives') is not null
     or to_regclass('zaltyko.class_plan_templates') is not null then
    raise exception 'Session plans candidate requires session_plans, session_plan_blocks, session_plan_objectives and class_plan_templates absent; inspect existing schema before promotion';
  end if;
end;
$session_plans_candidate_preflight$;

-- Plan de una sesión concreta: foco del día y una nota. Uno por sesión. Si se
-- creó desde la plantilla de la clase, guarda su revisión de origen (copia:
-- cambiar la plantilla no toca planes ya creados).
create table zaltyko.session_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  session_id uuid not null,
  client_request_id uuid not null,
  focus text,
  note text,
  from_template_revision integer,
  revision integer not null default 1,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_by_member_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint session_plans_org_id_uq unique (organization_id, id),
  constraint session_plans_session_uq unique (organization_id, session_id),
  constraint session_plans_request_uq unique (organization_id, client_request_id),
  constraint session_plans_focus_check
    check (focus is null or (length(btrim(focus)) >= 1 and length(focus) <= 200)),
  constraint session_plans_note_check
    check (note is null or length(note) <= 1000),
  constraint session_plans_template_revision_check
    check (from_template_revision is null or from_template_revision > 0),
  constraint session_plans_revision_check
    check (revision > 0),
  -- La sesión es de la misma sede que el plan. NO ACTION: ninguna sesión se
  -- borra (tests/zaltyko-sessions-never-deleted.test.ts).
  foreign key (organization_id, location_id, session_id) references zaltyko.sessions(organization_id, location_id, id),
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  foreign key (organization_id, created_by_member_id) references zaltyko.organization_members(organization_id, id),
  foreign key (organization_id, updated_by_member_id) references zaltyko.organization_members(organization_id, id)
);

-- Bloques del plan: tipo, disciplina y aparato de una lista cerrada (sin
-- biblioteca GAF/GAM/GR todavía), contenido libre y duración aproximada. Se
-- pueden marcar como hechos una vez empezada la sesión.
create table zaltyko.session_plan_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  plan_id uuid not null,
  position integer not null,
  kind text not null,
  discipline text,
  apparatus text,
  content text not null,
  duration_minutes integer,
  done_at timestamptz,
  done_by_member_id uuid,
  created_at timestamptz not null default now(),
  constraint session_plan_blocks_org_id_uq unique (organization_id, id),
  constraint session_plan_blocks_position_uq unique (organization_id, plan_id, position),
  constraint session_plan_blocks_position_check
    check (position >= 1 and position <= 20),
  constraint session_plan_blocks_kind_check
    check (kind in ('warmup', 'technique', 'conditioning', 'flexibility', 'choreography', 'cooldown', 'other')),
  constraint session_plan_blocks_discipline_check
    check (discipline is null or discipline in ('gaf', 'gam', 'gr')),
  constraint session_plan_blocks_apparatus_check
    check (apparatus is null or (discipline = 'gaf' and apparatus in ('vault', 'uneven_bars', 'beam', 'floor')) or (discipline = 'gam' and apparatus in ('floor', 'pommel_horse', 'rings', 'vault', 'parallel_bars', 'high_bar')) or (discipline = 'gr' and apparatus in ('freehand', 'rope', 'hoop', 'ball', 'clubs', 'ribbon'))),
  constraint session_plan_blocks_content_check
    check (length(btrim(content)) >= 1 and length(content) <= 300),
  constraint session_plan_blocks_duration_check
    check (duration_minutes is null or (duration_minutes >= 1 and duration_minutes <= 240)),
  constraint session_plan_blocks_done_check
    check ((done_at is null and done_by_member_id is null) or (done_at is not null and done_by_member_id is not null)),
  foreign key (organization_id, plan_id) references zaltyko.session_plans(organization_id, id) on delete cascade,
  foreign key (organization_id, done_by_member_id) references zaltyko.organization_members(organization_id, id)
);

-- Objetivos de gimnastas que el plan trabaja (P2 #17 primera parte). El
-- servidor solo admite objetivos de gimnastas que participan en esa sesión.
create table zaltyko.session_plan_objectives (
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  plan_id uuid not null,
  athlete_id uuid not null,
  objective_id uuid not null,
  created_at timestamptz not null default now(),
  constraint session_plan_objectives_pkey primary key (organization_id, plan_id, objective_id),
  foreign key (organization_id, plan_id) references zaltyko.session_plans(organization_id, id) on delete cascade,
  foreign key (organization_id, athlete_id, objective_id) references zaltyko.athlete_objectives(organization_id, athlete_id, id) on delete cascade
);

-- Plantilla opcional por clase: se copia al crear el plan de una sesión.
create table zaltyko.class_plan_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  class_template_id uuid not null,
  focus text,
  note text,
  blocks jsonb not null default '[]'::jsonb,
  revision integer not null default 1,
  updated_by_member_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint class_plan_templates_org_id_uq unique (organization_id, id),
  constraint class_plan_templates_class_uq unique (organization_id, class_template_id),
  constraint class_plan_templates_focus_check
    check (focus is null or (length(btrim(focus)) >= 1 and length(focus) <= 200)),
  constraint class_plan_templates_note_check
    check (note is null or length(note) <= 1000),
  constraint class_plan_templates_blocks_check
    check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 20),
  constraint class_plan_templates_revision_check
    check (revision > 0),
  -- La clase es de la misma sede que la plantilla.
  foreign key (organization_id, location_id, class_template_id) references zaltyko.class_templates(organization_id, location_id, id) on delete cascade,
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  foreign key (organization_id, updated_by_member_id) references zaltyko.organization_members(organization_id, id)
);

create index session_plan_objectives_objective_idx
  on zaltyko.session_plan_objectives(organization_id, objective_id);

alter table zaltyko.session_plans enable row level security;
alter table zaltyko.session_plans force row level security;
alter table zaltyko.session_plan_blocks enable row level security;
alter table zaltyko.session_plan_blocks force row level security;
alter table zaltyko.session_plan_objectives enable row level security;
alter table zaltyko.session_plan_objectives force row level security;
alter table zaltyko.class_plan_templates enable row level security;
alter table zaltyko.class_plan_templates force row level security;
revoke all on table zaltyko.session_plans from public, anon, authenticated;
revoke all on table zaltyko.session_plan_blocks from public, anon, authenticated;
revoke all on table zaltyko.session_plan_objectives from public, anon, authenticated;
revoke all on table zaltyko.class_plan_templates from public, anon, authenticated;
-- Sin políticas ni grants para clientes directos: el servidor autoriza con
-- resolveOwnerScope y assertOperationalAccess.
