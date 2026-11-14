import { sql } from "drizzle-orm";

import { db } from "@/db";
import { ownerWorkspaceCapabilitiesFor } from "@/components/owner-dashboard/owner-workspace-capabilities";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  getOwnerAttentionItems,
  type OwnerAttentionItems,
} from "@/modules/owner-dashboard/application/attention-items";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { isOwnerWeeklyDigestEnabled } from "../domain/flags";
import {
  digestWeeks,
  isoWeekKey,
  isOwnerDigestWindow,
  localDate,
  safeTimezone,
} from "../domain/local-time";
import {
  buildDigestLinks,
  buildOwnerDigestItems,
  buildOwnerWeeklyDigestMessage,
  ownerDigestDedupeKey,
  type AttendanceWeekTotals,
  type OwnerDigestMetrics,
} from "../domain/owner-weekly-digest";
import { countInactiveAthletes } from "./inactive-athletes";
import { buildHabitualUsePreferencesUrl, isHabitualUseEnabledFor } from "./preferences";

export const OWNER_DIGEST_TEMPLATE = "owner-weekly-digest";
/** Personas por consulta. Se recorre por páginas hasta agotar quien toca: no hay tope total. */
export const OWNER_DIGEST_PAGE_SIZE = 200;
/** Cinturón de seguridad contra un bucle: 200 × 100 = 20.000 personas por disparo. */
export const OWNER_DIGEST_MAX_PAGES = 100;

export interface DigestRecipient {
  memberId: string;
  userId: string;
  role: string;
  email: string;
  organizationId: string;
  organizationName: string;
  /** Zona de la persona: la de sus sedes si coinciden, o la de la academia. */
  timezone: string;
}

interface RecipientRow {
  member_id: string;
  user_id: string;
  role: string;
  email: string;
  organization_id: string;
  organization_name: string;
  timezone: string | null;
}

export interface DigestRecipientCursor {
  organizationId: string;
  memberId: string;
}

const START_OF_RECIPIENTS: DigestRecipientCursor = {
  organizationId: "00000000-0000-0000-0000-000000000000",
  memberId: "00000000-0000-0000-0000-000000000000",
};

/**
 * Una página de la dirección a la que le toca el resumen AHORA: membresía activa
 * en una academia activa o en prueba, es lunes entre las 08:00 y las 11:59 en su
 * zona (la de sus sedes si coinciden, y si no la de la academia) y todavía no tiene
 * enviado ni en curso el de esta semana. Todo se filtra en SQL, así que el resto
 * de la semana no se lee a nadie. La autorización definitiva (alcance de sedes y
 * rol) la repite `resolveOwnerScope` antes de calcular nada. Se pagina por
 * (academia, persona).
 */
export async function loadDigestRecipientPage(input: {
  now: Date;
  after?: DigestRecipientCursor;
  pageSize?: number;
}): Promise<{ recipients: DigestRecipient[]; next: DigestRecipientCursor | null }> {
  const at = input.now.toISOString();
  const after = input.after ?? START_OF_RECIPIENTS;
  const pageSize = input.pageSize ?? OWNER_DIGEST_PAGE_SIZE;
  const result = await db.execute(sql`
    with members as (
      select
        m.id as member_id,
        m.user_id,
        m.role::text as role,
        u.email,
        o.id as organization_id,
        o.name as organization_name,
        coalesce((
          select case when count(distinct l.timezone) = 1 then min(l.timezone) end
          from zaltyko.locations l
          where l.organization_id = m.organization_id
            and l.is_active
            and (
              m.location_scope_mode = 'all'
              or exists (
                select 1 from zaltyko.member_location_scopes mls
                where mls.organization_id = m.organization_id
                  and mls.member_id = m.id
                  and mls.location_id = l.id
              )
            )
        ), o.default_timezone, 'Europe/Madrid') as timezone
      from zaltyko.organization_members m
      join zaltyko.organizations o
        on o.id = m.organization_id and o.status in ('trial', 'active')
      join auth.users u on u.id = m.user_id
      where m.status = 'active'
        and m.role in ('owner', 'admin', 'manager')
        and u.email is not null
        and (m.organization_id, m.id) > (${after.organizationId}::uuid, ${after.memberId}::uuid)
    )
    select *
    from members c
    where extract(isodow from (${at}::timestamptz at time zone c.timezone)) = 1
      and extract(hour from (${at}::timestamptz at time zone c.timezone)) between 8 and 11
      and not exists (
        select 1 from public.email_logs el
        where el.idempotency_key =
              'email:owner-weekly-digest:' || c.organization_id::text || ':' || c.member_id::text || ':'
              || to_char(${at}::timestamptz at time zone c.timezone, 'IYYY-"W"IW')
          and (el.status = 'sent' or el.created_at > now() - interval '1 hour')
      )
    order by c.organization_id, c.member_id
    limit ${pageSize}::int
  `);
  const rows = result.rows as unknown as RecipientRow[];
  const recipients = rows.map((row) => ({
    memberId: row.member_id,
    userId: row.user_id,
    role: row.role,
    email: row.email,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    timezone: safeTimezone(row.timezone),
  }));
  const last = rows[rows.length - 1];
  return {
    recipients,
    next: last && rows.length >= pageSize ? { organizationId: last.organization_id, memberId: last.member_id } : null,
  };
}

/** Todas las páginas de quien toca ahora (pruebas y diagnóstico). */
export async function loadDigestRecipients(now: Date): Promise<DigestRecipient[]> {
  const all: DigestRecipient[] = [];
  for await (const page of digestRecipientPages(now)) all.push(...page);
  return all;
}

export async function* digestRecipientPages(now: Date): AsyncGenerator<DigestRecipient[]> {
  let after: DigestRecipientCursor | undefined;
  for (let page = 0; page < OWNER_DIGEST_MAX_PAGES; page += 1) {
    const { recipients, next } = await loadDigestRecipientPage({ now, after });
    if (recipients.length > 0) yield recipients;
    if (!next) return;
    after = next;
  }
  logger.warn("habitual_use.owner_digest_page_limit", { pages: OWNER_DIGEST_MAX_PAGES });
}

async function wasAlreadySent(dedupeKey: string): Promise<boolean> {
  const result = await db.execute(sql`
    select 1 as found
    from public.email_logs
    where idempotency_key = ${`email:${dedupeKey}`}
      and status in ('pending', 'sent')
    limit 1
  `);
  return result.rows.length > 0;
}

async function loadAttendanceWeeks(input: {
  organizationId: string;
  locationIds: string[];
  weeks: ReturnType<typeof digestWeeks>;
}): Promise<{ current: AttendanceWeekTotals; previous: AttendanceWeekTotals }> {
  const { weeks } = input;
  const result = await db.execute(sql`
    with scoped_locations as (
      select l.id, l.timezone
      from zaltyko.locations l
      where l.organization_id = ${input.organizationId}::uuid
        and l.id = any(${sqlUuidArray(input.locationIds)})
    ),
    recorded as (
      select
        s.id as session_id,
        a.status::text as status,
        (s.starts_at at time zone l.timezone)::date as local_day
      from zaltyko.attendance_records a
      join zaltyko.sessions s
        on s.organization_id = a.organization_id and s.id = a.session_id
      join scoped_locations l on l.id = s.location_id
      where a.organization_id = ${input.organizationId}::uuid
        and s.starts_at >= ${weeks.previous.from}::date - interval '2 days'
        and s.starts_at < ${weeks.current.to}::date + interval '2 days'
    )
    select
      period,
      count(distinct session_id)::int as sessions,
      count(*)::int as records,
      (count(*) filter (where status in ('present', 'late')))::int as present
    from (
      select
        session_id,
        status,
        case
          when local_day >= ${weeks.current.from}::date and local_day < ${weeks.current.to}::date then 'current'
          when local_day >= ${weeks.previous.from}::date and local_day < ${weeks.previous.to}::date then 'previous'
        end as period
      from recorded
    ) classified
    where period is not null
    group by period
  `);
  const empty = (): AttendanceWeekTotals => ({ sessionsWithAttendance: 0, records: 0, present: 0 });
  const totals = { current: empty(), previous: empty() };
  for (const row of result.rows as unknown as Array<{
    period: "current" | "previous";
    sessions: number;
    records: number;
    present: number;
  }>) {
    totals[row.period] = {
      sessionsWithAttendance: Number(row.sessions),
      records: Number(row.records),
      present: Number(row.present),
    };
  }
  return totals;
}

/**
 * Cuentas de «atención» con el mismo criterio que Resumen, sumadas sobre todas las
 * sedes de la persona (Resumen muestra una sede cada vez para quien no ve el
 * conjunto de la academia).
 */
async function loadAttentionTotals(scope: OwnerScope, includeFinancials: boolean): Promise<OwnerAttentionItems> {
  if (scope.canViewOrganizationAggregate) {
    return getOwnerAttentionItems({ scope, includeFinancials });
  }
  const total: OwnerAttentionItems = {
    unrecordedSessions: { count: 0, latest: null },
    fullClasses: 0,
    overdueInvoices: includeFinancials ? 0 : null,
  };
  for (const location of scope.locations) {
    const items = await getOwnerAttentionItems({
      scope: { ...scope, selectedLocationId: location.id, canViewOrganizationAggregate: false },
      locationId: location.id,
      includeFinancials,
    });
    total.unrecordedSessions.count += items.unrecordedSessions.count;
    if (total.overdueInvoices !== null && items.overdueInvoices !== null) {
      total.overdueInvoices += items.overdueInvoices;
    }
    if (items.newTrialRequests !== undefined) {
      total.newTrialRequests = (total.newTrialRequests ?? 0) + items.newTrialRequests;
    }
  }
  return total;
}

/** Cifras del resumen de una persona, con su alcance real de sedes. */
export async function loadOwnerDigestMetrics(input: {
  scope: OwnerScope;
  now: Date;
  timezone: string;
}): Promise<OwnerDigestMetrics> {
  const { scope } = input;
  const organizationId = scope.organization.id;
  const locationIds = scope.locations.map((location) => location.id);
  const includeFinancials = ownerWorkspaceCapabilitiesFor(scope.member).canManageFinancials;
  const weeks = digestWeeks(input.now, input.timezone);
  const [attention, attendance, inactiveAthletes] = await Promise.all([
    loadAttentionTotals(scope, includeFinancials),
    loadAttendanceWeeks({ organizationId, locationIds, weeks }),
    countInactiveAthletes({
      organizationId,
      locationIds,
      now: input.now,
      today: localDate(input.now, input.timezone),
    }),
  ]);
  return {
    attendance,
    overdueInvoices: attention.overdueInvoices,
    newTrialRequests: attention.newTrialRequests ?? null,
    inactiveAthletes,
    unrecordedSessions: attention.unrecordedSessions.count,
  };
}

export interface OwnerDigestSummary {
  enabled: boolean;
  recipients: number;
  inWindow: number;
  alreadySent: number;
  optedOut: number;
  /** Nada accionable: no se envía. */
  empty: number;
  withoutPreferencesLink: number;
  noAccess: number;
  sent: number;
  notSent: number;
  failed: number;
}

const EMPTY: OwnerDigestSummary = {
  enabled: false,
  recipients: 0,
  inWindow: 0,
  alreadySent: 0,
  optedOut: 0,
  empty: 0,
  withoutPreferencesLink: 0,
  noAccess: 0,
  sent: 0,
  notSent: 0,
  failed: 0,
};

/**
 * Un disparo del cron (cada hora). Solo actúa sobre quien está en la mañana del
 * lunes de su sede y no ha recibido ya el resumen de esa semana. Con la bandera
 * apagada no toca la base de datos.
 */
export async function runOwnerWeeklyDigest(
  options: {
    now?: Date;
    appUrl?: string;
    /** Sustituye la carga paginada por un único lote (pruebas). */
    loadRecipients?: (now: Date) => Promise<DigestRecipient[]>;
    resolveScope?: (recipient: DigestRecipient) => Promise<OwnerScope>;
    loadMetrics?: (input: { scope: OwnerScope; now: Date; timezone: string }) => Promise<OwnerDigestMetrics>;
  } = {}
): Promise<OwnerDigestSummary> {
  if (!isOwnerWeeklyDigestEnabled()) return { ...EMPTY };
  const now = options.now ?? new Date();
  const appUrl = options.appUrl ?? getAppUrl();
  const pages: AsyncIterable<DigestRecipient[]> = options.loadRecipients
    ? (async function* () {
        yield await options.loadRecipients!(now);
      })()
    : digestRecipientPages(now);
  const summary: OwnerDigestSummary = { ...EMPTY, enabled: true };

  for await (const recipients of pages) {
    summary.recipients += recipients.length;
    for (const recipient of recipients) {
    try {
      if (!isOwnerDigestWindow(now, recipient.timezone)) continue;
      summary.inWindow += 1;
      const dedupeKey = ownerDigestDedupeKey(
        recipient.organizationId,
        recipient.memberId,
        isoWeekKey(now, recipient.timezone)
      );
      if (await wasAlreadySent(dedupeKey)) {
        summary.alreadySent += 1;
        continue;
      }
      if (!(await isHabitualUseEnabledFor(recipient.email, "owner_weekly_digest"))) {
        summary.optedOut += 1;
        continue;
      }
      const preferencesUrl = buildHabitualUsePreferencesUrl(appUrl, recipient.email, "owner_weekly_digest");
      // Sin forma de desactivarlo no se envía.
      if (!preferencesUrl) {
        summary.withoutPreferencesLink += 1;
        continue;
      }

      let scope: OwnerScope;
      try {
        scope = await (options.resolveScope
          ? options.resolveScope(recipient)
          : resolveOwnerScope({ userId: recipient.userId, organizationId: recipient.organizationId }));
      } catch (error) {
        if (error instanceof OperationalError) {
          summary.noAccess += 1;
          continue;
        }
        throw error;
      }

      const metrics = await (options.loadMetrics ?? loadOwnerDigestMetrics)({
        scope,
        now,
        timezone: recipient.timezone,
      });
      const links = buildDigestLinks(appUrl, {
        organizationId: scope.organization.id,
        // Con una sola sede el botón abre esa sede; con varias, la vista general.
        locationId: scope.locations.length === 1 ? scope.locations[0]?.id : null,
      });
      const items = buildOwnerDigestItems(metrics, links);
      const message = buildOwnerWeeklyDigestMessage({
        organizationName: scope.organization.name,
        items,
        preferencesUrl,
      });
      // «No enviar si vacío»: sin nada accionable no hay correo ni registro.
      if (!message) {
        summary.empty += 1;
        continue;
      }

      const accepted = await sendEmailWithLogging({
        purpose: "transactional",
        to: recipient.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        template: OWNER_DIGEST_TEMPLATE,
        // El emisor común enlaza academyId con la tabla antigua `academies`; la
        // organización canónica va como tenant, que no tiene clave foránea.
        tenantId: recipient.organizationId,
        metadata: { kind: "owner_weekly_digest", itemCount: message.itemCount },
        dedupeKey,
      });
      if (accepted) summary.sent += 1;
      else summary.notSent += 1;
    } catch (error) {
      summary.failed += 1;
      logger.error("habitual_use.owner_digest_failed", error, {
        organizationId: recipient.organizationId,
        memberId: recipient.memberId,
      });
    }
  }
  }
  return summary;
}
