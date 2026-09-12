"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { TogglePublicVisibility } from "./TogglePublicVisibility";
import type { PublicAcademy } from "@/app/actions/public/get-public-academies";

type VisibilityFilter = "all" | "public" | "private";

interface PublicAcademiesTableProps {
  academies: Array<PublicAcademy & { isPublic: boolean }>;
  initialFilter: VisibilityFilter;
  initialSearch: string;
  total: number;
  page: number;
  totalPages: number;
  visibilityCounts: { public: number; private: number };
}

const ACADEMY_TYPE_LABELS: Record<string, string> = {
  artistica: "Gimnasia Artística",
  ritmica: "Gimnasia Rítmica",
  trampolin: "Trampolín",
  general: "Gimnasia General",
  parkour: "Parkour",
  danza: "Danza",
};

function buildHref(filter: VisibilityFilter, search: string, page: number) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("visibility", filter);
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/super-admin/academies/public${query ? `?${query}` : ""}`;
}

export function PublicAcademiesTable({
  academies: initialAcademies,
  initialFilter,
  initialSearch,
  total,
  page,
  totalPages,
  visibilityCounts,
}: PublicAcademiesTableProps) {
  const router = useRouter();
  const [academies, setAcademies] = useState(initialAcademies);
  const [filter, setFilter] = useState<VisibilityFilter>(initialFilter);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setAcademies(initialAcademies);
    setFilter(initialFilter);
    setSearchInput(initialSearch);
    setNavigating(false);
  }, [initialAcademies, initialFilter, initialSearch]);

  const navigate = (nextFilter: VisibilityFilter, nextSearch: string, nextPage = 1) => {
    setNavigating(true);
    router.push(buildHref(nextFilter, nextSearch, nextPage));
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(filter, searchInput.trim(), 1);
  };

  const handleToggle = (academyId: string, newValue: boolean) => {
    setAcademies((prev) =>
      prev.map((academy) => (academy.id === academyId ? { ...academy, isPublic: newValue } : academy))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <form onSubmit={handleSearchSubmit} className="flex w-full gap-2" role="search">
          <label htmlFor="public-academies-search" className="sr-only">
            Buscar academias
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45"
              aria-hidden="true"
            />
            <input
              id="public-academies-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por nombre, ciudad o país"
              className="min-h-11 w-full rounded-xl border border-white/15 bg-white/10 py-2 pl-10 pr-10 text-sm text-white placeholder:text-white/45 focus:border-zaltyko-electric focus:outline-none focus:ring-2 focus:ring-zaltyko-electric/30"
              maxLength={160}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  navigate(filter, "", 1);
                }}
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-electric"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={navigating}
            className="min-h-11 rounded-xl bg-zaltyko-electric px-4 text-sm font-semibold text-zaltyko-primary-dark transition hover:bg-zaltyko-electric/90 disabled:cursor-wait disabled:opacity-60"
          >
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar academias por visibilidad">
          {([
            ["all", `Todas (${visibilityCounts.public + visibilityCounts.private})`],
            ["public", `Públicas (${visibilityCounts.public})`],
            ["private", `Privadas (${visibilityCounts.private})`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              disabled={navigating}
              onClick={() => navigate(value, searchInput.trim(), 1)}
              className={`min-h-10 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-electric ${
                filter === value
                  ? "bg-zaltyko-accent text-zaltyko-primary-dark"
                  : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-white/55">
            {total.toLocaleString("es-ES")} resultados · página {page} de {totalPages}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full" aria-label="Academias y visibilidad pública">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/60">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/60">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-white/60">Ubicación</th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase text-white/60">Visibilidad</th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase text-white/60">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {academies.map((academy) => (
                <tr key={academy.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 text-sm font-medium text-white">{academy.name}</td>
                  <td className="px-6 py-4 text-sm text-white/70">
                    {ACADEMY_TYPE_LABELS[academy.academyType] || academy.academyType}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/70">
                    {[academy.city, academy.region, academy.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        academy.isPublic ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
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
      </div>

      {academies.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-white/70">
            {initialSearch
              ? `No se encontraron academias para "${initialSearch}".`
              : "No se encontraron academias con los filtros seleccionados."}
          </p>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginación de academias públicas" className="flex items-center justify-between">
          <span className="text-xs text-white/50">50 por página</span>
          <div className="flex items-center gap-2">
            <Link
              href={buildHref(filter, initialSearch, Math.max(1, page - 1))}
              aria-label="Página anterior"
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : 0}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white transition hover:bg-white/10 ${
                page <= 1 ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span className="min-w-20 text-center text-xs text-white/60">
              {page} / {totalPages}
            </span>
            <Link
              href={buildHref(filter, initialSearch, Math.min(totalPages, page + 1))}
              aria-label="Página siguiente"
              aria-disabled={page >= totalPages}
              tabIndex={page >= totalPages ? -1 : 0}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white transition hover:bg-white/10 ${
                page >= totalPages ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
