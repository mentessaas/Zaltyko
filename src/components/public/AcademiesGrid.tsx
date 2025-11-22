"use client";

import { AcademyCard } from "./AcademyCard";
import type { PublicAcademy } from "@/app/actions/public/get-public-academies";

interface AcademiesGridProps {
  academies: PublicAcademy[];
  isLoading?: boolean;
}

export function AcademiesGrid({ academies, isLoading }: AcademiesGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-xl border border-white/10 bg-white/5"
          />
        ))}
      </div>
    );
  }

  if (academies.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center">
        <p className="text-lg font-medium text-white/80">
          No se encontraron academias con los filtros seleccionados.
        </p>
        <p className="mt-2 text-sm text-white/60">
          Intenta ajustar los filtros de búsqueda.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {academies.map((academy) => (
        <AcademyCard key={academy.id} academy={academy} />
      ))}
    </div>
  );
}

