import { Calendar } from "lucide-react";
import type { PublicAcademyDetail } from "@/app/actions/public/get-public-academy";

interface AcademyScheduleProps {
  schedule: PublicAcademyDetail["schedule"];
}

const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function AcademySchedule({ schedule }: AcademyScheduleProps) {
  const scheduleEntries = Object.entries(schedule).filter(([_, classes]) => classes.length > 0);

  if (scheduleEntries.length === 0) {
    return null;
  }

  return (
    <section className="border-b border-border py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Calendar className="h-6 w-6 text-zaltyko-primary" />
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Horarios
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scheduleEntries.map(([weekday, classes]) => (
            <div
              key={weekday}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <h3 className="mb-3 font-semibold text-foreground">
                {WEEKDAY_NAMES[Number(weekday)]}
              </h3>
              <ul className="space-y-2">
                {classes.map((cls, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{cls.name}</span>
                    {cls.startTime && cls.endTime && (
                      <span className="ml-2 text-muted-foreground/70">
                        {cls.startTime} - {cls.endTime}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

