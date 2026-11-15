import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import {
  FAMILY_SCHEDULE_DAYS,
  type FamilyAthleteOverview,
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

/**
 * Cuerpo de la ficha de una gimnasta para la familia: horario, próximas
 * sesiones y asistencia. Lo comparten /familia/gimnastas/[athleteId] (datos
 * reales) y la demo pública.
 */
export function FamilyAthleteView({ schedule }: { schedule: FamilyAthleteOverview }) {
  return (
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
  );
}
