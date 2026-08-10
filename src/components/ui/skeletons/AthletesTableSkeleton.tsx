"use client";

import { DataTableSkeleton, type DataTableSkeletonColumn } from "@/components/ui/data-table-skeleton";

/**
 * Skeleton de Atletas — delega en `DataTableSkeleton`.
 * Conserva la API pública previa (`{ rows?: number }`) para que las
 * páginas `loading.tsx` no necesiten cambios.
 */
const ATHLETES_COLUMNS: DataTableSkeletonColumn[] = [
  { width: "w-10" }, // selección
  { multiline: true, width: "min-w-[160px]" }, // nombre + dob + sportConfigId
  { width: "min-w-[80px]" }, // nivel
  { pill: true, width: "min-w-[90px]" }, // estado (pill)
  { align: "right", width: "min-w-[60px]" }, // edad
  { align: "right", width: "min-w-[60px]" }, // familia
  { pill: true, width: "min-w-[100px]" }, // grupo (pill coloreado)
  { align: "right", width: "min-w-[70px]" }, // acciones
];

interface AthletesTableSkeletonProps {
  rows?: number;
}

export function AthletesTableSkeleton({ rows = 5 }: AthletesTableSkeletonProps) {
  return (
    <DataTableSkeleton
      columns={ATHLETES_COLUMNS}
      rows={rows}
      showFilters
      filterCount={3}
    />
  );
}