-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (sandbox, staging o producción). No aplicado en ningún entorno.
-- Niveles y progresión por aparato (brecha A6 del análisis de competencia;
-- docs/producto/niveles-y-progresion.md).
-- Aditivo: cinco relaciones nuevas en zaltyko; no cambia tablas, filas, roles ni
-- objetos existentes. No depende del candidato de objetivos y observaciones.
-- Reinstalar aborta antes de tocar nada: una instalación parcial o divergente
-- exige reconciliación humana, nunca reparación.
do $skill_levels_candidate_preflight$
begin
  if to_regclass('zaltyko.skill_templates') is not null
     or to_regclass('zaltyko.skill_levels') is not null
     or to_regclass('zaltyko.skill_elements') is not null
     or to_regclass('zaltyko.athlete_skill_progress') is not null
     or to_regclass('zaltyko.athlete_level_passes') is not null then
    raise exception 'Skill levels candidate requires zaltyko.skill_templates, zaltyko.skill_levels, zaltyko.skill_elements, zaltyko.athlete_skill_progress and zaltyko.athlete_level_passes absent; inspect existing schema before promotion';
  end if;
end;
$skill_levels_candidate_preflight$;

-- Plantilla de niveles de la academia (por disciplina). Las plantillas de
-- ejemplo viven en código y NO se guardan aquí: la academia crea una en blanco,
-- copia un ejemplo (source = 'starter', con starter_key) u otra suya
-- (source = 'copy') y la edita. Archivar no borra: el progreso se conserva.
-- Todas las restricciones llevan nombre (< 63 caracteres) y el espejo Drizzle
-- las repite: lo comprueba tests/skill-levels-contract.test.ts.
create table zaltyko.skill_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  client_request_id uuid not null,
  discipline text not null,
  name text not null,
  description text,
  source text not null default 'blank',
  starter_key text,
  archived_at timestamptz,
  revision integer not null default 1,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  updated_by_member_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint skill_templates_org_id_uq unique (organization_id, id),
  constraint skill_templates_request_uq unique (organization_id, client_request_id),
  constraint skill_templates_name_check
    check (length(btrim(name)) between 2 and 80 and name !~ '[[:cntrl:]]'),
  constraint skill_templates_description_check
    check (description is null or (length(description) <= 300 and description !~ '[[:cntrl:]]')),
  constraint skill_templates_discipline_check
    check (discipline in ('artistic_female', 'artistic_male', 'rhythmic')),
  constraint skill_templates_source_check
    check (source in ('blank', 'starter', 'copy')),
  constraint skill_templates_starter_key_check
    check ((source = 'starter') = (starter_key is not null)),
  constraint skill_templates_revision_check
    check (revision > 0),
  foreign key (organization_id, created_by_member_id) references zaltyko.organization_members(organization_id, id),
  foreign key (organization_id, updated_by_member_id) references zaltyko.organization_members(organization_id, id)
);

create index skill_templates_org_idx
  on zaltyko.skill_templates(organization_id, discipline, archived_at);

-- Nivel de una plantilla, en orden (position). Los niveles quitados en una
-- edición se archivan, no se borran, para conservar los pasos de nivel.
create table zaltyko.skill_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  template_id uuid not null,
  position integer not null,
  name text not null,
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skill_levels_org_id_uq unique (organization_id, id),
  constraint skill_levels_org_template_id_uq unique (organization_id, template_id, id),
  constraint skill_levels_position_check
    check (position > 0),
  constraint skill_levels_name_check
    check (length(btrim(name)) between 1 and 60 and name !~ '[[:cntrl:]]'),
  constraint skill_levels_description_check
    check (description is null or (length(description) <= 300 and description !~ '[[:cntrl:]]')),
  foreign key (organization_id, template_id) references zaltyko.skill_templates(organization_id, id) on delete cascade
);

create index skill_levels_template_idx
  on zaltyko.skill_levels(organization_id, template_id, position);

-- Elemento o habilidad de un nivel, con su aparato (null = general). is_required
-- decide si cuenta para pasar de nivel. El aparato se valida contra la
-- disciplina de la plantilla en el servidor.
create table zaltyko.skill_elements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  template_id uuid not null,
  level_id uuid not null,
  position integer not null,
  apparatus text,
  name text not null,
  description text,
  is_required boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skill_elements_org_id_uq unique (organization_id, id),
  constraint skill_elements_org_template_id_uq unique (organization_id, template_id, id),
  constraint skill_elements_position_check
    check (position > 0),
  constraint skill_elements_name_check
    check (length(btrim(name)) between 2 and 100 and name !~ '[[:cntrl:]]'),
  constraint skill_elements_description_check
    check (description is null or (length(description) <= 300 and description !~ '[[:cntrl:]]')),
  constraint skill_elements_apparatus_check
    check (apparatus is null or apparatus in ('vault', 'uneven_bars', 'beam', 'floor', 'pommel_horse', 'rings', 'parallel_bars', 'high_bar', 'rope', 'hoop', 'ball', 'clubs', 'ribbon', 'body')),
  -- El nivel es de la misma plantilla que el elemento.
  foreign key (organization_id, template_id, level_id) references zaltyko.skill_levels(organization_id, template_id, id) on delete cascade
);

create index skill_elements_level_idx
  on zaltyko.skill_elements(organization_id, template_id, level_id, position);

-- Estado de un elemento para una gimnasta: una fila por gimnasta y elemento
-- (la ausencia de fila es «no iniciado»). location_id es la sede desde la que
-- se evaluó; el progreso pertenece a la gimnasta, no a la sede, así que NO
-- restringe la lectura. Guarda quién evaluó y cuándo.
create table zaltyko.athlete_skill_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  athlete_id uuid not null,
  template_id uuid not null,
  element_id uuid not null,
  location_id uuid not null,
  status text not null default 'not_started',
  achieved_on date,
  evaluated_by_member_id uuid not null,
  evaluated_at timestamptz not null default now(),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_skill_progress_org_id_uq unique (organization_id, id),
  constraint athlete_skill_progress_element_uq unique (organization_id, athlete_id, element_id),
  constraint athlete_skill_progress_status_check
    check (status in ('not_started', 'in_progress', 'achieved')),
  constraint athlete_skill_progress_achieved_on_check
    check ((status = 'achieved') = (achieved_on is not null)),
  constraint athlete_skill_progress_revision_check
    check (revision > 0),
  foreign key (organization_id, athlete_id) references zaltyko.athletes(organization_id, id) on delete cascade,
  -- El elemento es de la plantilla indicada.
  foreign key (organization_id, template_id, element_id) references zaltyko.skill_elements(organization_id, template_id, id) on delete cascade,
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  foreign key (organization_id, evaluated_by_member_id) references zaltyko.organization_members(organization_id, id)
);

create index athlete_skill_progress_athlete_idx
  on zaltyko.athlete_skill_progress(organization_id, athlete_id, template_id);

-- Paso de nivel de una gimnasta: un hecho con fecha y responsable, que es
-- también el origen del diploma (el identificador de la fila). Solo se
-- inserta: no se edita ni se anula en esta versión.
create table zaltyko.athlete_level_passes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  athlete_id uuid not null,
  template_id uuid not null,
  level_id uuid not null,
  location_id uuid not null,
  client_request_id uuid not null,
  passed_on date not null,
  passed_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  constraint athlete_level_passes_org_id_uq unique (organization_id, id),
  constraint athlete_level_passes_request_uq unique (organization_id, client_request_id),
  constraint athlete_level_passes_level_uq unique (organization_id, athlete_id, level_id),
  foreign key (organization_id, athlete_id) references zaltyko.athletes(organization_id, id) on delete cascade,
  -- El nivel es de la plantilla indicada.
  foreign key (organization_id, template_id, level_id) references zaltyko.skill_levels(organization_id, template_id, id) on delete cascade,
  foreign key (organization_id, location_id) references zaltyko.locations(organization_id, id),
  foreign key (organization_id, passed_by_member_id) references zaltyko.organization_members(organization_id, id)
);

create index athlete_level_passes_athlete_idx
  on zaltyko.athlete_level_passes(organization_id, athlete_id, template_id);

alter table zaltyko.skill_templates enable row level security;
alter table zaltyko.skill_templates force row level security;
alter table zaltyko.skill_levels enable row level security;
alter table zaltyko.skill_levels force row level security;
alter table zaltyko.skill_elements enable row level security;
alter table zaltyko.skill_elements force row level security;
alter table zaltyko.athlete_skill_progress enable row level security;
alter table zaltyko.athlete_skill_progress force row level security;
alter table zaltyko.athlete_level_passes enable row level security;
alter table zaltyko.athlete_level_passes force row level security;
revoke all on table zaltyko.skill_templates from public, anon, authenticated;
revoke all on table zaltyko.skill_levels from public, anon, authenticated;
revoke all on table zaltyko.skill_elements from public, anon, authenticated;
revoke all on table zaltyko.athlete_skill_progress from public, anon, authenticated;
revoke all on table zaltyko.athlete_level_passes from public, anon, authenticated;
-- Sin políticas ni grants para clientes directos: el único escritor y lector es
-- el servidor, que autoriza con resolveOwnerScope y assertOperationalAccess.
-- Los datos son de la academia (responsable); Zaltyko los trata por su cuenta.
