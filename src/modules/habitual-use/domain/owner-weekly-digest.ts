import { escapeHtml } from "@/lib/email/escape-html";

/**
 * Resumen semanal de la dirección (docs/producto/uso-habitual.md).
 *
 * Solo lleva lo que se puede accionar. Cada punto trae el botón que abre la
 * pantalla de Zaltyko donde se resuelve, y si ninguno aplica el resumen NO se
 * envía: un correo que dice «todo bien» no da motivo para volver, solo ruido.
 *
 * Archivo puro: recibe las cifras ya calculadas y decide qué se muestra.
 */

export interface AttendanceWeekTotals {
  /** Sesiones de la semana con al menos un registro de asistencia. */
  sessionsWithAttendance: number;
  /** Registros de asistencia de la semana. */
  records: number;
  /** Registros presentes o con retraso. */
  present: number;
}

export interface OwnerDigestMetrics {
  attendance: { current: AttendanceWeekTotals; previous: AttendanceWeekTotals };
  /** Cuotas vencidas. `null` si la persona no ve finanzas. */
  overdueInvoices: number | null;
  /** Solicitudes de prueba sin responder. `null`/ausente si la función no está instalada. */
  newTrialRequests?: number | null;
  /** Gimnastas con inscripción activa que llevan 2 semanas o más sin venir. */
  inactiveAthletes: number;
  /** Sesiones terminadas esta última semana sin lista. */
  unrecordedSessions: number;
}

export type DigestItemKey =
  | "unrecorded_sessions"
  | "overdue_invoices"
  | "trial_requests"
  | "inactive_athletes"
  | "attendance_drop";

export interface DigestItem {
  key: DigestItemKey;
  title: string;
  detail: string;
  href: string;
  action: string;
}

/** La caída de asistencia solo se señala con datos suficientes y un salto claro. */
export const ATTENDANCE_DROP_MIN_POINTS = 5;
export const ATTENDANCE_MIN_RECORDS = 10;

export function attendanceRate(week: AttendanceWeekTotals): number | null {
  if (week.records <= 0) return null;
  return Math.round((week.present / week.records) * 100);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export interface DigestLinks {
  attendance: string;
  invoices: string;
  requests: string;
  athletes: string;
}

/** Enlaces a las pantallas de la academia, con el mismo alcance que Resumen. */
export function buildDigestLinks(
  appUrl: string,
  scope: { organizationId: string; locationId?: string | null }
): DigestLinks {
  const params = new URLSearchParams({ organizationId: scope.organizationId });
  if (scope.locationId) params.set("locationId", scope.locationId);
  const base = appUrl.replace(/\/+$/, "");
  const query = params.toString();
  return {
    attendance: `${base}/owner/attendance?${query}`,
    invoices: `${base}/owner/monthly-invoices?${query}`,
    requests: `${base}/owner/requests?${query}`,
    athletes: `${base}/owner/athletes?${query}`,
  };
}

/** Puntos accionables del resumen, del más urgente al menos. Vacío = no se envía. */
export function buildOwnerDigestItems(metrics: OwnerDigestMetrics, links: DigestLinks): DigestItem[] {
  const items: DigestItem[] = [];

  if (metrics.unrecordedSessions > 0) {
    items.push({
      key: "unrecorded_sessions",
      title: plural(metrics.unrecordedSessions, "sesión sin lista", "sesiones sin lista"),
      detail: "Terminaron esta semana y nadie pasó lista.",
      href: links.attendance,
      action: "Completar listas",
    });
  }

  if (metrics.overdueInvoices !== null && metrics.overdueInvoices > 0) {
    items.push({
      key: "overdue_invoices",
      title: plural(metrics.overdueInvoices, "cuota vencida", "cuotas vencidas"),
      detail: "Emitidas y sin cobrar del todo.",
      href: links.invoices,
      action: "Revisar cuotas",
    });
  }

  const requests = metrics.newTrialRequests ?? 0;
  if (requests > 0) {
    items.push({
      key: "trial_requests",
      title: plural(requests, "solicitud de prueba sin responder", "solicitudes de prueba sin responder"),
      detail: "Cada día sin respuesta es una familia que se enfría.",
      href: links.requests,
      action: "Responder",
    });
  }

  if (metrics.inactiveAthletes > 0) {
    items.push({
      key: "inactive_athletes",
      title: plural(
        metrics.inactiveAthletes,
        "gimnasta lleva 2 semanas o más sin venir",
        "gimnastas llevan 2 semanas o más sin venir"
      ),
      detail: "Con inscripción activa y sin ninguna asistencia en 14 días.",
      href: links.athletes,
      action: "Ver gimnastas",
    });
  }

  const drop = describeAttendanceDrop(metrics.attendance);
  if (drop) {
    items.push({
      key: "attendance_drop",
      title: drop.title,
      detail: drop.detail,
      href: links.attendance,
      action: "Ver asistencia",
    });
  }

  return items;
}

function describeAttendanceDrop(attendance: OwnerDigestMetrics["attendance"]):
  | { title: string; detail: string }
  | null {
  const { current, previous } = attendance;
  // La semana anterior hubo listas y esta no: lo accionable es pasar lista.
  if (previous.sessionsWithAttendance > 0 && current.sessionsWithAttendance === 0) {
    return {
      title: "Esta semana no se pasó lista en ninguna sesión",
      detail: `La semana anterior sí: ${plural(previous.sessionsWithAttendance, "sesión", "sesiones")} con lista.`,
    };
  }
  if (current.records < ATTENDANCE_MIN_RECORDS || previous.records < ATTENDANCE_MIN_RECORDS) return null;
  const currentRate = attendanceRate(current);
  const previousRate = attendanceRate(previous);
  if (currentRate === null || previousRate === null) return null;
  const drop = previousRate - currentRate;
  if (drop < ATTENDANCE_DROP_MIN_POINTS) return null;
  return {
    title: `La asistencia bajó ${drop} puntos`,
    detail: `${currentRate} % esta semana frente a ${previousRate} % la anterior.`,
  };
}

export interface OwnerDigestMessage {
  subject: string;
  text: string;
  html: string;
  itemCount: number;
}

/** `null` cuando no hay nada accionable: en ese caso no se envía correo. */
export function buildOwnerWeeklyDigestMessage(input: {
  organizationName: string;
  items: readonly DigestItem[];
  /** Enlace firmado para desactivar el resumen con un clic. */
  preferencesUrl: string | null;
}): OwnerDigestMessage | null {
  if (input.items.length === 0) return null;
  const count = input.items.length;
  const subject = `${input.organizationName}: ${plural(count, "cosa", "cosas")} por mirar esta semana`;
  const intro = "Esto es lo que merece tu atención hoy. Si no hay nada, no te escribimos.";

  const textItems = input.items
    .map((item) => `• ${item.title}\n  ${item.detail}\n  ${item.action}: ${item.href}`)
    .join("\n\n");
  const footerText = input.preferencesUrl
    ? `\n\nSi prefieres no recibir este resumen semanal: ${input.preferencesUrl}`
    : "";
  const text = `${input.organizationName}\n\n${intro}\n\n${textItems}${footerText}`;

  const htmlItems = input.items
    .map(
      (item) => `<tr><td style="padding:14px 0;border-top:1px solid #e4e0d6;">
<p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#1c2430;">${escapeHtml(item.title)}</p>
<p style="margin:0 0 10px;font-size:14px;color:#4a5260;">${escapeHtml(item.detail)}</p>
<a href="${escapeHtml(item.href)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(item.action)}</a>
</td></tr>`
    )
    .join("\n");
  const footerHtml = input.preferencesUrl
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b665c;">¿Prefieres no recibir este resumen? <a href="${escapeHtml(input.preferencesUrl)}" style="color:#6b665c;">Desactívalo aquí</a>.</p>`
    : "";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c2430;">
<h1 style="margin:0 0 6px;font-size:20px;">${escapeHtml(input.organizationName)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#4a5260;">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${htmlItems}</table>
${footerHtml}
</div>`;

  return { subject, text, html, itemCount: count };
}

export function ownerDigestDedupeKey(organizationId: string, memberId: string, weekKey: string): string {
  return `owner-weekly-digest:${organizationId}:${memberId}:${weekKey}`;
}
