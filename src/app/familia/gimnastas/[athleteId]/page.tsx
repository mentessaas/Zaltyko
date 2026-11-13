import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerTone } from "@/components/owner-dashboard/owner-tone-ui";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import {
  FAMILY_SCHEDULE_DAYS,
  getFamilyAthleteOverview,
} from "@/modules/family-portal/application/family-portal-reads";
import {
  attendanceStatusLabel,
  enrollmentStatusLabel,
  formatCalendarDate,
  formatLocalTime,
  formatSessionStart,
  sessionStatusLabel,
  weekdayLabel,
} from "@/modules/family-portal/domain/family-portal-presentation";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { requireFamilyUser } from "../../_lib/family-user";

export const dynamic = "force-dynamic";

const athleteIdSchema = z.guid();

export default async function FamilyAthletePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId: rawAthleteId } = await params;
  const parsed = athleteIdSchema.safeParse(rawAthleteId);
  if (!parsed.success) notFound();
  const athleteId = parsed.data;

  const user = await requireFamilyUser(`/familia/gimnastas/${athleteId}`);

  let schedule: Awaited<ReturnType<typeof getFamilyAthleteOverview>>;
  try {
    schedule = await getFamilyAthleteOverview({ userId: user.id, athleteId });
  } catch (error) {
    // Foreign, unknown and unlinked athletes all get the same 404.
    if (error instanceof OperationalError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <FamilyPortalShell active={null}>
      <Link href="/familia" className={ownerUi.backLink}>
        ← Volver a tu familia
      </Link>
      <header className={`${ownerUi.pageHeader} mt-3`}>
        <p className={ownerUi.eyebrow}>{schedule.organizationName}</p>
        <h1 className={ownerUi.pageTitle}>{schedule.athlete.displayName}</h1>
        <p className={ownerUi.pageLead}>
          Datos desde el {formatCalendarDate(schedule.athlete.visibleSince)}, fecha en
          que la gimnasta se vinculó a tu familia.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={ownerUi.card} aria-labelledby="family-schedule-title">
          <h2 id="family-schedule-title" className={ownerUi.sectionTitle}>
            Horario
          </h2>
          {schedule.classes.length === 0 ? (
            <p className={`${ownerUi.muted} mt-3`}>
              No tiene clases con inscripción vigente.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {schedule.classes.map((item) => (
                <li key={item.enrollmentId} className={ownerUi.listItem}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-z-ink">{item.className}</p>
                    <span
                      className={
                        item.status === "paused" ? ownerTone.chipRest : ownerTone.chipActive
                      }
                    >
                      {enrollmentStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className={ownerUi.help}>Sede: {item.locationName}</p>
                  {item.weekdays.length > 0 ? (
                    <ul className="mt-2 space-y-0.5 text-sm text-z-ink">
                      {item.weekdays.map((day) => (
                        <li key={`${day.isoWeekday}-${day.startsAtLocal}`}>
                          {weekdayLabel(day.isoWeekday)},{" "}
                          {formatLocalTime(day.startsAtLocal)} –{" "}
                          {formatLocalTime(day.endsAtLocal)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.endsOn ? (
                    <p className={`${ownerUi.help} mt-1`}>
                      Hasta el {formatCalendarDate(item.endsOn)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <h3 className="floor-label mt-6 text-ramp-600">
            Próximas sesiones ({FAMILY_SCHEDULE_DAYS} días)
          </h3>
          {schedule.upcomingSessions.length === 0 ? (
            <p className={`${ownerUi.muted} mt-2`}>No hay sesiones programadas.</p>
          ) : (
            <ul className="mt-2 divide-y divide-z-line">
              {schedule.upcomingSessions.map((session) => (
                <li
                  key={session.sessionId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    <span className="font-semibold">
                      {formatSessionStart(session.startsAt, session.timezone)}
                    </span>{" "}
                    · {session.className} · {session.locationName}
                  </span>
                  {session.status === "cancelled" ? (
                    <span className={ownerTone.chipWarning}>
                      {sessionStatusLabel(session.status)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={ownerUi.card} aria-labelledby="family-attendance-title">
          <h2 id="family-attendance-title" className={ownerUi.sectionTitle}>
            Asistencia
          </h2>
          {schedule.attendance.length === 0 ? (
            <p className={`${ownerUi.muted} mt-3`}>
              Todavía no hay pases de lista registrados.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-z-line">
              {schedule.attendance.map((entry) => (
                <li
                  key={entry.recordId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    <span className="font-semibold">
                      {formatSessionStart(entry.sessionStartsAt, entry.timezone)}
                    </span>{" "}
                    · {entry.className}
                  </span>
                  <span
                    className={
                      entry.status === "absent" ? ownerTone.chipWarning : ownerTone.chipRest
                    }
                  >
                    {attendanceStatusLabel(entry.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </FamilyPortalShell>
  );
}
