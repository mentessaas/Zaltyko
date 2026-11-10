import type { DataStatus } from "./domain";

export type ReviewState =
  "al_dia" | "toca_revisar" | "desactualizado" | "pendiente" | "sin_datos";

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  al_dia: "Al día",
  toca_revisar: "Toca volver a comprobar",
  desactualizado: "Desactualizado",
  pendiente: "Pendiente de revisar",
  sin_datos: "Pendiente de investigar",
};

export interface ReviewableDatum {
  content?: string | null;
  dataStatus: DataStatus | string;
  lastVerifiedOn: string | null;
  reviewAfterDays: number;
}

function parseDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatDay(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

/** Fecha (AAAA-MM-DD) en la que conviene volver a comprobar el dato, o null si nunca se verificó. */
export function reviewDueOn(
  datum: Pick<ReviewableDatum, "lastVerifiedOn" | "reviewAfterDays">
): string | null {
  if (!datum.lastVerifiedOn) return null;
  return formatDay(
    parseDay(datum.lastVerifiedOn) + datum.reviewAfterDays * 86_400_000
  );
}

/**
 * Estado de vigencia de un dato. Un dato verificado caduca cuando pasa su
 * plazo; uno sin contenido se considera «pendiente de investigar», nunca al día.
 */
export function reviewState(
  datum: ReviewableDatum,
  today: string = formatDay(Date.now())
): ReviewState {
  if (datum.content !== undefined && !(datum.content ?? "").trim())
    return "sin_datos";
  if (datum.dataStatus === "desactualizado") return "desactualizado";
  if (datum.dataStatus === "pendiente_revision") return "pendiente";
  const due = reviewDueOn(datum);
  if (!due) return "pendiente";
  return due <= today ? "toca_revisar" : "al_dia";
}

export function needsAttention(state: ReviewState): boolean {
  return state !== "al_dia";
}

export function todayIso(): string {
  return formatDay(Date.now());
}
