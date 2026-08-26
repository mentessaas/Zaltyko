/**
 * Lógica pura para derivar la "acción prioritaria" del bundle de atención.
 *
 * No importa DB ni Drizzle. Las funciones reciben el bundle ya agregado y
 * devuelven `PriorityAction | null` siguiendo el orden definido en
 * vault/06-Roadmap-y-Tareas/ZAL-624 ... (work product):
 *
 *   1. Cargos fallidos   -> review_failed_charges
 *   2. Cargos vencidos   -> review_overdue_charges
 *   3. Asistencia hoy    -> take_attendance (sesión en < 2 h sin registro)
 *   4. Mensajes fallidos -> review_failed_messages
 *   5. Progreso drafts   -> publish_drafts
 *   6. Import job failed -> resolve_import
 *   7. Nada             -> null  (UI muestra "Sin acción prioritaria")
 *
 * El coach tiene su propio subset (sin cargos, sin import) — la función
 * ignora las claves ausentes sin inventar contadores en cero.
 *
 * Testeable sin DB: ver attention-priority.test.ts.
 */

import type {
  AttentionBundle,
  ChargesAttention,
  CoachAttentionBundle,
  MessagesAttention,
  OwnerAttentionBundle,
  PriorityAction,
  TodaySessionAttention,
} from "./attention-types";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function hasFailedCharges(charges: ChargesAttention | undefined): boolean {
  return Boolean(charges && charges.sourceAvailable && charges.failed > 0);
}

function hasOverdueCharges(charges: ChargesAttention | undefined): boolean {
  return Boolean(charges && charges.sourceAvailable && charges.overdue > 0);
}

function hasFailedMessages(messages: MessagesAttention | undefined): boolean {
  return Boolean(messages && messages.sourceAvailable && messages.failed > 0);
}

function hasUrgentAttendance(today: TodaySessionAttention[]): TodaySessionAttention | null {
  const now = Date.now();
  for (const session of today) {
    if (session.attendanceRecorded) continue;
    const startsAt = new Date(session.startsAt).getTime();
    if (Number.isNaN(startsAt)) continue;
    const diff = startsAt - now;
    // Sesión que empieza en <= 2h y aún no hemos pasado 1h desde su inicio.
    if (diff <= TWO_HOURS_MS && diff > -TWO_HOURS_MS) {
      return session;
    }
  }
  return null;
}

function pickFailedChargesAction(charges: ChargesAttention, academyId: string): PriorityAction {
  return {
    kind: "review_failed_charges",
    label: `Revisar cargos fallidos (${charges.failed})`,
    href: `/app/${academyId}/billing?status=failed`,
    source: charges.source,
  };
}

function pickOverdueChargesAction(charges: ChargesAttention, academyId: string): PriorityAction {
  return {
    kind: "review_overdue_charges",
    label: `Cobrar cargos vencidos (${charges.overdue})`,
    href: `/app/${academyId}/billing?status=overdue`,
    source: charges.source,
  };
}

function pickAttendanceAction(session: TodaySessionAttention): PriorityAction {
  return {
    kind: "take_attendance",
    label: `Pasar lista de ${session.className ?? "la clase"} a las ${formatHour(session.startsAt)}`,
    href: session.href,
    source: "class_sessions.today",
  };
}

function pickFailedMessagesAction(messages: MessagesAttention, academyId: string): PriorityAction {
  return {
    kind: "review_failed_messages",
    label: `Revisar mensajes fallidos (${messages.failed})`,
    href: messages.href ?? `/app/${academyId}/comms?status=failed`,
    source: messages.source,
  };
}

function pickDraftsAction(bundle: OwnerAttentionBundle): PriorityAction | null {
  if (bundle.progressDrafts.sourceAvailable && bundle.progressDrafts.count > 0) {
    return {
      kind: "publish_drafts",
      label: `Publicar evaluaciones pendientes (${bundle.progressDrafts.count})`,
      href:
        bundle.progressDrafts.href ??
        `/app/${bundle.academyId}/evaluations?status=draft`,
      source: bundle.progressDrafts.source,
    };
  }
  return null;
}

function pickImportAction(bundle: OwnerAttentionBundle): PriorityAction | null {
  if (!bundle.importActive) return null;
  if (bundle.importActive.state === "failed" || bundle.importActive.state === "mapping_required") {
    return {
      kind: "resolve_import",
      label: `Resolver import: ${bundle.importActive.state}`,
      href: bundle.importActive.href,
      source: bundle.importActive.source,
    };
  }
  return null;
}

function formatHour(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Acción prioritaria para el bundle del dueño. */
export function deriveOwnerPriorityAction(bundle: OwnerAttentionBundle): PriorityAction | null {
  if (hasFailedCharges(bundle.chargesOverdue)) {
    return pickFailedChargesAction(bundle.chargesOverdue, bundle.academyId);
  }
  if (hasOverdueCharges(bundle.chargesOverdue)) {
    return pickOverdueChargesAction(bundle.chargesOverdue, bundle.academyId);
  }
  const urgentAttendance = hasUrgentAttendance(bundle.today);
  if (urgentAttendance) {
    return pickAttendanceAction(urgentAttendance);
  }
  if (hasFailedMessages(bundle.messagesPending)) {
    return pickFailedMessagesAction(bundle.messagesPending, bundle.academyId);
  }
  const drafts = pickDraftsAction(bundle);
  if (drafts) return drafts;
  const importAction = pickImportAction(bundle);
  if (importAction) return importAction;
  return null;
}

/**
 * Acción prioritaria para el subset del coach. Reglas:
 * 1. asistencia urgente
 * 2. mensajes fallidos
 * 3. mensajes con "unsent" persistente (plantillas programadas)
 * 4. nada
 */
export function deriveCoachPriorityAction(bundle: CoachAttentionBundle): PriorityAction | null {
  const urgentAttendance = hasUrgentAttendance(bundle.today);
  if (urgentAttendance) {
    return pickAttendanceAction(urgentAttendance);
  }
  if (hasFailedMessages(bundle.messagesPending)) {
    return pickFailedMessagesAction(bundle.messagesPending, bundle.academyId);
  }
  return null;
}

/** Helper de compatibilidad si en el futuro se quiere un dispatcher único. */
export function derivePriorityAction(bundle: AttentionBundle): PriorityAction | null {
  if (isOwnerBundle(bundle)) {
    return deriveOwnerPriorityAction(bundle);
  }
  return deriveCoachPriorityAction(bundle);
}

export function isOwnerBundle(bundle: AttentionBundle): bundle is OwnerAttentionBundle {
  return "chargesOverdue" in bundle;
}
