-- CANDIDATE ONLY. Requires Elvis's explicit authorization before any hosted apply.
-- CANDIDATO: requiere autorización de Elvis. No aplicar en sandbox ni producción.
-- Panel interno de inteligencia competitiva (super-admin).
-- Additive: eight new public relations prefixed ci_; no existing table, row,
-- role or policy changes. Global market data only: no tenant, academy, family
-- or minor data is stored here.
-- Reapplication deliberately aborts before touching anything.
do $ci_candidate_preflight$
begin
  if to_regclass('public.ci_competitors') is not null
     or to_regclass('public.ci_sources') is not null
     or to_regclass('public.ci_competitor_sections') is not null
     or to_regclass('public.ci_flows') is not null
     or to_regclass('public.ci_competitor_flows') is not null
     or to_regclass('public.ci_pricing_plans') is not null
     or to_regclass('public.ci_opportunities') is not null
     or to_regclass('public.ci_change_events') is not null then
    raise exception 'Competitive intelligence candidate requires all ci_* relations absent; inspect existing schema before promotion';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Competitive intelligence candidate requires public.profiles';
  end if;
end;
$ci_candidate_preflight$;

create table public.ci_competitors (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  website text,
  competitor_type text not null,
  countries text[] not null default '{}'::text[],
  disciplines text[] not null default '{}'::text[],
  client_sizes text[] not null default '{}'::text[],
  research_status text not null default 'pendiente',
  lifecycle_status text not null default 'activo',
  archived_at timestamptz,
  summary text,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ci_competitors_type_check check (competitor_type in ('directo', 'espana_gimnasia', 'internacional', 'adyacente')),
  constraint ci_competitors_research_check check (research_status in ('pendiente', 'en_curso', 'completa')),
  constraint ci_competitors_lifecycle_check check (lifecycle_status in ('activo', 'inactivo', 'archivado')),
  constraint ci_competitors_archived_check check ((lifecycle_status = 'archivado') = (archived_at is not null)),
  constraint ci_competitors_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint ci_competitors_website_check check (website is null or website ~* '^https?://')
);
create unique index ci_competitors_slug_unique on public.ci_competitors(slug);
create index ci_competitors_lifecycle_idx on public.ci_competitors(lifecycle_status, name);

create table public.ci_sources (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references public.ci_competitors(id) on delete set null,
  url text not null,
  title text,
  accessed_on date not null,
  source_type text not null default 'web_oficial',
  claim text not null,
  evidence_level text not null default 'declarado',
  notes text,
  accessible boolean not null default true,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ci_sources_type_check check (source_type in ('web_oficial', 'precios', 'tutorial_demo', 'app_store', 'resena', 'prensa', 'dossier', 'alianza', 'redes', 'anuncio', 'registro', 'otro')),
  constraint ci_sources_evidence_check check (evidence_level in ('observado', 'declarado', 'confirmado', 'inferido', 'sin_evidencia')),
  constraint ci_sources_url_check check (url ~ '^https?://')
);
create index ci_sources_competitor_idx on public.ci_sources(competitor_id, accessed_on);

create table public.ci_competitor_sections (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.ci_competitors(id) on delete cascade,
  section text not null,
  content text not null default '',
  data_status text not null default 'pendiente_revision',
  evidence_level text not null default 'sin_evidencia',
  last_verified_on date,
  review_after_days integer not null default 90,
  source_ids uuid[] not null default '{}'::uuid[],
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ci_competitor_sections_section_check check (section in ('descripcion', 'icp', 'buyer_persona', 'fundadores_equipo', 'posicionamiento', 'promesas', 'funciones', 'precios', 'limites', 'modelo_negocio', 'captacion', 'contenido', 'alianzas', 'fortalezas', 'debilidades', 'oportunidades_zaltyko')),
  constraint ci_competitor_sections_status_check check (data_status in ('verificado', 'pendiente_revision', 'desactualizado')),
  constraint ci_competitor_sections_evidence_check check (evidence_level in ('observado', 'declarado', 'confirmado', 'inferido', 'sin_evidencia')),
  constraint ci_competitor_sections_review_check check (review_after_days between 1 and 730)
);
create unique index ci_competitor_sections_unique on public.ci_competitor_sections(competitor_id, section);

create table public.ci_flows (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  valued_by text,
  zaltyko_status text not null default 'ausente',
  zaltyko_code_refs text,
  demand_evidence text,
  opportunity text,
  decision text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ci_flows_status_check check (zaltyko_status in ('completo', 'parcial', 'flag', 'pendiente_produccion', 'ausente')),
  constraint ci_flows_decision_check check (decision is null or decision in ('igualar', 'superar', 'diferenciar', 'posponer'))
);
create unique index ci_flows_key_unique on public.ci_flows(key);

create table public.ci_competitor_flows (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.ci_competitors(id) on delete cascade,
  flow_id uuid not null references public.ci_flows(id) on delete cascade,
  coverage text not null default 'desconocido',
  evidence_level text not null default 'sin_evidencia',
  source_id uuid references public.ci_sources(id) on delete set null,
  notes text,
  updated_at timestamptz not null default now(),
  constraint ci_competitor_flows_coverage_check check (coverage in ('resuelve', 'parcial', 'no', 'desconocido')),
  constraint ci_competitor_flows_evidence_check check (evidence_level in ('observado', 'declarado', 'confirmado', 'inferido', 'sin_evidencia'))
);
create unique index ci_competitor_flows_unique on public.ci_competitor_flows(competitor_id, flow_id);
create index ci_competitor_flows_flow_idx on public.ci_competitor_flows(flow_id);
create index ci_competitor_flows_source_idx on public.ci_competitor_flows(source_id);

create table public.ci_pricing_plans (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.ci_competitors(id) on delete cascade,
  plan_name text not null,
  price_amount numeric(10, 2),
  currency text not null default 'EUR',
  billing_period text not null default 'mes',
  vat_mode text not null default 'desconocido',
  limits_text text,
  fees_text text,
  extras_text text,
  trial_text text,
  commitment_text text,
  estimate_small text,
  estimate_medium text,
  estimate_large text,
  source_id uuid references public.ci_sources(id) on delete set null,
  data_status text not null default 'pendiente_revision',
  last_verified_on date,
  review_after_days integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ci_pricing_plans_period_check check (billing_period in ('mes', 'ano', 'unico', 'consultar')),
  constraint ci_pricing_plans_vat_check check (vat_mode in ('incluido', 'excluido', 'desconocido')),
  constraint ci_pricing_plans_status_check check (data_status in ('verificado', 'pendiente_revision', 'desactualizado')),
  constraint ci_pricing_plans_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint ci_pricing_plans_amount_check check (price_amount is null or price_amount >= 0),
  constraint ci_pricing_plans_review_check check (review_after_days between 1 and 730)
);
create unique index ci_pricing_plans_unique on public.ci_pricing_plans(competitor_id, plan_name);
create index ci_pricing_plans_source_idx on public.ci_pricing_plans(source_id);

create table public.ci_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  classification text not null,
  priority integer,
  who_pays text,
  frequency text,
  current_cost text,
  minimum_solution text,
  code_dependencies text,
  confidence text not null default 'baja',
  effort text,
  success_metric text,
  validation_plan text,
  status text not null default 'hipotesis',
  competitor_ids uuid[] not null default '{}'::uuid[],
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ci_opportunities_class_check check (classification in ('igualar', 'superar', 'diferenciar', 'posponer')),
  constraint ci_opportunities_status_check check (status in ('hipotesis', 'validando', 'decidida', 'descartada')),
  constraint ci_opportunities_confidence_check check (confidence in ('alta', 'media', 'baja')),
  constraint ci_opportunities_effort_check check (effort is null or effort in ('S', 'M', 'L')),
  constraint ci_opportunities_priority_check check (priority is null or priority between 1 and 99)
);
create unique index ci_opportunities_title_unique on public.ci_opportunities(title);
create index ci_opportunities_priority_idx on public.ci_opportunities(status, priority);

create table public.ci_change_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  competitor_id uuid references public.ci_competitors(id) on delete set null,
  action text not null,
  summary text not null,
  diff jsonb,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ci_change_events_recent_idx on public.ci_change_events(created_at);
create index ci_change_events_competitor_idx on public.ci_change_events(competitor_id, created_at);

-- Internal tables: the server connects with BYPASSRLS and withSuperAdmin is the
-- only gate. Direct Supabase clients get nothing (same pattern as
-- 20261002120000_internal_table_explicit_deny_policies.sql).
do $ci_candidate_rls$
declare
  relation text;
begin
  foreach relation in array array[
    'ci_competitors', 'ci_sources', 'ci_competitor_sections', 'ci_flows',
    'ci_competitor_flows', 'ci_pricing_plans', 'ci_opportunities', 'ci_change_events'
  ] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('alter table public.%I force row level security', relation);
    execute format('revoke all on table public.%I from public', relation);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', relation);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', relation);
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using (false) with check (false)',
        relation || '_deny_clients', relation
      );
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant all on table public.%I to service_role', relation);
    end if;
  end loop;
end;
$ci_candidate_rls$;
