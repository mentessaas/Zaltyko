import { escapeHtml } from "@/lib/email/escape-html";

import { isQuietHour, localTimeLabel } from "./local-time";

/**
 * Avisos diarios a quien entrena (docs/producto/uso-habitual.md).
 *
 * Dos tipos y nada más:
 *  - `soon`: unos 15 minutos antes de la sesión, con enlace directo a su lista.
 *  - `missing_attendance`: un único recordatorio si la sesión terminó sin lista.
 *
 * Este archivo es puro: decide a quién y cuándo, y redacta el mensaje. Leer la
 * base de datos y enviar viven en application/coach-reminders.ts.
 */

/** Se avisa cuando faltan como mucho este número de minutos (el cron corre cada 5). */
export const COACH_SOON_MAX_MINUTES = 20;
/** Margen tras el final antes de recordar la lista que falta. */
export const COACH_MISSING_MIN_MINUTES_AFTER_END = 10;
/** Pasado este tiempo ya no se recuerda: lo recoge «listas sin pasar» de Resumen. */
export const COACH_MISSING_MAX_HOURS_AFTER_END = 24;

export type CoachReminderKind = "soon" | "missing_attendance";

/** Una sesión con una persona asignada que puede abrir su lista. */
export interface CoachSessionCandidate {
  organizationId: string;
  organizationName: string;
  locationId: string;
  locationName: string;
  /** Zona IANA de la sede. */
  timezone: string;
  sessionId: string;
  className: string;
  status: "scheduled" | "completed" | "cancelled";
  startsAt: Date;
  endsAt: Date;
  /** Personas con inscripción activa o de prueba esperadas en la sesión. */
  expectedAthletes: number;
  hasAttendance: boolean;
  recipientMemberId: string;
  recipientUserId: string;
  recipientEmail: string;
}

export interface PlannedCoachReminder {
  kind: CoachReminderKind;
  dedupeKey: string;
  candidate: CoachSessionCandidate;
}

export function coachReminderDedupeKey(kind: CoachReminderKind, sessionId: string, memberId: string): string {
  return `coach-session-${kind === "soon" ? "soon" : "missing"}:${sessionId}:${memberId}`;
}

const MINUTE = 60_000;

function classify(candidate: CoachSessionCandidate, now: Date): CoachReminderKind | null {
  if (candidate.status === "cancelled") return null;
  const untilStart = (candidate.startsAt.getTime() - now.getTime()) / MINUTE;
  // Sin gimnastas esperadas no hay lista que pasar: tampoco se avisa antes.
  if (
    untilStart > 0 &&
    untilStart <= COACH_SOON_MAX_MINUTES &&
    candidate.status === "scheduled" &&
    candidate.expectedAthletes > 0
  ) {
    return "soon";
  }
  const sinceEnd = (now.getTime() - candidate.endsAt.getTime()) / MINUTE;
  if (
    sinceEnd >= COACH_MISSING_MIN_MINUTES_AFTER_END &&
    sinceEnd <= COACH_MISSING_MAX_HOURS_AFTER_END * 60 &&
    !candidate.hasAttendance &&
    // Sin gimnastas esperadas no hay lista que pasar.
    candidate.expectedAthletes > 0 &&
    // De madrugada no se manda: el siguiente disparo de la mañana lo recoge.
    !isQuietHour(now, candidate.timezone)
  ) {
    return "missing_attendance";
  }
  return null;
}

/**
 * Decide qué avisos tocan ahora. Una sesión y una persona producen como mucho un
 * aviso de cada tipo, aunque la consulta devuelva la fila repetida.
 */
export function planCoachReminders(
  candidates: readonly CoachSessionCandidate[],
  now: Date
): PlannedCoachReminder[] {
  const seen = new Set<string>();
  const planned: PlannedCoachReminder[] = [];
  for (const candidate of candidates) {
    if (!candidate.recipientEmail.trim()) continue;
    const kind = classify(candidate, now);
    if (!kind) continue;
    const dedupeKey = coachReminderDedupeKey(kind, candidate.sessionId, candidate.recipientMemberId);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    planned.push({ kind, dedupeKey, candidate });
  }
  return planned;
}

/** Enlace directo a la lista de esa sesión en Pasar lista. */
export function attendanceLink(
  appUrl: string,
  target: { organizationId: string; locationId: string; sessionId: string }
): string {
  const params = new URLSearchParams({
    organizationId: target.organizationId,
    locationId: target.locationId,
    sessionId: target.sessionId,
  });
  return `${appUrl.replace(/\/+$/, "")}/owner/attendance?${params.toString()}`;
}

export interface CoachReminderMessage {
  kind: CoachReminderKind;
  subject: string;
  /** Título corto para canales que lo muestran aparte (push). */
  title: string;
  text: string;
  html: string;
  /** Destino al pulsar: la lista de la sesión. */
  url: string;
}

export function buildCoachReminderMessage(input: {
  kind: CoachReminderKind;
  candidate: CoachSessionCandidate;
  appUrl: string;
  /** Enlace firmado para desactivar estos avisos con un clic. */
  preferencesUrl: string | null;
}): CoachReminderMessage {
  const { kind, candidate } = input;
  const time = localTimeLabel(candidate.startsAt, candidate.timezone);
  const url = attendanceLink(input.appUrl, candidate);
  const subject =
    kind === "soon"
      ? `Tu clase de las ${time} empieza pronto: pasa lista`
      : `Falta la lista de tu clase de las ${time}`;
  const lead =
    kind === "soon"
      ? `Tu clase de las ${time} empieza pronto. Cuando llegue el grupo, pasa lista desde el móvil.`
      : `Tu clase de las ${time} ya terminó y todavía no tiene lista. Puedes completarla ahora; este es el único recordatorio.`;
  const detail = `${candidate.className} · ${candidate.locationName}`;
  const button = kind === "soon" ? "Pasar lista" : "Completar la lista";
  const footerText = input.preferencesUrl
    ? `\n\nSi no quieres recibir estos avisos de clase: ${input.preferencesUrl}`
    : "";
  const footerHtml = input.preferencesUrl
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b665c;">¿No quieres estos avisos de clase? <a href="${escapeHtml(input.preferencesUrl)}" style="color:#6b665c;">Desactívalos aquí</a>.</p>`
    : "";

  const text = `${lead}\n\n${detail}\n\n${button}: ${url}${footerText}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c2430;">
<p style="margin:0 0 12px;font-size:16px;line-height:1.5;">${escapeHtml(lead)}</p>
<p style="margin:0 0 20px;font-size:14px;color:#4a5260;">${escapeHtml(detail)}</p>
<p style="margin:0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${escapeHtml(button)}</a></p>
${footerHtml}
</div>`;

  return { kind, subject, title: subject, text, html, url };
}

/* ------------------------------------------------------------------------ */
/* Canales. El correo es el único activo; push de la PWA queda preparado.     */
/* ------------------------------------------------------------------------ */

export type CoachReminderDeliveryResult = "sent" | "skipped" | "failed";

export interface CoachReminderDelivery {
  message: CoachReminderMessage;
  dedupeKey: string;
  organizationId: string;
  sessionId: string;
  recipient: { memberId: string; userId: string; email: string };
}

/**
 * Punto de extensión: cada canal entrega el mismo mensaje por su vía. Para
 * añadir push de la PWA basta con otra implementación (usa `message.title`,
 * `message.text` y `message.url`) en la lista de canales del despachador; el
 * plan, las preferencias y la deduplicación no cambian.
 */
export interface CoachReminderChannel {
  readonly name: "email" | "push";
  deliver(delivery: CoachReminderDelivery): Promise<CoachReminderDeliveryResult>;
}
