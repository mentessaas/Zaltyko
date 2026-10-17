"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Check, Gauge, RotateCcw, WalletCards } from "lucide-react";

const fields = [
  {
    key: "class_fill_rate",
    label: "Ocupación de plazas",
    help: "Plazas ocupadas frente a la capacidad efectiva de las sesiones.",
    group: "Programa y continuidad",
  },
  {
    key: "cohort_retention_rate",
    label: "Retención de inscripciones",
    help: "Proporción de la cohorte inicial que sigue activa al cierre.",
    group: "Programa y continuidad",
  },
  {
    key: "churn_rate",
    label: "Límite de bajas",
    help: "Umbral máximo deseado de bajas en la cohorte.",
    group: "Programa y continuidad",
  },
  {
    key: "collection_rate",
    label: "Cobro de vencimientos",
    help: "Proporción cobrada de los cargos vencidos en el período.",
    group: "Salud financiera",
  },
  {
    key: "attendance_coverage",
    label: "Asistencia registrada",
    help: "Sesiones elegibles con asistencia correctamente registrada.",
    group: "Salud operativa",
  },
] as const;

type TargetKey = (typeof fields)[number]["key"];
type Targets = Partial<Record<TargetKey, number>>;

export function AcademyTargetProfileForm({
  organizationId,
  profile,
}: {
  organizationId: string;
  profile: { version: number; targets: Record<string, number> } | null;
}) {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const values = profile?.targets as Targets | undefined;

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    setSaved(false);
    const targets = Object.fromEntries(
      fields.map((field) => [field.key, Number(formData.get(field.key)) / 100])
    ) as Record<TargetKey, number>;
    try {
      const response = await fetch("/api/v1/owner/health-score/targets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current,
        },
        body: JSON.stringify({ organizationId, targets }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          problem?.detail ?? "No se han podido guardar las metas."
        );
      }
      setSaved(true);
      idempotencyKey.current = crypto.randomUUID();
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se han podido guardar las metas."
      );
    } finally {
      setPending(false);
    }
  }

  const groups = [...new Set(fields.map((field) => field.group))];
  return (
    <form action={submit} className="grid gap-8">
      {groups.map((group) => (
        <section key={group} aria-labelledby={`group-${group}`}>
          <div className="mb-3 flex items-center gap-3 border-b border-slate-300 pb-3">
            {group === "Salud financiera" ? (
              <WalletCards
                className="h-5 w-5 text-teal-800"
                aria-hidden="true"
              />
            ) : (
              <Gauge className="h-5 w-5 text-teal-800" aria-hidden="true" />
            )}
            <h2
              id={`group-${group}`}
              className="font-display text-xl font-bold"
            >
              {group}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {fields
              .filter((field) => field.group === group)
              .map((field) => (
                <label
                  key={field.key}
                  className="grid content-start gap-2 border-l-2 border-teal-800/30 bg-white p-4"
                >
                  <span className="text-sm font-bold text-slate-900">
                    {field.label}
                  </span>
                  <span className="relative">
                    <input
                      name={field.key}
                      type="number"
                      required
                      min="1"
                      max="100"
                      step="0.5"
                      defaultValue={
                        values?.[field.key] === undefined
                          ? ""
                          : (values[field.key]! * 100).toFixed(1)
                      }
                      inputMode="decimal"
                      aria-describedby={`${field.key}-help`}
                      className="touch-target w-full border border-slate-400 bg-[#FAFAF7] px-3 pr-10 font-mono text-lg text-slate-950 focus:border-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-800/30"
                    />
                    <span className="pointer-events-none absolute right-3 top-3 text-sm text-slate-500">
                      %
                    </span>
                  </span>
                  <span
                    id={`${field.key}-help`}
                    className="text-xs leading-5 text-slate-600"
                  >
                    {field.help}
                  </span>
                </label>
              ))}
          </div>
        </section>
      ))}
      <aside className="flex gap-3 border-l-4 border-amber-600 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <RotateCcw className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>
          Son metas internas que defines para tu academia. No son promedios del
          sector ni comparaciones con otras academias. Cambiarlas crea una nueva
          versión; las anteriores se conservan en el historial.
        </p>
      </aside>
      {error && (
        <p
          role="alert"
          className="border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm font-bold text-teal-900"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Metas guardadas. El score se actualizará al procesar la cola de
          métricas.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="touch-target inline-flex items-center justify-center gap-2 justify-self-start rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:bg-slate-500"
      >
        {pending
          ? "Guardando metas…"
          : profile
            ? `Guardar versión ${profile.version + 1}`
            : "Activar Academy Health Score"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
