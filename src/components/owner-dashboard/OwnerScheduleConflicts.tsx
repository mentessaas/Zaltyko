import { AlertTriangle } from "lucide-react";

import {
  CONFLICT_KIND_LABELS,
  describeConflict,
  type ScheduleConflict,
} from "@/modules/schedule-conflicts/domain/schedule-conflicts";
import { ownerTone } from "./owner-tone-ui";

/**
 * Avisos de choque (O2). Solo informan: nada aquí bloquea ni cambia datos.
 * - `variant="saved"`: tras guardar titulares o una sustitución.
 * - `variant="upcoming"`: lista «Choques próximos» de una página.
 */
export function OwnerScheduleConflictList({
  conflicts,
  truncated = false,
  variant,
  title,
}: {
  conflicts: readonly ScheduleConflict[];
  truncated?: boolean;
  variant: "saved" | "upcoming";
  title?: string;
}) {
  if (conflicts.length === 0) return null;
  const heading =
    title ?? (variant === "saved" ? "Guardado con aviso de choque" : "Choques próximos");
  return (
    <section
      aria-label={heading}
      className={`grid gap-2 ${ownerTone.noticeWarning}`}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
        {heading}
      </h3>
      {variant === "saved" ? (
        <p className="text-xs leading-5">
          El cambio se ha guardado. Revisa estos choques si no son intencionados.
        </p>
      ) : null}
      <ul className="grid gap-2">
        {conflicts.map((conflict) => (
          <li
            key={`${conflict.kind}:${conflict.subjectId}:${conflict.first.sessionId}:${conflict.second.sessionId}`}
            className="min-w-0 break-words text-sm leading-6"
          >
            <span className={`${ownerTone.chipOutline} mr-2`}>{CONFLICT_KIND_LABELS[conflict.kind]}</span>
            {describeConflict(conflict)}
          </li>
        ))}
      </ul>
      {truncated ? (
        <p className="text-xs leading-5">Hay más choques; mostramos los primeros.</p>
      ) : null}
    </section>
  );
}

/** Bloque de página: «Choques próximos» o, para la entrenadora, los suyos. */
export function OwnerUpcomingConflicts({
  upcoming,
  coachMode,
}: {
  upcoming: { conflicts: ScheduleConflict[]; truncated: boolean } | null;
  coachMode: boolean;
}) {
  if (!upcoming || upcoming.conflicts.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-5 lg:px-10">
      <OwnerScheduleConflictList
        conflicts={upcoming.conflicts}
        truncated={upcoming.truncated}
        variant="upcoming"
        title={coachMode ? "Tus choques próximos" : "Choques próximos"}
      />
    </div>
  );
}
