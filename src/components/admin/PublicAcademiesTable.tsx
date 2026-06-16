"use client";

import { useState } from "react";
import { TogglePublicVisibility } from "./TogglePublicVisibility";
import type { PublicAcademy } from "@/app/actions/public/get-public-academies";

interface PublicAcademiesTableProps {
  academies: Array<PublicAcademy & { isPublic: boolean }>;
}

const ACADEMY_TYPE_LABELS: Record<string, string> = {
  artistica: "Gimnasia Artística",
  ritmica: "Gimnasia Rítmica",
  trampolin: "Trampolín",
  general: "Gimnasia General",
  parkour: "Parkour",
  danza: "Danza",
};

export function PublicAcademiesTable({ academies: initialAcademies }: PublicAcademiesTableProps) {
  const [academies, setAcademies] = useState(initialAcademies);
  const [filter, setFilter] = useState<"all" | "public" | "private">("all");

  const filteredAcademies = academies.filter((academy) => {
    if (filter === "public") return academy.isPublic;
    if (filter === "private") return !academy.isPublic;
    return true;
  });

  const handleToggle = (academyId: string, newValue: boolean) => {
    setAcademies((prev) =>
      prev.map((a) => (a.id === academyId ? { ...a, isPublic: newValue } : a))
    );
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            filter === "all"
              ? "bg-zaltyko-accent text-zaltyko-primary-dark"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          Todas ({academies.length})
        </button>
        <button
          onClick={() => setFilter("public")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            filter === "public"
              ? "bg-zaltyko-accent text-zaltyko-primary-dark"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          Públicas ({academies.filter((a) => a.isPublic).length})
        </button>
        <button
          onClick={() => setFilter("private")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            filter === "private"
              ? "bg-zaltyko-accent text-zaltyko-primary-dark"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          Privadas ({academies.filter((a) => !a.isPublic).length})
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full">
          <thead className="bg-white/5">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/60">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/60">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/60">
                Ubicación
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase text-white/60">
                Visibilidad
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase text-white/60">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filteredAcademies.map((academy) => (
              <tr key={academy.id} className="hover:bg-white/5">
                <td className="px-6 py-4 text-sm font-medium text-white">
                  {academy.name}
                </td>
                <td className="px-6 py-4 text-sm text-white/70">
                  {ACADEMY_TYPE_LABELS[academy.academyType] || academy.academyType}
                </td>
                <td className="px-6 py-4 text-sm text-white/70">
                  {[academy.city, academy.region, academy.country]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="px-6 py-4 text-center">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      academy.isPublic
                        ? "bg-green-500/20 text-green-400"
                        : "bg-gray-500/20 text-gray-400"
                    }`}
                  >
                    {academy.isPublic ? "Pública" : "Privada"}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <TogglePublicVisibility
                    academyId={academy.id}
                    currentValue={academy.isPublic}
                    onToggle={(newValue) => handleToggle(academy.id, newValue)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAcademies.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-white/70">No se encontraron academias con los filtros seleccionados.</p>
        </div>
      )}
    </div>
  );
}

