create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  locale text not null default 'es-ES',
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create unique index if not exists countries_code_unique on countries (code);
create index if not exists countries_active_idx on countries (is_active);

create table if not exists sport_disciplines (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create unique index if not exists sport_disciplines_code_unique on sport_disciplines (code);
create index if not exists sport_disciplines_active_idx on sport_disciplines (is_active);

create table if not exists sport_branches (
  id uuid primary key default gen_random_uuid(),
  discipline_id uuid not null references sport_disciplines(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create unique index if not exists sport_branches_discipline_code_unique on sport_branches (discipline_id, code);
create index if not exists sport_branches_discipline_idx on sport_branches (discipline_id);

create table if not exists sport_locale_configs (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete cascade,
  discipline_id uuid not null references sport_disciplines(id) on delete cascade,
  branch_id uuid not null references sport_branches(id) on delete cascade,
  code text not null,
  name text not null,
  locale text not null default 'es-ES',
  federation text,
  config_version text not null default 'custom-v1',
  default_academy_type text not null default 'general',
  default_discipline_variant text not null default 'general',
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists sport_locale_configs_code_unique on sport_locale_configs (code);
create unique index if not exists sport_locale_configs_country_discipline_branch_unique on sport_locale_configs (country_id, discipline_id, branch_id);
create index if not exists sport_locale_configs_country_idx on sport_locale_configs (country_id);
create index if not exists sport_locale_configs_branch_idx on sport_locale_configs (branch_id);

create table if not exists terminology_dictionary (
  id uuid primary key default gen_random_uuid(),
  sport_locale_config_id uuid not null references sport_locale_configs(id) on delete cascade,
  terms jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists terminology_dictionary_config_unique on terminology_dictionary (sport_locale_config_id);

create table if not exists apparatus (
  id uuid primary key default gen_random_uuid(),
  sport_locale_config_id uuid not null references sport_locale_configs(id) on delete cascade,
  code text not null,
  name text not null,
  short_name text,
  is_optional boolean not null default false,
  sort_order integer not null default 0
);

create unique index if not exists apparatus_config_code_unique on apparatus (sport_locale_config_id, code);
create index if not exists apparatus_config_sort_idx on apparatus (sport_locale_config_id, sort_order);

create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  sport_locale_config_id uuid not null references sport_locale_configs(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create unique index if not exists programs_config_code_unique on programs (sport_locale_config_id, code);
create index if not exists programs_config_sort_idx on programs (sport_locale_config_id, sort_order);

create table if not exists levels (
  id uuid primary key default gen_random_uuid(),
  sport_locale_config_id uuid not null references sport_locale_configs(id) on delete cascade,
  program_code text,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create unique index if not exists levels_config_code_unique on levels (sport_locale_config_id, code);
create index if not exists levels_config_program_idx on levels (sport_locale_config_id, program_code);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  sport_locale_config_id uuid not null references sport_locale_configs(id) on delete cascade,
  code text not null,
  name text not null,
  min_age integer,
  max_age integer,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create unique index if not exists categories_config_code_unique on categories (sport_locale_config_id, code);
create index if not exists categories_config_sort_idx on categories (sport_locale_config_id, sort_order);

create table if not exists competition_types (
  id uuid primary key default gen_random_uuid(),
  sport_locale_config_id uuid not null references sport_locale_configs(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create unique index if not exists competition_types_config_code_unique on competition_types (sport_locale_config_id, code);

create table if not exists academy_sport_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  academy_id uuid not null references academies(id) on delete cascade,
  sport_locale_config_id uuid not null references sport_locale_configs(id) on delete restrict,
  academy_kind text not null default 'mixed',
  active_program_codes text[],
  active_apparatus_codes text[],
  terminology_overrides jsonb,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists academy_sport_configs_academy_config_unique on academy_sport_configs (academy_id, sport_locale_config_id);
create index if not exists academy_sport_configs_tenant_academy_idx on academy_sport_configs (tenant_id, academy_id);
create index if not exists academy_sport_configs_active_idx on academy_sport_configs (is_active);

alter table groups add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;
alter table groups add column if not exists program_code text;
alter table groups add column if not exists level_code text;
alter table groups add column if not exists category_code text;
create index if not exists groups_sport_config_idx on groups (sport_config_id);

alter table classes add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;
create index if not exists classes_sport_config_idx on classes (sport_config_id);

alter table class_sessions add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;
create index if not exists class_sessions_sport_config_idx on class_sessions (sport_config_id);

alter table athletes add column if not exists primary_sport_config_id uuid references academy_sport_configs(id) on delete set null;
alter table athletes add column if not exists program_code text;
alter table athletes add column if not exists level_code text;
alter table athletes add column if not exists category_code text;
create index if not exists athletes_primary_sport_config_idx on athletes (primary_sport_config_id);

create table if not exists athlete_sport_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  athlete_id uuid not null references athletes(id) on delete cascade,
  academy_sport_config_id uuid not null references academy_sport_configs(id) on delete cascade,
  program_code text,
  level_code text,
  category_code text,
  created_at timestamptz default now()
);

create unique index if not exists athlete_sport_configs_athlete_config_unique on athlete_sport_configs (athlete_id, academy_sport_config_id);
create index if not exists athlete_sport_configs_tenant_idx on athlete_sport_configs (tenant_id);
create index if not exists athlete_sport_configs_config_idx on athlete_sport_configs (academy_sport_config_id);

alter table athlete_assessments add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;
create index if not exists athlete_assessments_sport_config_idx on athlete_assessments (sport_config_id);

create table if not exists coach_sport_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  coach_id uuid not null references coaches(id) on delete cascade,
  academy_sport_config_id uuid not null references academy_sport_configs(id) on delete cascade,
  created_at timestamptz default now()
);

create unique index if not exists coach_sport_configs_unique on coach_sport_configs (tenant_id, coach_id, academy_sport_config_id);
create index if not exists coach_sport_configs_coach_idx on coach_sport_configs (coach_id);
create index if not exists coach_sport_configs_config_idx on coach_sport_configs (academy_sport_config_id);
create index if not exists coach_sport_configs_tenant_idx on coach_sport_configs (tenant_id);

alter table events add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;
alter table events add column if not exists competition_type_code text;
create index if not exists events_sport_config_idx on events (sport_config_id);
create index if not exists events_competition_type_idx on events (competition_type_code);

alter table federative_licenses add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;
create index if not exists federative_licenses_sport_config_idx on federative_licenses (sport_config_id);

alter table competition_results add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;
create index if not exists competition_results_sport_config_idx on competition_results (sport_config_id);
