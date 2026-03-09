"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface ClassesTableSkeletonProps {
  rows?: number;
}

export function ClassesTableSkeleton({ rows = 5 }: ClassesTableSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Filters Section Skeleton */}
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Skeleton className="h-10 min-w-[220px] flex-1" />
          <Skeleton className="h-10 w-[200px]" />
        </div>
        <Skeleton className="h-10 w-[110px]" />
      </section>

      {/* Table Skeleton */}
      <div className="overflow-hidden rounded-lg border bg-card shadow">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Horario</th>
              <th className="px-4 py-3 font-medium text-right">Capacidad</th>
              <th className="px-4 py-3 font-medium">Entrenadores</th>
              <th className="px-4 py-3 font-medium">Grupos vinculados</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[120px]" />
                    <Skeleton className="h-3 w-[80px]" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-[180px]" />
                </td>
                <td className="px-4 py-3 text-right">
                  <Skeleton className="h-4 w-[40px] ml-auto" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-5 w-[70px] rounded-full" />
                    <Skeleton className="h-5 w-[70px] rounded-full" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-5 w-[60px] rounded-full" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Skeleton className="h-4 w-[40px] ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
