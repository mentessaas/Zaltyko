import { formatCurrency, getCurrencyForCountry } from "@/lib/currency";

export type DashboardAlertType = "capacity" | "payment" | "attendance";
export type DashboardAlertSeverity = "high" | "medium" | "low";

export interface DashboardAlert {
  id: string;
  type: DashboardAlertType;
  title: string;
  message: string;
  severity: DashboardAlertSeverity;
  amount?: number;
  currency?: string | null;
  daysOverdue?: number;
  link?: string;
}

export type DashboardAlertSource = "capacity" | "payments" | "attendance";

export interface DashboardAlertsResult {
  alerts: DashboardAlert[];
  /** Classes at or above the operational capacity threshold. */
  capacityClassIds: string[];
  /** Sources that could not be read; a partial dashboard remains usable. */
  failedSources: DashboardAlertSource[];
}

interface LoadDashboardAlertsOptions {
  academyId: string;
  academyCountry: string | null;
  signal?: AbortSignal;
}

function getItems(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const envelope = payload as { data?: unknown };
  const data = envelope.data && typeof envelope.data === "object" ? envelope.data : payload;
  if (!data || typeof data !== "object") return [];
  const value = data as { items?: unknown; alerts?: unknown };
  if (Array.isArray(value.items)) return value.items;
  return Array.isArray(value.alerts) ? value.alerts : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function daysOverdueFor(value: Record<string, unknown>): number {
  const explicit = asFiniteNumber(value.daysOverdue, Number.NaN);
  if (Number.isFinite(explicit)) return Math.max(0, Math.floor(explicit));
  const dueDate = typeof value.dueDate === "string" ? new Date(value.dueDate).getTime() : Number.NaN;
  if (!Number.isFinite(dueDate)) return 0;
  return Math.max(0, Math.floor((Date.now() - dueDate) / (1000 * 60 * 60 * 24)));
}

async function readSource(
  source: DashboardAlertSource,
  academyId: string,
  signal?: AbortSignal
): Promise<{ source: DashboardAlertSource; items: unknown[] } | { source: DashboardAlertSource; failed: true }> {
  try {
    const response = await fetch(`/api/alerts/${source}?academyId=${encodeURIComponent(academyId)}`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) return { source, failed: true };
    return { source, items: getItems(await response.json()) };
  } catch {
    return { source, failed: true };
  }
}

/**
 * Reads all dashboard alert sources once and returns both the cards and the
 * capacity IDs needed by UpcomingClasses. Keeping this at page level avoids
 * duplicate requests and allows a partial response when one source is down.
 */
export async function loadDashboardAlerts({
  academyId,
  academyCountry,
  signal,
}: LoadDashboardAlertsOptions): Promise<DashboardAlertsResult> {
  const results = await Promise.all(
    (["capacity", "payments", "attendance"] as const).map((source) =>
      readSource(source, academyId, signal)
    )
  );
  const alerts: DashboardAlert[] = [];
  const capacityClassIds: string[] = [];
  const failedSources: DashboardAlertSource[] = [];

  for (const result of results) {
    if ("failed" in result) {
      failedSources.push(result.source);
      continue;
    }
    for (const raw of result.items) {
      const item = asRecord(raw);
      if (!item) continue;

      if (result.source === "capacity") {
        const classId = asString(item.classId);
        const className = asString(item.className) ?? "Clase sin nombre";
        const percentage = asFiniteNumber(item.percentage);
        if (!classId) continue;
        if (percentage >= 95) capacityClassIds.push(classId);
        alerts.push({
          id: `capacity-${classId}`,
          type: "capacity",
          title: `${percentage >= 95 ? "Cupo lleno" : "Cupo casi lleno"}: ${className}`,
          message: `${asFiniteNumber(item.currentCapacity)}/${asFiniteNumber(item.maxCapacity)} atletas (${percentage}%)`,
          severity: percentage >= 95 ? "high" : "medium",
          link: `/app/${academyId}/classes/${classId}`,
        });
        continue;
      }

      if (result.source === "payments") {
        const chargeId = asString(item.chargeId);
        const athleteName = asString(item.athleteName) ?? "Atleta";
        if (!chargeId) continue;
        const amount = asFiniteNumber(item.amount);
        const currency = asString(item.currency);
        const daysOverdue = daysOverdueFor(item);
        alerts.push({
          id: `payment-${chargeId}`,
          type: "payment",
          title: `Pago atrasado: ${athleteName}`,
          amount,
          currency,
          daysOverdue,
          message: `${formatCurrency(amount, currency ?? getCurrencyForCountry(academyCountry))} vencido hace ${daysOverdue} días`,
          severity: "high",
          link: `/app/${academyId}/billing`,
        });
        continue;
      }

      const athleteId = asString(item.athleteId);
      const athleteName = asString(item.athleteName) ?? "Atleta";
      if (!athleteId) continue;
      const attendanceRate = asFiniteNumber(item.attendanceRate);
      const threshold = asFiniteNumber(item.threshold);
      alerts.push({
        id: `attendance-${athleteId}`,
        type: "attendance",
        title: `Baja asistencia: ${athleteName}`,
        message: `${attendanceRate}% (umbral: ${threshold}%)`,
        severity: attendanceRate < 50 ? "high" : "medium",
        link: `/app/${academyId}/athletes/${athleteId}`,
      });
    }
  }

  return { alerts, capacityClassIds, failedSources };
}
