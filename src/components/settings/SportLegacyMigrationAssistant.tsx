"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

type EntityType = "athletes" | "groups" | "classes" | "coaches";

interface LegacyItem {
  id: string;
  name: string;
}

interface SportConfigOption {
  id: string;
  branchName: string;
  disciplineName: string;
  terminology?: Record<string, string>;
}

interface MigrationData {
  athletes: LegacyItem[];
  groups: LegacyItem[];
  classes: LegacyItem[];
  coaches: LegacyItem[];
}

interface SportLegacyMigrationAssistantProps {
  academyId: string;
  sportConfigs: SportConfigOption[];
  onMigrated?: () => void;
}

const DEFAULT_DATA: MigrationData = {
  athletes: [],
  groups: [],
  classes: [],
  coaches: [],
};

export function SportLegacyMigrationAssistant({
  academyId,
  sportConfigs,
  onMigrated,
}: SportLegacyMigrationAssistantProps) {
  const [data, setData] = useState<MigrationData>(DEFAULT_DATA);
  const [entityType, setEntityType] = useState<EntityType>("athletes");
  const [sportConfigId, setSportConfigId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [applyAll, setApplyAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentItems = data[entityType];
  const totalPending = data.athletes.length + data.groups.length + data.classes.length + data.coaches.length;
  const terms = useMemo(
    () => getTerminologyForSportConfig(sportConfigs, sportConfigId),
    [sportConfigs, sportConfigId]
  );
  const entityLabels: Record<EntityType, string> = {
    athletes: terms.athletes,
    groups: terms.groups,
    classes: "Clases",
    coaches: `${terms.coach}s`,
  };

  const sportConfigLabel = useMemo(
    () => sportConfigs.find((config) => config.id === sportConfigId),
    [sportConfigs, sportConfigId]
  );

  const loadData = async () => {
    const response = await fetch(`/api/academies/${academyId}/sport-migration`, {
      headers: { "x-academy-id": academyId },
    });
    if (!response.ok) return;
    const payload = await response.json();
    setData({ ...DEFAULT_DATA, ...(payload.data ?? {}) });
    setSelectedIds([]);
    setApplyAll(false);
  };

  useEffect(() => {
    void loadData();
  }, [academyId]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handleMigrate = () => {
    setMessage(null);
    if (!sportConfigId) {
      setMessage("Selecciona una rama destino.");
      return;
    }
    if (!applyAll && selectedIds.length === 0) {
      setMessage("Selecciona registros o marca aplicar a todos.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/academies/${academyId}/sport-migration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-academy-id": academyId,
        },
        body: JSON.stringify({
          entityType,
          sportConfigId,
          ids: selectedIds,
          applyAll,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.message ?? "No se pudo aplicar la migración.");
        return;
      }

      setMessage(`${payload.data?.updated ?? 0} registro(s) asignado(s) a ${sportConfigLabel?.branchName ?? "la rama"}.`);
      await loadData();
      onMigrated?.();
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Asistente de migración legacy</CardTitle>
            <CardDescription>
              Asigna una rama activa a datos antiguos que todavía no tienen configuración deportiva.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalPending === 0 ? (
          <p className="rounded-xl border border-zaltyko-teal/25 bg-zaltyko-teal/10 p-4 text-sm text-zaltyko-teal">
            No hay {terms.athletes.toLowerCase()}, {terms.groups.toLowerCase()}, clases ni {entityLabels.coaches.toLowerCase()} pendientes de {terms.branch.toLowerCase()}.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              {(["athletes", "groups", "classes", "coaches"] as EntityType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setEntityType(type);
                    setSelectedIds([]);
                    setApplyAll(false);
                  }}
                  className={`rounded-xl border p-4 text-left text-sm ${
                    entityType === type ? "border-zaltyko-teal bg-zaltyko-teal/10" : "border-zaltyko-mist bg-white"
                  }`}
                >
                  <span className="block font-medium text-zaltyko-navy">{entityLabels[type]}</span>
                  <span className="text-zaltyko-text-secondary">{data[type].length} pendiente(s)</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <select
                value={sportConfigId}
                onChange={(event) => setSportConfigId(event.target.value)}
                className="h-10 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Rama destino</option>
                {sportConfigs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.branchName} · {config.disciplineName}
                  </option>
                ))}
              </select>
              <Button onClick={handleMigrate} disabled={isPending || currentItems.length === 0}>
                <ArrowRight className="mr-2 h-4 w-4" />
                {isPending ? "Aplicando..." : "Asignar rama"}
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm text-zaltyko-text-secondary">
              <input
                type="checkbox"
                checked={applyAll}
                onChange={(event) => {
                  setApplyAll(event.target.checked);
                  setSelectedIds([]);
                }}
              />
              Aplicar a todos los {entityLabels[entityType].toLowerCase()} pendientes
            </label>

            {entityType === "coaches" && (
              <p className="rounded-lg border border-zaltyko-mist bg-zaltyko-warm-white px-3 py-2 text-xs text-zaltyko-text-secondary">
                {entityLabels.coaches} sin scope están disponibles para todas las ramas como compatibilidad legacy. Al asignarles una {terms.branch.toLowerCase()} aquí quedarán acotados a esa configuración.
              </p>
            )}

            {!applyAll && (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-2">
                {currentItems.length === 0 ? (
                  <p className="p-3 text-sm text-zaltyko-text-secondary">No hay registros pendientes en esta categoría.</p>
                ) : (
                  currentItems.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-white">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                      />
                      <span>{item.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {message && (
          <p className="rounded-lg border border-zaltyko-mist bg-white px-3 py-2 text-sm text-zaltyko-text-secondary">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
