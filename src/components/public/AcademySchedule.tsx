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
    <section className="border-b border-white/10 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Calendar className="h-6 w-6 text-zaltyko-accent" />
          <h2 className="font-display text-2xl font-semibold text-white">
            Horarios
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scheduleEntries.map(([weekday, classes]) => (
            <div
              key={weekday}
              className="rounded-lg border border-white/10 bg-white/5 p-4"
            >
              <h3 className="mb-3 font-semibold text-white">
                {WEEKDAY_NAMES[Number(weekday)]}
              </h3>
              <ul className="space-y-2">
                {classes.map((cls, idx) => (
                  <li key={idx} className="text-sm text-white/70">
                    <span className="font-medium">{cls.name}</span>
                    {cls.startTime && cls.endTime && (
                      <span className="ml-2 text-white/50">
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

