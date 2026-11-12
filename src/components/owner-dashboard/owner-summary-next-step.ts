import type { OwnerAttentionItems } from "@/modules/owner-dashboard/application/attention-items";
import type { OwnerSetupChecklist } from "@/modules/owner-dashboard/application/setup-checklist-steps";
import type { OwnerTodaySessions } from "@/modules/owner-dashboard/application/today-sessions";

export type OwnerSummaryNextStep = {
  /** Frase que sigue al saludo del hero. */
  message: string;
  /** Acción del hero; null cuando no hay pantalla que resuelva el paso. */
  cta: { label: string; href: string } | null;
};

function lowerFirst(text: string) {
  return text.charAt(0).toLocaleLowerCase("es") + text.slice(1);
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Siguiente paso del hero del Resumen, derivado solo de datos que la página ya
 * calcula (puesta en marcha, listas sin pasar y sesiones de hoy). Si un dato no
 * llegó (consulta fallida o rol sin acceso), se pasa al siguiente criterio; no
 * se inventan recuentos.
 */
export function ownerSummaryNextStep({
  organizationId,
  scopeQuery,
  setupChecklist,
  todaySessions,
  attentionItems,
}: {
  organizationId: string;
  /** `organizationId` y, si la hay, `locationId` ya autorizados. */
  scopeQuery: string;
  setupChecklist?: OwnerSetupChecklist | null;
  todaySessions?: OwnerTodaySessions | null;
  attentionItems?: OwnerAttentionItems | null;
}): OwnerSummaryNextStep {
  const currentSetupStep =
    setupChecklist && !setupChecklist.complete
      ? setupChecklist.steps.find((step) => step.key === setupChecklist.currentKey) ?? null
      : null;
  if (currentSetupStep) {
    return {
      message: `Tu siguiente paso: ${lowerFirst(currentSetupStep.title)}.`,
      cta:
        currentSetupStep.href && currentSetupStep.action
          ? { label: currentSetupStep.action, href: currentSetupStep.href }
          : null,
    };
  }

  const unrecorded = attentionItems?.unrecordedSessions;
  if (unrecorded && unrecorded.count > 0) {
    const latest = unrecorded.latest;
    return {
      message: `Tienes ${plural(unrecorded.count, "lista sin pasar", "listas sin pasar")} de los últimos 7 días.`,
      // Mismo destino que «Completar» en «Pide atención».
      cta: {
        label: "Pasar lista",
        href: latest
          ? `/owner/attendance?${new URLSearchParams({ organizationId, locationId: latest.locationId, sessionId: latest.id })}`
          : `/owner/attendance?${scopeQuery}`,
      },
    };
  }

  if (todaySessions) {
    const sessions = todaySessions.sessions.filter((session) => session.status !== "cancelled");
    if (sessions.length > 0) {
      const count = todaySessions.truncated ? `${sessions.length} o más` : String(sessions.length);
      return {
        message: `Hoy tienes ${count} ${sessions.length === 1 && !todaySessions.truncated ? "sesión programada" : "sesiones programadas"}.`,
        cta: { label: "Pasar lista", href: `/owner/attendance?${scopeQuery}` },
      };
    }
    return {
      message: "Hoy no hay sesiones programadas.",
      cta: { label: "Ver clases", href: `/owner/classes?${scopeQuery}` },
    };
  }

  return {
    message: "La actividad de tu club, a mano para organizar el día.",
    cta: { label: "Ver clases", href: `/owner/classes?${scopeQuery}` },
  };
}

/** Primer nombre para el saludo; sin nombre, el saludo es al equipo. */
export function ownerGreetingName(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : "equipo";
}
