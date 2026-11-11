/**
 * O2 · Avisos de choque de entrenadora y de pista.
 *
 * Dominio puro: cuándo dos sesiones chocan y cómo se cuenta en español. Solo
 * advierte; nunca bloquea ni cambia datos. Ver docs/producto/avisos-de-choque.md.
 */

/**
 * Margen para cambiar de sede entre dos sesiones seguidas de la misma
 * entrenadora. Por debajo, aviso de desplazamiento. Decide Elvis el valor.
 */
export const TRAVEL_BUFFER_MINUTES = 30;

/** Tope de avisos que se calculan y muestran de una vez. */
export const MAX_CONFLICTS = 50;

export type ConflictKind = "coach_overlap" | "coach_travel" | "space_overlap";

export type ConflictSession = {
  sessionId: string;
  classTemplateId: string;
  className: string;
  locationId: string;
  locationName: string;
  timezone: string;
  /** Instantes ISO (UTC). */
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "completed" | "cancelled";
};

export type ScheduleConflict = {
  kind: ConflictKind;
  /** Entrenadora (ficha de equipo) o pista, según el tipo. */
  subjectId: string;
  subjectName: string;
  first: ConflictSession;
  second: ConflictSession;
};

const MINUTE = 60_000;

function ms(value: string): number {
  return new Date(value).getTime();
}

/**
 * Solape estricto: una sesión que acaba a las 19:00 y otra que empieza a las
 * 19:00 no chocan. Instantes absolutos, así que las zonas horarias de cada
 * sede no influyen.
 */
export function intervalsOverlap(
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string }
): boolean {
  return ms(a.startsAt) < ms(b.endsAt) && ms(b.startsAt) < ms(a.endsAt);
}

/** Minutos libres entre dos sesiones que no se solapan (0 si se solapan). */
export function gapMinutes(a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }): number {
  if (intervalsOverlap(a, b)) return 0;
  const [earlier, later] = ms(a.startsAt) <= ms(b.startsAt) ? [a, b] : [b, a];
  return Math.max(0, (ms(later.startsAt) - ms(earlier.endsAt)) / MINUTE);
}

function counts(session: ConflictSession): boolean {
  return session.status !== "cancelled";
}

/** Choque de una misma entrenadora entre dos sesiones, si lo hay. */
export function coachConflictKind(
  a: ConflictSession,
  b: ConflictSession,
  travelBufferMinutes = TRAVEL_BUFFER_MINUTES
): ConflictKind | null {
  if (a.sessionId === b.sessionId || !counts(a) || !counts(b)) return null;
  if (intervalsOverlap(a, b)) return "coach_overlap";
  if (a.locationId !== b.locationId && gapMinutes(a, b) < travelBufferMinutes) return "coach_travel";
  return null;
}

/** Choque de una misma pista: solo en la misma sede y solapándose. */
export function spaceConflictKind(a: ConflictSession, b: ConflictSession): ConflictKind | null {
  if (a.sessionId === b.sessionId || !counts(a) || !counts(b)) return null;
  if (a.locationId !== b.locationId) return null;
  return intervalsOverlap(a, b) ? "space_overlap" : null;
}

/** Orden estable: primero lo más próximo. */
export function sortConflicts(conflicts: readonly ScheduleConflict[]): ScheduleConflict[] {
  return [...conflicts].sort(
    (left, right) =>
      ms(left.first.startsAt) - ms(right.first.startsAt) ||
      left.kind.localeCompare(right.kind) ||
      left.subjectName.localeCompare(right.subjectName, "es") ||
      left.first.sessionId.localeCompare(right.first.sessionId)
  );
}

/** Pone primero la sesión que empieza antes. */
export function orderedPair(a: ConflictSession, b: ConflictSession): [ConflictSession, ConflictSession] {
  return ms(a.startsAt) < ms(b.startsAt) || (ms(a.startsAt) === ms(b.startsAt) && a.sessionId < b.sessionId)
    ? [a, b]
    : [b, a];
}

function day(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).format(
    new Date(value)
  );
}

function time(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

/** ««Base 3» (lun, 17 nov, 17:30–19:00, Sede Norte)», en la hora de su sede. */
export function describeSession(session: ConflictSession): string {
  return `«${session.className}» (${day(session.startsAt, session.timezone)}, ${time(session.startsAt, session.timezone)}–${time(
    session.endsAt,
    session.timezone
  )}, ${session.locationName})`;
}

/** Frase del aviso: quién, qué sesiones y cuándo. */
export function describeConflict(conflict: ScheduleConflict): string {
  const first = describeSession(conflict.first);
  const second = describeSession(conflict.second);
  switch (conflict.kind) {
    case "coach_overlap":
      return `${conflict.subjectName} está en dos sesiones a la vez: ${first} y ${second}.`;
    case "coach_travel":
      return `${conflict.subjectName} no tiene ${TRAVEL_BUFFER_MINUTES} minutos para cambiar de sede entre ${first} y ${second}.`;
    case "space_overlap":
      return `La pista «${conflict.subjectName}» está ocupada a la vez por ${first} y ${second}.`;
  }
}

export const CONFLICT_KIND_LABELS: Record<ConflictKind, string> = {
  coach_overlap: "Doble asignación",
  coach_travel: "Sin tiempo entre sedes",
  space_overlap: "Pista ocupada",
};
