import Link from "next/link";
import { CalendarDays, Check, ClipboardCheck, Repeat2 } from "lucide-react";

import { partitionAssignedFirst } from "@/modules/coach-assignment/domain/coach-assignment";
import type { OwnerTodaySession, OwnerTodaySessions } from "@/modules/owner-dashboard/application/today-sessions";
import { ownerDisciplineOf, ownerDisciplineStyle, ownerUi } from "./owner-ui";

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function attendanceHref(organizationId: string, locationId: string, sessionId: string) {
  const params = new URLSearchParams({ organizationId, locationId, sessionId });
  return `/owner/attendance?${params}`;
}

function coachLine(session: OwnerTodaySession): string | null {
  if (!session.coachNames) return null;
  if (session.coachNames.length === 0) return "Nadie asignado";
  return `Entrena: ${new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(session.coachNames)}`;
}

export function OwnerTodaySessionsPanel({
  organizationId,
  classesHref,
  today,
  now = new Date(),
  prioritizeViewerSessions = false,
}: {
  organizationId: string;
  /** Null hides "Ver clases" (coaches cannot open Clases, P1 #8). */
  classesHref: string | null;
  today: OwnerTodaySessions | null;
  now?: Date;
  /**
   * O1 · Hoy de la entrenadora: primero sus sesiones asignadas y después el
   * resto de la sede. Solo reordena lo que ya ve; no oculta ni añade nada.
   */
  prioritizeViewerSessions?: boolean;
}) {
  const showLocation =
    today !== null && new Set(today.sessions.map((session) => session.locationId)).size > 1;
  const pending = today?.sessions.filter(
    (session) => session.status !== "cancelled" && session.recordedAttendance === 0 && new Date(session.startsAt) <= now
  ).length ?? 0;

  const renderSession = (session: OwnerTodaySession) => {
    const discipline = ownerDisciplineStyle[ownerDisciplineOf(session.programName)];
    const startsAt = new Date(session.startsAt);
    const endsAt = new Date(session.endsAt);
    const cancelled = session.status === "cancelled";
    const recorded = session.recordedAttendance > 0;
    const live = !cancelled && startsAt <= now && now < endsAt;
    const finished = !cancelled && endsAt <= now;
    return (
      <li
        key={session.id}
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${live ? "bg-z-chalk-50/50" : ""}`}
      >
        <div className="w-14 shrink-0 text-right">
          <div className="font-display text-sm font-bold tabular-nums text-z-ink">
            {formatTime(session.startsAt, session.timezone)}
          </div>
          <div className="text-[11px] tabular-nums text-z-soft">
            {formatTime(session.endsAt, session.timezone)}
          </div>
        </div>
        <span aria-hidden="true" className={`h-10 w-1 shrink-0 rounded-full ${discipline.bar}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`break-words font-semibold text-z-ink ${cancelled ? "line-through" : ""}`}>
              {session.className}
            </span>
            {live ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-z-chalk-600 px-2 py-0.5 text-[11px] font-bold uppercase text-white">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />
                Ahora
              </span>
            ) : null}
          </div>
          <div className="break-words text-xs text-z-soft">
            {session.programName ?? "Actividad sin clasificar"}
            {showLocation ? ` · ${session.locationName}` : ""}
            {` · ${session.expectedAthletes} de ${session.capacity} plazas`}
          </div>
          {coachLine(session) ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 break-words text-xs text-z-ink">
              <span>{coachLine(session)}</span>
              {session.substitution ? (
                <span className={`${ownerUi.chipAttention} gap-1`}>
                  <Repeat2 aria-hidden="true" className="h-3 w-3" />
                  Sustitución
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {cancelled ? (
          <span className={ownerUi.chip}>Cancelada</span>
        ) : recorded ? (
          <Link
            href={attendanceHref(organizationId, session.locationId, session.id)}
            className={`${ownerUi.chipSuccess} min-h-12 gap-1 px-3.5`}
            aria-label={`${session.recordedAttendance}/${session.expectedAthletes}, lista pasada en ${session.className}. Revisar`}
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            {session.recordedAttendance}/{session.expectedAthletes}
          </Link>
        ) : (
          <Link
            href={attendanceHref(organizationId, session.locationId, session.id)}
            className={live || finished ? ownerUi.primaryButton : ownerUi.secondaryButton}
            aria-label={`Pasar lista en ${session.className}`}
          >
            <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
            Pasar lista
          </Link>
        )}
      </li>
    );
  };
  const assignedFirst = today ? partitionAssignedFirst(today.sessions) : null;

  return (
    <section aria-labelledby="owner-today-sessions-title" className={`min-w-0 ${ownerUi.cardFlush}`}>
      <div className={ownerUi.cardHeader}>
        <div className="min-w-0">
          <h2 id="owner-today-sessions-title" className={ownerUi.sectionTitle}>
            Hoy en el club
          </h2>
          <p className="text-xs text-z-soft">
            {today && today.sessions.length > 0
              ? `${today.sessions.length} ${today.sessions.length === 1 ? "sesión" : "sesiones"}${pending > 0 ? ` · ${pending} ${pending === 1 ? "lista pendiente" : "listas pendientes"}` : ""}`
              : "Sesiones generadas desde tus clases."}
          </p>
        </div>
        {classesHref ? (
          <Link href={classesHref} className={`${ownerUi.textLink} shrink-0`}>
            Ver clases
          </Link>
        ) : null}
      </div>

      {today === null ? (
        <p role="status" className="px-5 py-6 text-sm text-z-soft">
          No pudimos consultar las sesiones de hoy. No significa que no haya ninguna.
        </p>
      ) : today.sessions.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span aria-hidden="true" className={ownerUi.emptyIcon}>
            <CalendarDays className="h-5 w-5" />
          </span>
          <p className="max-w-sm text-sm leading-6 text-z-soft">
            Hoy no hay sesiones programadas en tus sedes.
          </p>
        </div>
      ) : (
        prioritizeViewerSessions && assignedFirst && assignedFirst.assigned.length > 0 ? (
          <>
            <h3 className="border-b border-z-line bg-z-canvas px-5 py-2 text-xs font-semibold text-z-ink">
              Tus sesiones
            </h3>
            <ul aria-label="Tus sesiones" className="divide-y divide-z-line">
              {assignedFirst.assigned.map(renderSession)}
            </ul>
            {assignedFirst.others.length > 0 ? (
              <>
                <h3 className="border-y border-z-line bg-z-canvas px-5 py-2 text-xs font-semibold text-z-ink">
                  Resto de la sede
                </h3>
                <ul aria-label="Resto de la sede" className="divide-y divide-z-line">
                  {assignedFirst.others.map(renderSession)}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <ul className="divide-y divide-z-line">{today.sessions.map(renderSession)}</ul>
        )
      )}
      {today?.truncated ? (
        <p className="border-t border-z-line px-5 py-3 text-xs text-z-soft">
          Mostramos las primeras sesiones del día. Consulta el resto en Asistencia.
        </p>
      ) : null}
    </section>
  );
}
