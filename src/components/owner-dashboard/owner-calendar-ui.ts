import {
  isCalendarView,
  isIsoDate,
  type CalendarView,
} from "@/modules/scheduling/domain/calendar";
import type { OwnerCalendarSession } from "@/modules/scheduling/application/calendar-sessions";

/** Estado del calendario que viaja en la URL, para poder compartir o recargar la vista. */
export interface OwnerCalendarState {
  view: CalendarView;
  date: string;
  locationId: string;
  groupId: string;
}

const defaultView: CalendarView = "week";

/** Lee `vista`, `fecha` y `grupo`; lo inválido cae al valor por defecto, nunca falla. */
export function parseCalendarSearch(
  raw: Record<string, string | string[] | undefined>,
  today: string
): OwnerCalendarState {
  const first = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : "";
  const view = first(raw.vista);
  const date = first(raw.fecha);
  return {
    view: isCalendarView(view) ? view : defaultView,
    date: isIsoDate(date) ? date : today,
    locationId: first(raw.locationId),
    groupId: first(raw.grupo),
  };
}

/** Parámetros de URL de la pantalla (sin el prefijo `?`). La academia va siempre. */
export function calendarSearchParams(
  organizationId: string,
  state: OwnerCalendarState,
  today: string
): string {
  const params = new URLSearchParams({ organizationId });
  if (state.locationId) params.set("locationId", state.locationId);
  if (state.view !== defaultView) params.set("vista", state.view);
  if (state.date !== today) params.set("fecha", state.date);
  if (state.groupId) params.set("grupo", state.groupId);
  return params.toString();
}

/** Parámetros de la API de lectura por rango. */
export function calendarApiParams(input: {
  organizationId: string;
  from: string;
  to: string;
  locationId: string;
  groupId: string;
}): string {
  const params = new URLSearchParams({
    organizationId: input.organizationId,
    from: input.from,
    to: input.to,
  });
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.groupId) params.set("groupId", input.groupId);
  return params.toString();
}

/** Destino de una sesión: su asistencia, en su sede. */
export function sessionAttendanceHref(
  organizationId: string,
  session: Pick<OwnerCalendarSession, "id" | "locationId">
): string {
  return `/owner/attendance?${new URLSearchParams({
    organizationId,
    locationId: session.locationId,
    sessionId: session.id,
  })}`;
}

/** «12/15»: inscritas sobre capacidad. */
export function occupancyLabel(session: Pick<OwnerCalendarSession, "expectedAthletes" | "capacity">): string {
  return `${session.expectedAthletes}/${session.capacity}`;
}

/** Porcentaje de ocupación acotado a 0–100 para la barra. */
export function occupancyPercent(session: Pick<OwnerCalendarSession, "expectedAthletes" | "capacity">): number {
  if (session.capacity <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((session.expectedAthletes / session.capacity) * 100)));
}

export function isOverCapacity(session: Pick<OwnerCalendarSession, "expectedAthletes" | "capacity">): boolean {
  return session.expectedAthletes > session.capacity;
}

/** Línea de entrenadoras: undefined si no se pudieron leer, para no afirmar que no hay nadie. */
export function coachLine(session: Pick<OwnerCalendarSession, "coachNames">): string | null {
  if (!session.coachNames) return null;
  if (session.coachNames.length === 0) return "Sin entrenadora asignada";
  return new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(session.coachNames);
}

/** Grupos de la clase en una línea. */
export function groupsLine(session: Pick<OwnerCalendarSession, "groups">): string | null {
  if (session.groups.length === 0) return null;
  return session.groups.map((group) => group.name).join(", ");
}
