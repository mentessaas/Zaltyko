"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory = "technical" | "billing" | "account" | "feature_request" | "other";

interface TicketFiltersProps {
  currentStatus?: TicketStatus;
  currentPriority?: TicketPriority;
  currentCategory?: TicketCategory;
  currentSearch?: string;
  showStatus?: boolean;
  showPriority?: boolean;
  showCategory?: boolean;
  showSearch?: boolean;
}

const statusOptions: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Abierto" },
  { value: "in_progress", label: "En Progreso" },
  { value: "waiting", label: "Esperando" },
  { value: "resolved", label: "Resuelto" },
  { value: "closed", label: "Cerrado" },
];

const priorityOptions: { value: TicketPriority; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const categoryOptions: { value: TicketCategory; label: string }[] = [
  { value: "technical", label: "Técnico" },
  { value: "billing", label: "Cobros" },
  { value: "account", label: "Cuenta" },
  { value: "feature_request", label: "Solicitud de Función" },
  { value: "other", label: "Otro" },
];

export function TicketFilters({
  currentStatus,
  currentPriority,
  currentCategory,
  currentSearch = "",
  showStatus = true,
  showPriority = true,
  showCategory = true,
  showSearch = false,
}: TicketFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentSearch);

  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // A new filter always starts at the first result page.
      params.delete("page");
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push(window.location.pathname);
  }, [router]);

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      updateFilter("q", searchInput.trim());
    },
    [searchInput, updateFilter]
  );

  const hasFilters = currentStatus || currentPriority || currentCategory || currentSearch;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border">
      {showSearch && (
        <form onSubmit={submitSearch} className="flex min-w-[min(100%,18rem)] flex-1 flex-col gap-1 sm:max-w-sm">
          <label htmlFor="support-search-filter" className="text-xs font-medium text-muted-foreground">
            Buscar tickets
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="support-search-filter"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Título, descripción o academia"
                maxLength={160}
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" size="sm" className="h-10 shrink-0 gap-2">
              <Search className="h-4 w-4" aria-hidden="true" />
              Buscar
            </Button>
          </div>
        </form>
      )}
      {showStatus && (
        <div className="flex flex-col gap-1">
          <label htmlFor="support-status-filter" className="text-xs font-medium text-muted-foreground">Estado</label>
          <Select
            value={currentStatus || "all"}
            onValueChange={(value) => updateFilter("status", value)}
          >
            <SelectTrigger id="support-status-filter" aria-label="Filtrar tickets por estado" className="w-[160px]">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showPriority && (
        <div className="flex flex-col gap-1">
          <label htmlFor="support-priority-filter" className="text-xs font-medium text-muted-foreground">Prioridad</label>
          <Select
            value={currentPriority || "all"}
            onValueChange={(value) => updateFilter("priority", value)}
          >
            <SelectTrigger id="support-priority-filter" aria-label="Filtrar tickets por prioridad" className="w-[160px]">
              <SelectValue placeholder="Todas las prioridades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {priorityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showCategory && (
        <div className="flex flex-col gap-1">
          <label htmlFor="support-category-filter" className="text-xs font-medium text-muted-foreground">Categoría</label>
          <Select
            value={currentCategory || "all"}
            onValueChange={(value) => updateFilter("category", value)}
          >
            <SelectTrigger id="support-category-filter" aria-label="Filtrar tickets por categoría" className="w-[180px]">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {hasFilters && (
        <div className="flex items-end">
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}

export { statusOptions, priorityOptions, categoryOptions };
