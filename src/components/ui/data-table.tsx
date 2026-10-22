"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface Column<TData> {
  id: string;
  header: string | React.ReactNode;
  accessorKey?: keyof TData | string;
  accessorFn?: (row: TData) => React.ReactNode;
  cell?: (row: TData) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface SortState {
  column: string;
  direction: "asc" | "desc";
}

export interface PaginationState {
  page: number;
  pageSize: number;
}

interface DataTableProps<TData = Record<string, unknown>> {
  data: TData[];
  columns: Column<TData>[];
  className?: string;
  sortable?: boolean;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  pageCount?: number;
  totalCount?: number;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
  loading?: boolean;
}

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  const keys = path.split(".");
  let value: unknown = obj;
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return value;
};

interface DataTableComponentProps<TData = Record<string, unknown>> extends DataTableProps<TData> {
  forwardedRef?: React.ForwardedRef<HTMLDivElement>;
}

function DataTableComponent<TData = Record<string, unknown>>(
  {
    data,
    columns,
    className,
    sortable = true,
    pagination,
    onPaginationChange,
    pageCount = 1,
    totalCount,
    emptyMessage = "No hay datos disponibles",
    onRowClick,
    loading,
    forwardedRef,
  }: DataTableComponentProps<TData>
) {
  const [sortState, setSortState] = React.useState<SortState>({ column: "", direction: "asc" });

  const handleSort = (columnId: string) => {
    if (!sortable) return;
    setSortState((prev) => ({
      column: columnId,
      direction: prev.column === columnId && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedData = React.useMemo(() => {
    if (!sortState.column || !sortable) return data;

    return [...data].sort((a, b) => {
      const column = columns.find((col) => col.id === sortState.column);
      if (!column) return 0;

      let aValue: unknown;
      let bValue: unknown;

      if (column.accessorFn) {
        aValue = column.accessorFn(a);
        bValue = column.accessorFn(b);
      } else if (column.accessorKey) {
        aValue = getNestedValue(a as unknown as Record<string, unknown>, column.accessorKey as string);
        bValue = getNestedValue(b as unknown as Record<string, unknown>, column.accessorKey as string);
      } else {
        return 0;
      }

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortState.direction === "asc" ? -1 : 1;
      if (bValue == null) return sortState.direction === "asc" ? 1 : -1;

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortState.direction === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (aValue instanceof Date && bValue instanceof Date) {
        return sortState.direction === "asc"
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortState.direction === "asc" ? aValue - bValue : bValue - aValue;
      }

      const aStr = String(aValue);
      const bStr = String(bValue);
      return sortState.direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [data, sortState, sortable, columns]);

  const currentPage = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 10;
  const totalPages = Math.max(1, pageCount || Math.ceil((totalCount ?? data.length) / pageSize));

  const paginatedData = React.useMemo(() => {
    if (!pagination) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pagination, currentPage, pageSize]);

  const goToPage = (page: number) => {
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    onPaginationChange?.({ page: clampedPage, pageSize });
  };

  const goToFirstPage = () => goToPage(1);
  const goToLastPage = () => goToPage(totalPages);
  const goToPreviousPage = () => goToPage(currentPage - 1);
  const goToNextPage = () => goToPage(currentPage + 1);

  const renderCell = (row: TData, column: Column<TData>) => {
    if (column.cell) {
      return column.cell(row);
    }
    if (column.accessorFn) {
      return column.accessorFn(row);
    }
    if (column.accessorKey) {
      const value = getNestedValue(row as unknown as Record<string, unknown>, column.accessorKey as string);
      return value != null ? String(value) : null;
    }
    return null;
  };

  return (
    <div ref={forwardedRef} className={cn("space-y-4", className)}>
      <div className="relative w-full overflow-auto rounded-lg border">
        <table className="w-full caption-bottom text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    "h-12 px-4 text-left align-middle font-medium text-muted-foreground",
                    column.sortable && sortable && "cursor-pointer select-none hover:bg-muted/80",
                    column.className
                  )}
                  onClick={() => column.sortable && handleSort(column.id)}
                  aria-sort={
                    sortState.column === column.id
                      ? sortState.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2">
                    {typeof column.header === "string" ? (
                      <span>{column.header}</span>
                    ) : (
                      column.header
                    )}
                    {column.sortable && sortable && (
                      <span className="ml-auto">
                        {sortState.column === column.id ? (
                          sortState.direction === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 opacity-50" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="h-32 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Cargando...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={cn(
                    "border-b transition-colors",
                    onRowClick && "cursor-pointer hover:bg-muted/50"
                  )}
                  onClick={() => onRowClick?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  role={onRowClick ? "button" : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn("p-4 align-middle", column.className)}
                    >
                      {renderCell(row, column)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
          <div className="text-sm text-muted-foreground">
            {totalCount !== undefined && (
              <>
                Mostrando {(currentPage - 1) * pageSize + 1} a{" "}
                {Math.min(currentPage * pageSize, totalCount)} de {totalCount}{" "}
                resultados
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={goToFirstPage}
              disabled={currentPage === 1}
              aria-label="Primera página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={goToLastPage}
              disabled={currentPage === totalPages}
              aria-label="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const DataTable = React.forwardRef(function DataTable<TData = Record<string, unknown>>(
  props: DataTableProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  return <DataTableComponent {...props} forwardedRef={ref} />;
}) as <TData = Record<string, unknown>>(
  props: DataTableProps<TData> & React.RefAttributes<HTMLDivElement>
) => React.ReactElement;

export { DataTable };
export type { DataTableProps };
