"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAthleteSchedule } from "@/app/actions/classes/get-athlete-schedule";

interface AthleteBaseClassesSectionProps {
  academyId: string;
  athleteId: string;
  groupId: string | null;
  groupName: string | null;
}

export function AthleteBaseClassesSection({
  academyId,
  athleteId,
  groupId,
  groupName,
}: AthleteBaseClassesSectionProps) {
  const [baseClasses, setBaseClasses] = useState<
    Array<{
      id: string;
      name: string;
      startTime: string | null;
      endTime: string | null;
      weekdays: number[];
      coachName: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBaseClasses = async () => {
      if (!groupId) {
        setBaseClasses([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await getAthleteSchedule({
          athleteId,
          academyId,
        });

        if (result.error) {
          setError(result.error);
          return;
        }

        // Filtrar solo clases base
        const base = result.items.filter((item) => item.type === "base");
        setBaseClasses(base);
      } catch (err: any) {
        setError(err.message || "Error al cargar las clases base");
      } finally {
        setLoading(false);
      }
    };

    loadBaseClasses();
  }, [athleteId, academyId, groupId]);

  const WEEKDAY_LABELS: Record<number, string> = {
    0: "Domingo",
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado",
  };

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Clases base</h2>
        <p className="text-sm text-muted-foreground">
          Clases heredadas del grupo principal. Estas clases se asignan automáticamente según el grupo del atleta.
        </p>
        {groupName && (
          <p className="mt-2 text-xs text-muted-foreground">
            Grupo principal: <span className="font-semibold">{groupName}</span>
          </p>
        )}
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Cargando clases base…</span>
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : !groupId ? (
        <p className="text-sm text-muted-foreground">
          Este atleta no tiene un grupo principal asignado. Asigna un grupo para que herede sus clases base.
        </p>
      ) : baseClasses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          El grupo «{groupName}» no tiene clases asignadas actualmente.
        </p>
      ) : (
        <div className="space-y-3">
          {baseClasses.map((cls) => (
            <div
              key={cls.id}
              className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-foreground">{cls.name}</p>
                <p className="text-xs text-muted-foreground">
                  {cls.weekdays.length > 0
                    ? cls.weekdays.map((day) => WEEKDAY_LABELS[day] ?? `Día ${day}`).join(", ")
                    : "Día variable"}{" "}
                  ·{" "}
                  {cls.startTime && cls.endTime
                    ? `${cls.startTime} – ${cls.endTime}`
                    : cls.startTime
                    ? `Desde ${cls.startTime}`
                    : "Horario flexible"}
                </p>
                {cls.coachName && (
                  <p className="text-xs text-muted-foreground">Entrenador: {cls.coachName}</p>
                )}
              </div>
              <Link
                href={`/app/${academyId}/classes/${cls.id}`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Ver clase
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

