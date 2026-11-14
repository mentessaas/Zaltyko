import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";

import { isUsageMetricsEnabled } from "../domain/flags";
import {
  selectAtRiskAcademies,
  type AcademyActivitySnapshot,
  type AtRiskAcademy,
} from "../domain/usage";
import { USAGE_TIMEZONE } from "./usage-events";
import { isUsageStorageAvailable } from "./storage";

/** Semanas que muestra la vista de super-admin, la actual incluida. */
export const USAGE_OVERVIEW_WEEKS = 8;
/** Actividad más antigua que esto se trata como «sin actividad registrada». */
export const USAGE_ACTIVITY_LOOKBACK_DAYS = 120;
const MAX_ACADEMIES = 2000;

export interface UsageWeek {
  /** Lunes de la semana (fecha de Madrid), «AAAA-MM-DD». */
  weekStart: string;
  /** Academias en prueba o activas con una lista pasada o una visita del equipo. */
  activeAcademies: number;
  /** Sesiones de la semana ya terminadas con lista pasada (métrica principal). */
  sessionsWithAttendance: number;
  /** Sesiones de la semana ya terminadas y no canceladas. */
  sessionsHeld: number;
  /** Entradas de familias al portal (como mucho una por familia, academia y día). */
  familyPortalVisits: number;
  /** Cuentas de familia distintas que entraron (seudónimo semanal). */
  familyAccounts: number;
  academiesWithFamilyVisits: number;
}

export interface UsageOverview {
  available: true;
  generatedAt: string;
  weeks: UsageWeek[];
  atRisk: AtRiskAcademy[];
  /** Academias en prueba o activas que entran en el cálculo de riesgo. */
  trackedAcademies: number;
}

export type UsageOverviewResult =
  | UsageOverview
  | { available: false; reason: "flag_off" | "storage_missing" };

/** Semanas, de la más reciente a la más antigua. Las tablas ya deben existir. */
export async function loadUsageWeeks(client: DatabaseClient, weekCount: number): Promise<UsageWeek[]> {
  const count = Math.min(Math.max(Math.trunc(weekCount), 1), 26);
  const zone = USAGE_TIMEZONE;
  const result = await client.execute(sql`
    with weeks as (
      select (
        date_trunc('week', (now() at time zone ${zone}::text)::date)
        - (n * interval '7 days')
      )::date as week_start
      from generate_series(0, ${count - 1}::int) as n
    ),
    bounds as (
      select
        week_start,
        (week_start::timestamp at time zone ${zone}::text) as from_at,
        ((week_start + 7)::timestamp at time zone ${zone}::text) as to_at
      from weeks
    )
    select
      to_char(b.week_start, 'YYYY-MM-DD') as week_start,
      (
        select count(distinct x.organization_id)
        from (
          select ue.organization_id
          from public.usage_events ue
          where ue.event_name = 'staff_visit'
            and ue.occurred_on >= b.week_start and ue.occurred_on < b.week_start + 7
          union
          select a.organization_id
          from zaltyko.attendance_records a
          where a.recorded_at >= b.from_at and a.recorded_at < b.to_at
        ) x
        join zaltyko.organizations o
          on o.id = x.organization_id and o.status in ('trial', 'active')
      )::int as active_academies,
      (
        select count(*)
        from zaltyko.sessions s
        join zaltyko.organizations o
          on o.id = s.organization_id and o.status in ('trial', 'active')
        where s.status <> 'cancelled'
          and s.ends_at <= now()
          and s.starts_at >= b.from_at and s.starts_at < b.to_at
          and exists (
            select 1 from zaltyko.attendance_records a
            where a.organization_id = s.organization_id and a.session_id = s.id
          )
      )::int as sessions_with_attendance,
      (
        select count(*)
        from zaltyko.sessions s
        join zaltyko.organizations o
          on o.id = s.organization_id and o.status in ('trial', 'active')
        where s.status <> 'cancelled'
          and s.ends_at <= now()
          and s.starts_at >= b.from_at and s.starts_at < b.to_at
      )::int as sessions_held,
      (
        select coalesce(sum(ue.occurrences), 0)
        from public.usage_events ue
        where ue.event_name = 'family_portal_view'
          and ue.occurred_on >= b.week_start and ue.occurred_on < b.week_start + 7
      )::int as family_portal_visits,
      (
        select count(distinct ue.actor_ref)
        from public.usage_events ue
        where ue.event_name = 'family_portal_view'
          and ue.occurred_on >= b.week_start and ue.occurred_on < b.week_start + 7
      )::int as family_accounts,
      (
        select count(distinct ue.organization_id)
        from public.usage_events ue
        where ue.event_name = 'family_portal_view'
          and ue.occurred_on >= b.week_start and ue.occurred_on < b.week_start + 7
      )::int as academies_with_family_visits
    from bounds b
    order by b.week_start desc
  `);
  return (
    result.rows as unknown as Array<{
      week_start: string;
      active_academies: number;
      sessions_with_attendance: number;
      sessions_held: number;
      family_portal_visits: number;
      family_accounts: number;
      academies_with_family_visits: number;
    }>
  ).map((row) => ({
    weekStart: row.week_start,
    activeAcademies: Number(row.active_academies),
    sessionsWithAttendance: Number(row.sessions_with_attendance),
    sessionsHeld: Number(row.sessions_held),
    familyPortalVisits: Number(row.family_portal_visits),
    familyAccounts: Number(row.family_accounts),
    academiesWithFamilyVisits: Number(row.academies_with_family_visits),
  }));
}

/** Última actividad del equipo por academia (lista pasada o visita), sin nombres de personas. */
export async function loadAcademyActivity(client: DatabaseClient): Promise<AcademyActivitySnapshot[]> {
  const zone = USAGE_TIMEZONE;
  const result = await client.execute(sql`
    select
      o.id as organization_id,
      o.name,
      o.status::text as status,
      o.country_code,
      o.created_at,
      la.last_at
    from zaltyko.organizations o
    left join lateral (
      select max(t.ts) as last_at
      from (
        select max(a.recorded_at) as ts
        from zaltyko.attendance_records a
        where a.organization_id = o.id
          and a.recorded_at > now() - make_interval(days => ${USAGE_ACTIVITY_LOOKBACK_DAYS})
        union all
        select ((max(ue.occurred_on) + 1)::timestamp at time zone ${zone}::text) - interval '1 second' as ts
        from public.usage_events ue
        where ue.organization_id = o.id
          and ue.event_name = 'staff_visit'
          and ue.occurred_on > current_date - ${USAGE_ACTIVITY_LOOKBACK_DAYS}::int
      ) t
    ) la on true
    where o.status in ('trial', 'active')
    order by o.created_at, o.id
    limit ${MAX_ACADEMIES}::int
  `);
  return (
    result.rows as unknown as Array<{
      organization_id: string;
      name: string;
      status: AcademyActivitySnapshot["status"];
      country_code: string;
      created_at: string | Date;
      last_at: string | Date | null;
    }>
  ).map((row) => ({
    organizationId: row.organization_id,
    name: row.name,
    status: row.status,
    countryCode: row.country_code,
    createdAt: new Date(row.created_at),
    lastActivityAt: row.last_at ? new Date(row.last_at) : null,
  }));
}

/** Academias en riesgo ahora mismo (sin actividad del equipo en 7 días o más). */
export async function loadAtRiskAcademies(
  client: DatabaseClient,
  now: Date
): Promise<{ atRisk: AtRiskAcademy[]; tracked: number }> {
  const academies = await loadAcademyActivity(client);
  return { atRisk: selectAtRiskAcademies(academies, now), tracked: academies.length };
}

/**
 * Datos de la vista de super-admin. Quien llama ya autorizó al super-admin; aquí
 * solo se aplican la bandera y la disponibilidad del almacenamiento.
 */
export async function getUsageOverview(
  options: { now?: Date; weeks?: number } = {}
): Promise<UsageOverviewResult> {
  if (!isUsageMetricsEnabled()) return { available: false, reason: "flag_off" };
  if (!(await isUsageStorageAvailable(db))) return { available: false, reason: "storage_missing" };
  const now = options.now ?? new Date();
  const [weeks, risk] = await Promise.all([
    loadUsageWeeks(db, options.weeks ?? USAGE_OVERVIEW_WEEKS),
    loadAtRiskAcademies(db, now),
  ]);
  return {
    available: true,
    generatedAt: now.toISOString(),
    weeks,
    atRisk: risk.atRisk,
    trackedAcademies: risk.tracked,
  };
}
