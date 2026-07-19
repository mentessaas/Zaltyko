"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface AttendanceRiskWidgetProps {
  academyId: string;
}

interface AttendanceAlert {
  athleteId: string;
  athleteName: string;
  attendanceRate: number;
  threshold: number;
  daysChecked: number;
}

export function AttendanceRiskWidget({ academyId }: AttendanceRiskWidgetProps) {
  const [alerts, setAlerts] = useState<AttendanceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAlerts() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/alerts/attendance?academyId=${academyId}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? "No se pudo cargar el riesgo de asistencia");
        }

        const items = payload?.data?.items ?? payload?.items ?? payload?.alerts ?? [];
        setAlerts(Array.isArray(items) ? items : []);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "No se pudo cargar el riesgo de asistencia");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadAlerts();

    return () => controller.abort();
  }, [academyId]);

  const highestRisk = useMemo(
    () => [...alerts].sort((a, b) => a.attendanceRate - b.attendanceRate).slice(0, 3),
    [alerts]
  );

  return (
    <div className="rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zaltyko-navy">Riesgo de asistencia</h3>
          <p className="text-xs text-muted-foreground">Últimos 30 días</p>
        </div>
        {!isLoading && !error ? (
          <span className="rounded-full bg-zaltyko-white px-2.5 py-1 text-xs font-semibold text-zaltyko-navy">
            {alerts.length}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Analizando asistencia…</p>
      ) : error ? (
        <p className="text-sm text-zaltyko-coral">{error}</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin atletas en riesgo detectado.</p>
      ) : (
        <div className="space-y-3">
          {highestRisk.map((alert) => (
            <Link
              key={alert.athleteId}
              href={`/app/${academyId}/athletes/${alert.athleteId}`}
              className="block rounded-xl border border-zaltyko-mist px-3 py-2 transition hover:border-zaltyko-teal/50 hover:bg-zaltyko-white"
            >
              <p className="truncate text-sm font-semibold text-zaltyko-navy">{alert.athleteName}</p>
              <p className="text-xs text-muted-foreground">
                {Math.round(alert.attendanceRate)}% asistencia · umbral {Math.round(alert.threshold)}%
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
