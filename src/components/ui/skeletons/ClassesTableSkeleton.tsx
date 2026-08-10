"use client";

import { DataTableSkeleton, type DataTableSkeletonColumn } from "@/components/ui/data-table-skeleton";

/**
 * Skeleton de Clases — delega en `DataTableSkeleton`.
 * Conserva la API pública previa (`{ rows?: number }`).
 */
const CLASSES_COLUMNS: DataTableSkeletonColumn[] = [
  { multiline: true, width: "min-w-[160px]" }, // nombre + starter badge + sportConfigId + chips
  { width: "min-w-[180px]" }, // horario
  { align: "right", width: "min-w-[80px]" }, // capacidad
  { width: "min-w-[120px]" }, // coaches (chips)
  { width: "min-w-[140px]" }, // grupos vinculados (chips)
  { align: "right", width: "min-w-[70px]" }, // acciones
];

interface ClassesTableSkeletonProps {
  rows?: number;
}

export function ClassesTableSkeleton({ rows = 5 }: ClassesTableSkeletonProps) {
  return (
    <DataTableSkeleton
      columns={CLASSES_COLUMNS}
      rows={rows}
      showFilters
      filterCount={2}
    />
  );
}