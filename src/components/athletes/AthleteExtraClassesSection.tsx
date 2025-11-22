"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAthleteSchedule } from "@/app/actions/classes/get-athlete-schedule";
import { CreateExtraClassDialog } from "./CreateExtraClassDialog";

interface AthleteExtraClassesSectionProps {
  academyId: string;
  athleteId: string;
  availableCoaches: Array<{
    id: string;
    name: string;
    email: string | null;
  }>;
}

export function AthleteExtraClassesSection({
  academyId,
  athleteId,
  availableCoaches,
}: AthleteExtraClassesSectionProps) {
  const [extraClasses, setExtraClasses] = useState<
    Array<{
      id: string;
      name: string;
      startTime: string | null;
      endTime: string | null;
      weekdays: number[];
      coachName: string | null;
      date?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const loadExtraClasses = async () => {
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

      // Filtrar solo clases extra
      const extra = result.items.filter((item) => item.type === "extra");
      setExtraClasses(extra);
    } catch (err: any) {
      setError(err.message || "Error al cargar las clases extra");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExtraClasses();
  }, [athleteId, academyId]);

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
    <>
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Clases extra</h2>
            <p className="text-sm text-muted-foreground">
              Clases individuales adicionales que no forman parte del grupo principal del atleta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90"
          >
            Añadir clase extra
          </button>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Cargando clases extra…</span>
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : extraClasses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este atleta no tiene clases extra asignadas. Añade una clase extra para entrenamientos adicionales.
          </p>
        ) : (
          <div className="space-y-3">
            {extraClasses.map((cls) => (
              <div
                key={cls.id}
                className="flex items-center justify-between rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-foreground">{cls.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {cls.date
                      ? `Fecha: ${cls.date}`
                      : cls.weekdays.length > 0
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
                <div className="flex items-center gap-2">
                  <Link
                    href={`/app/${academyId}/billing?athleteId=${athleteId}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Ver cobros
                  </Link>
                  <Link
                    href={`/app/${academyId}/classes/${cls.id}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Ver clase
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <CreateExtraClassDialog
        academyId={academyId}
        athleteId={athleteId}
        availableCoaches={availableCoaches}
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={loadExtraClasses}
      />
    </>
  );
}

