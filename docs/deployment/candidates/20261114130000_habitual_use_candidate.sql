-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging o producción). No aplicado en ningún entorno.
-- Medición del uso habitual (docs/producto/uso-habitual.md).
-- Una relación nueva, `public.usage_events`; no cambia filas ni tablas existentes.
--
-- Qué guarda: contadores de uso por academia, tipo de evento, rol y día
-- (p. ej. «el equipo de la academia X abrió Zaltyko 4 veces el 14-11»). Sirve
-- para dos cosas: contar academias activas y familias que entran al portal
-- por semana, y detectar academias sin actividad.
--
-- Qué NO guarda: ningún identificador de persona, de cuenta, de gimnasta ni de
-- menor, ninguna IP, ningún texto libre. La única referencia es `actor_ref`,
-- solo en los eventos de familia: 16 caracteres hexadecimales de un HMAC que
-- rota cada semana, para contar familias distintas sin poder reconocer a
-- ninguna ni seguirla de una semana a otra. Para el equipo `actor_ref` queda vacío.
--
-- Esquema `public` (igual que growth_events): es telemetría interna del
-- producto, no un dato operativo de la academia. Aun así enlaza con la
-- academia con ON DELETE CASCADE, de modo que borrar la academia borra su uso.
-- RLS activada y forzada, sin políticas ni grants para clientes directos: solo
-- el servidor escribe y lee.
--
-- La función va detrás de ZALTYKO_HABITUAL_USE_ENABLED y
-- ZALTYKO_USAGE_METRICS_ENABLED (apagadas por defecto); mientras esta tabla no
-- exista tal como la define este archivo, no se registra nada y la vista de
-- super-admin responde «no disponible».
-- Reinstalar aborta antes de tocar nada: una instalación parcial o divergente
-- exige reconciliación humana, nunca reparación.
do $habitual_use_candidate_preflight$
begin
  if to_regclass('public.usage_events') is not null then
    raise exception 'Habitual use candidate requires public.usage_events absent; inspect existing schema before promotion';
  end if;
  if to_regclass('zaltyko.organizations') is null then
    raise exception 'Habitual use candidate requires the canonical zaltyko.organizations table';
  end if;
end;
$habitual_use_candidate_preflight$;

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  event_name text not null,
  actor_role text not null,
  occurred_on date not null,
  actor_ref text not null default '',
  occurrences integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_events_event_name_check
    check (event_name in ('staff_visit', 'family_portal_view')),
  constraint usage_events_actor_role_check
    check (actor_role in ('owner', 'manager', 'admin', 'coach', 'family')),
  constraint usage_events_role_event_check
    check ((event_name = 'family_portal_view') = (actor_role = 'family')),
  constraint usage_events_actor_ref_check
    check (actor_ref = '' or actor_ref ~ '^[0-9a-f]{16}$'),
  constraint usage_events_occurrences_check
    check (occurrences > 0),
  constraint usage_events_bucket_uq
    unique (organization_id, event_name, actor_role, occurred_on, actor_ref)
);

create index usage_events_event_day_idx
  on public.usage_events(event_name, occurred_on);
create index usage_events_org_day_idx
  on public.usage_events(organization_id, occurred_on);

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;
revoke all on table public.usage_events from public, anon, authenticated;
-- Sin políticas ni grants para clientes directos: el único escritor y lector es
-- el servidor (registro con recordUsageEvent y vista de super-admin).
