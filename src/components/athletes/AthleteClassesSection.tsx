"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ClassInfo {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  coachNames: string[];
  origin: "group" | "enrollment";
}

interface AthleteClassesSectionProps {
  athleteId: string;
  academyId: string;
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

export function AthleteClassesSection({ athleteId, academyId }: AthleteClassesSectionProps) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/athletes/${athleteId}/classes?academyId=${academyId}`);
        if (!response.ok) {
          throw new Error("No se pudieron cargar las clases del atleta.");
        }

        const data = await response.json();
        setClasses(data.items || []);
      } catch (err) {
        setError((err as Error).message ?? "Error al cargar las clases.");
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, [athleteId, academyId]);

  const formatSchedule = (classInfo: ClassInfo) => {
    const days = classInfo.weekdays
      .map((day) => WEEKDAY_LABELS[day] ?? `Día ${day}`)
      .join(", ");
    const time =
      classInfo.startTime && classInfo.endTime
        ? `${classInfo.startTime} – ${classInfo.endTime}`
        : classInfo.startTime
        ? `Desde ${classInfo.startTime}`
        : "";
    return time ? `${days} · ${time}` : days || "Horario flexible";
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Cargando clases...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Clases habituales</h2>
        <p className="text-sm text-muted-foreground">
          Clases donde entrena este atleta. Incluye clases de su grupo principal y clases extra.
        </p>
      </header>

      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este atleta no está asignado a ninguna clase actualmente.
        </p>
      ) : (
        <div className="space-y-3">
          {classes.map((classInfo) => (
            <div
              key={classInfo.id}
              className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-4 py-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/app/${academyId}/classes/${classInfo.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {classInfo.name}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      classInfo.origin === "group"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {classInfo.origin === "group" ? "Por grupo principal" : "Clase extra"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatSchedule(classInfo)}</p>
                {classInfo.coachNames.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Entrenador{classInfo.coachNames.length > 1 ? "es" : ""}: {classInfo.coachNames.join(", ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

