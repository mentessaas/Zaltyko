"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap, Loader2 } from "lucide-react";

import { sendCompetencia } from "./client-api";
import { ciButtonGhost, ciButtonPrimary } from "./ui";

interface SeedReport {
  competitorsCreated: number;
  sourcesCreated: number;
  sectionsCreated: number;
  pricingCreated: number;
  opportunitiesCreated: number;
}

export function SeedButton({ primary = false }: { primary?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setMessage(null);
    try {
      const result = await sendCompetencia<{
        version: string;
        report: SeedReport;
      }>("/api/super-admin/competencia/seed", "POST");
      const { report } = result;
      setMessage(
        `Semilla ${result.version}: ${report.competitorsCreated} competidores, ${report.sourcesCreated} fuentes, ` +
          `${report.pricingCreated} planes y ${report.opportunitiesCreated} oportunidades nuevas. Lo existente no se modificó.`
      );
      router.refresh();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "No se pudo cargar la semilla"
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className={primary ? ciButtonPrimary : ciButtonGhost}
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <DatabaseZap className="h-4 w-4" aria-hidden />
        )}
        {running ? "Cargando…" : "Cargar datos iniciales"}
      </button>
      {message ? (
        <p role="status" className="max-w-md text-xs text-white/70">
          {message}
        </p>
      ) : null}
    </div>
  );
}
