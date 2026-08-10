"use client";

import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * DataTableSkeleton — shimmer alineado con el DataTable.
 *
 * Acepta la misma forma de columnas que `DataTable` (más una columna
 * opcional de selección) para que el skeleton refleje visualmente la
 * tabla que va a aparecer: misma cantidad de columnas, misma altura
 * de header (h-12) y misma altura de filas.
 *
 * Pilotos que delegan aquí:
 *  - `AthletesTableSkeleton` (8 columnas + selección + filtros)
 *  - `ClassesTableSkeleton`  (6 columnas + filtros)
 *
 * Si el consumidor no quiere reescribir su columna, puede pasar
 * `columnCount` con un número entero y se renderiza ese set con
 * anchos variables.
 */

interface DataTableSkeletonColumn {
  /** Ancho aproximado (Tailwind). Default: w-full. */
  width?: string;
  /** Alineación del header (afecta solo el alineamiento del shimmer). */
  align?: "left" | "center" | "right";
  /** Si la columna lleva múltiples líneas (ej. nombre + subinfo). */
  multiline?: boolean;
  /** Si la columna lleva badge/pill en vez de línea. */
  pill?: boolean;
}

export interface DataTableSkeletonProps {
  /** Cantidad de filas a mostrar. Default 5. */
  rows?: number;
  /** Definición de columnas. Si se omite, usa el fallback de `columnCount`. */
  columns?: DataTableSkeletonColumn[];
  /** Fallback cuando `columns` no se pasa. Default 6. */
  columnCount?: number;
  /** Mostrar bloque de filtros (search + selects). Default true. */
  showFilters?: boolean;
  /** Cantidad de filtros. Default 3. */
  filterCount?: number;
  /** ClassName extra. */
  className?: string;
}

const DEFAULT_COLUMNS: DataTableSkeletonColumn[] = Array.from({ length: 6 }, () => ({}));

function DataTableSkeleton({
  rows = 5,
  columns,
  columnCount = 6,
  showFilters = true,
  filterCount = 3,
  className,
}: DataTableSkeletonProps) {
  const cols = columns ?? DEFAULT_COLUMNS.slice(0, columnCount);

  return (
    <div
      className={cn("space-y-4", className)}
      role="status"
      aria-live="polite"
      aria-label="Cargando datos"
      data-testid="data-table-skeleton"
    >
      <span className="sr-only">Cargando datos</span>

      {showFilters && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zaltyko-mist bg-white p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <Skeleton className="h-11 min-w-[200px] flex-1" />
            {Array.from({ length: filterCount }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-[160px]" />
            ))}
          </div>
          <Skeleton className="h-11 w-[130px]" />
        </div>
      )}

      <div className="hidden overflow-x-auto rounded-2xl border border-zaltyko-mist bg-white shadow-soft md:block">
        <table className="w-full caption-bottom text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {cols.map((col, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    "h-12 px-4 text-left align-middle font-medium text-muted-foreground",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center"
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex} aria-hidden>
                {cols.map((col, colIndex) => {
                  const alignClass =
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : "text-left";
                  return (
                    <td
                      key={colIndex}
                      className={cn("p-4 align-middle", alignClass)}
                    >
                      {col.multiline ? (
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-[140px]" />
                          <Skeleton className="h-3 w-[100px]" />
                        </div>
                      ) : col.pill ? (
                        <Skeleton className="h-5 w-[80px] rounded-full" />
                      ) : (
                        <Skeleton
                          className={cn(
                            "h-4",
                            col.align === "right" && "ml-auto",
                            col.width ? "" : "w-full max-w-[120px]"
                          )}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden" aria-hidden>
        {Array.from({ length: Math.min(rows, 4) }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft"
          >
            <div className="space-y-3">
              <Skeleton className="h-5 w-[140px]" />
              <Skeleton className="h-3 w-[180px]" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-5 w-[60px] rounded-full" />
                <Skeleton className="h-5 w-[80px] rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DataTableSkeleton };
export type { DataTableSkeletonColumn };