"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Violation {
  resource: string;
  currentCount: number;
  limit: number | null;
  items: Array<{ id: string; name: string | null }>;
}

interface PlanLimitsData {
  violations: Violation[];
  requiresAction: boolean;
}

export default function PlanLimitsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlanLimitsData | null>(null);
  const [selectedAcademies, setSelectedAcademies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchLimits = async () => {
      try {
        const response = await fetch("/api/profile/check-limits", { cache: "no-store" });
        if (response.ok) {
          const result = await response.json();
          setData(result);
          
          // Pre-select academies if there's an academy violation
          const academyViolation = result.violations?.find((v: Violation) => v.resource === "academies");
          if (academyViolation && academyViolation.limit !== null) {
            // Select first N academies up to the limit
            const academiesToKeep = academyViolation.items
              .slice(0, academyViolation.limit)
              .map((item: { id: string }) => item.id);
            setSelectedAcademies(academiesToKeep);
          }
        }
      } catch (error) {
        console.error("Error fetching limits", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLimits();
  }, []);

  const handleSave = async () => {
    const academyViolation = data?.violations?.find((v) => v.resource === "academies");
    
    if (academyViolation && academyViolation.limit !== null) {
      if (selectedAcademies.length !== academyViolation.limit) {
        alert(`Debes seleccionar exactamente ${academyViolation.limit} ${academyViolation.limit === 1 ? "academia" : "academias"}`);
        return;
      }
    }

    setSaving(true);
    try {
      const response = await fetch("/api/profile/adjust-plan-limits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          academyIdsToKeep: selectedAcademies,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.message || error.error || "Error desconocido"}`);
        return;
      }

      alert("Ajustes aplicados correctamente. Puedes continuar usando Zaltyko.");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error saving adjustments", error);
      alert("Error al guardar los ajustes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="text-slate-400">Verificando límites...</p>
        </div>
      </div>
    );
  }

  if (!data || !data.requiresAction) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <div className="rounded-lg border border-emerald-400/60 bg-emerald-400/10 p-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-emerald-400" strokeWidth={2} />
            <div>
              <h2 className="text-xl font-semibold text-emerald-900">Todo está en orden</h2>
              <p className="mt-1 text-sm text-emerald-700">
                Tu plan actual no tiene violaciones de límites. Puedes continuar usando Zaltyko normalmente.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Button asChild>
              <Link href="/dashboard">Volver al dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const academyViolation = data.violations.find((v) => v.resource === "academies");
  const otherViolations = data.violations.filter((v) => v.resource !== "academies");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2} />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-amber-900">Ajustes necesarios en tu plan</h1>
            <p className="mt-2 text-sm text-amber-700">
              Tu plan actual tiene límites que están siendo excedidos. Para continuar usando Zaltyko, necesitas ajustar los siguientes recursos.
            </p>
          </div>
        </div>
      </div>

      {academyViolation && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Selecciona las academias a mantener activas</h2>
          <p className="mb-4 text-sm text-slate-300">
            Tu plan permite <strong>{academyViolation.limit}</strong> {academyViolation.limit === 1 ? "academia" : "academias"} activa{academyViolation.limit === 1 ? "" : "s"}, pero tienes <strong>{academyViolation.currentCount}</strong>.
            Selecciona cuáles mantener activas:
          </p>
          <div className="space-y-2">
            {academyViolation.items.map((academy) => {
              const isSelected = selectedAcademies.includes(academy.id);
              const canSelect = isSelected || selectedAcademies.length < (academyViolation.limit ?? 0);

              return (
                <label
                  key={academy.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition",
                    isSelected
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : canSelect
                        ? "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10"
                        : "cursor-not-allowed border-white/10 bg-white/5 opacity-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        if (selectedAcademies.length < (academyViolation.limit ?? 0)) {
                          setSelectedAcademies([...selectedAcademies, academy.id]);
                        }
                      } else {
                        setSelectedAcademies(selectedAcademies.filter((id) => id !== academy.id));
                      }
                    }}
                    disabled={!canSelect && !isSelected}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-white">{academy.name ?? "Academia sin nombre"}</p>
                    <p className="text-xs text-slate-400">ID: {academy.id}</p>
                  </div>
                  {isSelected && (
                    <CheckCircle className="h-5 w-5 text-emerald-400" strokeWidth={2} />
                  )}
                </label>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Seleccionadas: {selectedAcademies.length} / {academyViolation.limit}
          </p>
        </div>
      )}

      {otherViolations.length > 0 && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-6">
          <h2 className="mb-4 text-lg font-semibold text-amber-900">Otros recursos que exceden límites</h2>
          <div className="space-y-4">
            {otherViolations.map((violation, idx) => (
              <div key={idx} className="rounded-lg border border-amber-400/20 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white capitalize">
                    {violation.resource === "athletes" && "Atletas"}
                    {violation.resource === "classes" && "Clases"}
                    {violation.resource === "groups" && "Grupos"}
                  </h3>
                  <span className="text-sm text-amber-300">
                    {violation.currentCount} / {violation.limit ?? "∞"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Tienes <strong>{violation.currentCount}</strong> {violation.resource}, pero tu plan solo permite <strong>{violation.limit}</strong>.
                  Debes reducir el número de {violation.resource} activos desde el panel correspondiente.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="border-white/20 bg-white/5 text-slate-100 hover:border-white/40 hover:bg-white/10"
          onClick={() => router.push("/dashboard")}
        >
          Cancelar
        </Button>
        <Button
          className="bg-emerald-500 text-white hover:bg-emerald-600"
          onClick={handleSave}
          disabled={saving || (academyViolation && selectedAcademies.length !== (academyViolation.limit ?? 0))}
        >
          {saving ? "Guardando..." : "Aplicar ajustes"}
        </Button>
      </div>
    </div>
  );
}

