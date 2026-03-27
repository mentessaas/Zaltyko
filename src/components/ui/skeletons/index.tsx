"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Primitivas reutilizables para skeletons de tablas y cards.
 * Compóner según necesidad en lugar de crear skeletons específicos.
 */

export interface TableColumn {
  width?: string;
  align?: "left" | "center" | "right";
}

export interface TableSkeletonProps {
  columns: TableColumn[];
  rows?: number;
  showFilters?: boolean;
}

/**
 * Skeleton de tabla genérica con columnas configurables
 */
export function TableSkeleton({
  columns,
  rows = 5,
  showFilters = false,
}: TableSkeletonProps) {
  return (
    <div className="space-y-6">
      {showFilters && (
        <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <Skeleton className="h-10 min-w-[200px] flex-1" />
            <Skeleton className="h-10 w-[160px]" />
            <Skeleton className="h-10 w-[160px]" />
          </div>
          <Skeleton className="h-10 w-[130px]" />
        </section>
      )}

      <div className="overflow-hidden rounded-lg border bg-card shadow">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 font-medium ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : ""
                  }`}
                  style={{ width: col.width }}
                >
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-muted/40">
                {columns.map((col, colIndex) => (
                  <td
                    key={colIndex}
                    className={`px-4 py-3 ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : ""
                    }`}
                  >
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Skeleton de card genérico
 */
export interface CardSkeletonProps {
  showAvatar?: boolean;
  showBadges?: number;
  showDescription?: boolean;
  lines?: number;
}

export function CardSkeleton({
  showAvatar = true,
  showBadges = 0,
  showDescription = true,
  lines = 2,
}: CardSkeletonProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {showAvatar && <Skeleton className="h-12 w-12 rounded-full" />}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-[140px]" />
          {showDescription && (
            <Skeleton className="h-4 w-[180px]" />
          )}
        </div>
      </div>
      {showBadges > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: showBadges }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-[60px] rounded-full" />
          ))}
        </div>
      )}
      {lines > 0 && (
        <div className="mt-4 space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton de stat card
 */
export function StatCardSkeleton() {
  return <Skeleton className="h-24 rounded-xl" />;
}

/**
 * Skeleton de grid de stat cards
 */
export interface StatsGridSkeletonProps {
  count?: number;
  cols?: "grid-cols-1" | "grid-cols-2" | "grid-cols-3" | "grid-cols-4";
}

export function StatsGridSkeleton({
  count = 4,
  cols = "grid-cols-2",
}: StatsGridSkeletonProps) {
  return (
    <div className={`grid gap-3 md:gap-4 ${cols} md:${cols.replace("grid-cols-", "grid-cols-")}`}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton de lista de items
 */
export interface ListSkeletonProps {
  items?: number;
  avatar?: boolean;
  lines?: number;
}

export function ListSkeleton({
  items = 5,
  avatar = true,
  lines = 1,
}: ListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {avatar && <Skeleton className="h-10 w-10 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-[140px]" />
            {lines > 1 && <Skeleton className="h-3 w-[100px]" />}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton de grid de cards (para eventos, academias, etc.)
 */
export interface GridSkeletonProps {
  items?: number;
  cols?: "grid-cols-1" | "grid-cols-2" | "grid-cols-3" | "grid-cols-4";
}

export function GridSkeleton({
  items = 6,
  cols = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
}: GridSkeletonProps) {
  return (
    <div className={`grid gap-4 ${cols}`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Re-export individual skeletons for backwards compatibility
export { AthletesTableSkeleton } from "./AthletesTableSkeleton";
export { AcademiesGridSkeleton } from "./AcademiesGridSkeleton";
export { EventsGridSkeleton } from "./EventsGridSkeleton";
export { CalendarSkeleton } from "./CalendarSkeleton";
export { ClassesTableSkeleton } from "./ClassesTableSkeleton";
export { CoachesTableSkeleton } from "./CoachesTableSkeleton";
