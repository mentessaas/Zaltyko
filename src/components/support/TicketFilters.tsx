"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketCategory = "technical" | "billing" | "account" | "feature_request" | "other";

interface TicketFiltersProps {
  currentStatus?: TicketStatus;
  currentPriority?: TicketPriority;
  currentCategory?: TicketCategory;
  showStatus?: boolean;
  showPriority?: boolean;
  showCategory?: boolean;
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
  { value: "billing", label: "Facturación" },
  { value: "account", label: "Cuenta" },
  { value: "feature_request", label: "Solicitud de Función" },
  { value: "other", label: "Otro" },
];

export function TicketFilters({
  currentStatus,
  currentPriority,
  currentCategory,
  showStatus = true,
  showPriority = true,
  showCategory = true,
}: TicketFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push(window.location.pathname);
  }, [router]);

  const hasFilters = currentStatus || currentPriority || currentCategory;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border">
      {showStatus && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Estado</label>
          <Select
            value={currentStatus || "all"}
            onValueChange={(value) => updateFilter("status", value)}
          >
            <SelectTrigger className="w-[160px]">
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
          <label className="text-xs font-medium text-muted-foreground">Prioridad</label>
          <Select
            value={currentPriority || "all"}
            onValueChange={(value) => updateFilter("priority", value)}
          >
            <SelectTrigger className="w-[160px]">
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
          <label className="text-xs font-medium text-muted-foreground">Categoría</label>
          <Select
            value={currentCategory || "all"}
            onValueChange={(value) => updateFilter("category", value)}
          >
            <SelectTrigger className="w-[180px]">
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
