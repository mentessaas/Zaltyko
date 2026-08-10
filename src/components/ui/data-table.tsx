"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * DataTable genérico para superficies de gestión del dashboard.
 *
 * Contrato (ZAL-559 / ZAL-551-B1):
 *  - columnas, ordenamiento, selección y navegación por teclado solo donde
 *    cada consumidor lo necesite (todo es opt-in).
 *  - cuatro estados explícitos y mutuamente excluyentes: loading, error,
 *    empty (sin datos) y filtered-empty (datos pero filtros los vaciaron).
 *    error NUNCA cae en empty; empty real NUNCA se confunde con loading.
 *  - mobile-first: el slot `mobileCard` se muestra por debajo de `md`,
 *    la `<table>` por encima. El consumidor decide el contenido del card.
 *  - sin nuevas dependencias: hand-rolled sobre primitives ya existentes
 *    (lucide-react, shadcn Button). No se adoptó @tanstack/react-table.
 */

export interface DataTableColumn<TData> {
  id: string;
  header: React.ReactNode;
  /** Renderizado custom del cuerpo. Si se omite, usa `accessorKey`/`accessorFn`. */
  cell?: (row: TData, rowIndex: number) => React.ReactNode;
  /** Acceso tipado a un campo del row (soporta paths con puntos). */
  accessorKey?: keyof TData | string;
  /** Acceso custom (alternativa a accessorKey, especialmente para sort). */
  accessorFn?: (row: TData) => unknown;
  /** Permite que esta columna participe en ordenamiento. */
  sortable?: boolean;
  /** Valor explícito para sort; si falta usa accessorFn/accessorKey. */
  sortValue?: (row: TData) => string | number | Date | null | undefined;
  align?: "left" | "center" | "right";
  width?: string;
  className?: string;
  thClassName?: string;
  /** Renderiza el header como nodo (útil para checkboxes de selección). */
  renderHeader?: () => React.ReactNode;
}

export interface DataTableSortState {
  column: string;
  direction: "asc" | "desc";
}

export interface DataTablePaginationState {
  page: number;
  pageSize: number;
}

export interface DataTableSelection<TData> {
  /** Keys seleccionadas (output de getKey). */
  selected: Set<string>;
  /** Identifica una fila para selección. */
  getKey: (row: TData) => string;
  /** Toggle de una fila individual. */
  onToggle: (key: string) => void;
  /** Toggle masivo de la página actual. */
  onToggleAll: () => void;
  /** true si todas las filas visibles están seleccionadas (controlado). */
  allSelected: boolean;
  /** true si al menos una (pero no todas) está seleccionada. */
  someSelected: boolean;
  /** Etiqueta accesible para el checkbox por fila. */
  rowLabel: (row: TData) => string;
}

export interface DataTableErrorState {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

interface DataTableProps<TData = Record<string, unknown>> {
  data: TData[];
  columns: DataTableColumn<TData>[];

  /** Key estable por fila. Si se omite, se usa el índice (no recomendado). */
  getRowKey?: (row: TData, index: number) => string;

  /** Estado de carga. */
  loading?: boolean;

  /**
   * Estado de error. Cuando está presente y `loading` es false,
   * la tabla NO renderiza filas — muestra un panel de error con
   * icono, mensaje y CTA de reintento. Nunca se confunde con empty.
   */
  error?: DataTableErrorState | null;

  /** Cuando true + data vacía, se muestra `filteredEmptyState` en vez de `emptyState`. */
  isFiltered?: boolean;

  /** Custom empty state (sin datos, sin filtros). */
  emptyState?: React.ReactNode;
  /** Custom empty state cuando hay filtros activos y no hay resultados. */
  filteredEmptyState?: React.ReactNode;

  /**
   * Mensaje simple cuando no se pasa emptyState/filteredEmptyState.
   * @deprecated Prefiere `emptyState` / `filteredEmptyState`.
   */
  emptyMessage?: string;

  /** Configuración de selección (opt-in). Renderiza columna de checkboxes. */
  selection?: DataTableSelection<TData>;

  /** Paginación controlada. Si se omite, no se muestra footer. */
  pagination?: DataTablePaginationState;
  onPaginationChange?: (pagination: DataTablePaginationState) => void;
  pageCount?: number;
  totalCount?: number;
  /** Etiqueta del recurso, ej. "atletas". Se usa en "Mostrando X-Y de N atletas". */
  itemLabel?: string;

  /**
   * Estado controlado de sort. Si se omite, el componente usa estado interno
   * y solo aplica sort si `sortable` no está forzado a false.
   */
  sort?: DataTableSortState;
  onSortChange?: (column: string) => void;
  /** Si es false, desactiva sort (incluso si las columnas lo permiten). */
  sortable?: boolean;

  /** Click en fila (también Enter/Space). */
  onRowClick?: (row: TData) => void;
  /**
   * Si la fila debe ser un link. Se renderiza como Link en la primera celda
   * (no se anida <a> dentro de <tr>).
   */
  rowHref?: (row: TData) => string | undefined;
  /** ClassName custom por fila. */
  rowClassName?: (row: TData) => string | undefined;

  /**
   * Slot opcional para cards móviles. Se muestra por debajo de `md`,
   * en lugar de la `<table>`. El consumidor decide el contenido.
   */
  mobileCard?: (row: TData, index: number) => React.ReactNode;

  /** Etiqueta accesible de la tabla (recomendado). */
  ariaLabel?: string;
  className?: string;
}

const getNestedValue = (obj: unknown, path: string): unknown => {
  const keys = path.split(".");
  let value: unknown = obj;
  for (const key of keys) {
    if (value && typeof value === "object" && key in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return value;
};

const getSortValue = <TData,>(
  row: TData,
  column: DataTableColumn<TData>
): unknown => {
  if (column.sortValue) return column.sortValue(row);
  if (column.accessorFn) return column.accessorFn(row);
  if (column.accessorKey) return getNestedValue(row, column.accessorKey as string);
  return undefined;
};

const compareValues = (a: unknown, b: unknown): number => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};

interface DataTableComponentProps<TData = Record<string, unknown>>
  extends DataTableProps<TData> {
  forwardedRef?: React.ForwardedRef<HTMLDivElement>;
}

function DataTableComponent<TData = Record<string, unknown>>(
  props: DataTableComponentProps<TData>
) {
  const {
    data,
    columns,
    getRowKey,
    loading,
    error,
    isFiltered,
    emptyState,
    filteredEmptyState,
    emptyMessage = "No hay datos disponibles",
    selection,
    pagination,
    onPaginationChange,
    pageCount = 1,
    totalCount,
    itemLabel = "resultados",
    sort,
    onSortChange,
    sortable = true,
    onRowClick,
    rowHref,
    rowClassName,
    mobileCard,
    ariaLabel,
    className,
    forwardedRef,
  } = props;

  const [internalSort, setInternalSort] = React.useState<DataTableSortState>({
    column: "",
    direction: "asc",
  });
  const sortState = sort ?? internalSort;
  const isControlledSort = sort !== undefined;

  const handleSort = React.useCallback(
    (columnId: string) => {
      if (!sortable) return;
      const next: DataTableSortState =
        sortState.column === columnId && sortState.direction === "asc"
          ? { column: columnId, direction: "desc" }
          : { column: columnId, direction: "asc" };

      if (isControlledSort) {
        onSortChange?.(columnId);
      } else {
        setInternalSort(next);
      }
    },
    [sortable, sortState, isControlledSort, onSortChange]
  );

  const sortedData = React.useMemo(() => {
    if (!sortState.column || !sortable) return data;
    const column = columns.find((c) => c.id === sortState.column);
    if (!column) return data;

    const direction = sortState.direction;
    return [...data].sort((a, b) => {
      const aValue = getSortValue(a, column);
      const bValue = getSortValue(b, column);
      const cmp = compareValues(aValue, bValue);
      return direction === "asc" ? cmp : -cmp;
    });
  }, [data, sortState, sortable, columns]);

  const currentPage = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 10;
  const totalPages = Math.max(
    1,
    pageCount || Math.ceil((totalCount ?? sortedData.length) / pageSize)
  );

  const paginatedData = React.useMemo(() => {
    if (!pagination) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pagination, currentPage, pageSize]);

  const goToPage = (page: number) => {
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    onPaginationChange?.({ page: clampedPage, pageSize });
  };

  const renderCell = (
    row: TData,
    column: DataTableColumn<TData>,
    rowIndex: number
  ): React.ReactNode => {
    if (column.cell) return column.cell(row, rowIndex);
    if (column.accessorFn) return column.accessorFn(row) as React.ReactNode;
    if (column.accessorKey) {
      const value = getNestedValue(row, column.accessorKey as string);
      return value != null ? String(value) : null;
    }
    return null;
  };

  const totalColumnCount = columns.length + (selection ? 1 : 0);
  const showPagination =
    pagination !== undefined && !loading && !error && paginatedData.length > 0;

  const resolvedEmpty = isFiltered
    ? filteredEmptyState ?? <DefaultEmpty message={emptyMessage} />
    : emptyState ?? <DefaultEmpty message={emptyMessage} />;

  const rowKeyOf = React.useCallback(
    (row: TData, index: number) =>
      getRowKey ? getRowKey(row, index) : `__row_${index}`,
    [getRowKey]
  );

  const renderRowCells = (
    row: TData,
    rowIndex: number,
    isSelected: boolean
  ): React.ReactNode => (
    <>
      {selection && (
        <td className="w-10 px-3 py-3 align-middle">
          <label className="flex cursor-pointer items-center justify-center">
            <span className="sr-only">
              {isSelected
                ? `Deseleccionar ${selection.rowLabel(row)}`
                : `Seleccionar ${selection.rowLabel(row)}`}
            </span>
            <input
              type="checkbox"
              aria-label={
                isSelected
                  ? `Deseleccionar ${selection.rowLabel(row)}`
                  : `Seleccionar ${selection.rowLabel(row)}`
              }
              checked={isSelected}
              onChange={(event) => {
                event.stopPropagation();
                selection.onToggle(selection.getKey(row));
              }}
              onClick={(event) => event.stopPropagation()}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-zaltyko-teal focus:ring-zaltyko-teal"
            />
          </label>
        </td>
      )}
      {columns.map((column) => {
        const alignClass =
          column.align === "right"
            ? "text-right"
            : column.align === "center"
            ? "text-center"
            : "text-left";
        return (
          <td
            key={column.id}
            className={cn("p-4 align-middle", alignClass, column.className)}
          >
            {renderCell(row, column, rowIndex)}
          </td>
        );
      })}
    </>
  );

  return (
    <div
      ref={forwardedRef}
      className={cn("space-y-4", className)}
      data-testid="data-table"
    >
      {mobileCard && paginatedData.length > 0 && !loading && !error && (
        <div className="space-y-3 md:hidden" aria-label={ariaLabel}>
          {paginatedData.map((row, rowIndex) => (
            <React.Fragment key={rowKeyOf(row, rowIndex)}>
              {mobileCard(row, rowIndex)}
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="hidden overflow-x-auto md:block">
        <table
          aria-label={ariaLabel}
          aria-busy={loading || undefined}
          className="w-full caption-bottom text-sm"
        >
          {ariaLabel && <caption className="sr-only">{ariaLabel}</caption>}
          <thead className="border-b bg-muted/50">
            <tr>
              {selection && (
                <th
                  scope="col"
                  className="h-12 w-10 px-3 text-left align-middle font-medium text-muted-foreground"
                >
                  <label className="flex cursor-pointer items-center justify-center">
                    <span className="sr-only">
                      {selection.allSelected
                        ? "Deseleccionar todos los visibles"
                        : "Seleccionar todos los visibles"}
                    </span>
                    <input
                      type="checkbox"
                      aria-label={
                        selection.allSelected
                          ? "Deseleccionar todos los visibles"
                          : "Seleccionar todos los visibles"
                      }
                      checked={selection.allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selection.someSelected && !selection.allSelected;
                      }}
                      onChange={selection.onToggleAll}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-zaltyko-teal focus:ring-zaltyko-teal"
                    />
                  </label>
                </th>
              )}
              {columns.map((column) => {
                const alignClass =
                  column.align === "right"
                    ? "text-right"
                    : column.align === "center"
                    ? "text-center"
                    : "text-left";
                return (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn(
                      "h-12 px-4 align-middle font-medium text-muted-foreground",
                      alignClass,
                      column.sortable && sortable && "cursor-pointer select-none hover:bg-muted/80",
                      column.thClassName
                    )}
                    style={column.width ? { width: column.width } : undefined}
                    onClick={() => column.sortable && handleSort(column.id)}
                    aria-sort={
                      sortState.column === column.id
                        ? sortState.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {column.renderHeader ? (
                      column.renderHeader()
                    ) : (
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          column.align === "right" && "ml-auto justify-end",
                          column.align === "center" && "justify-center"
                        )}
                      >
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
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {loading ? (
              <tr>
                <td colSpan={totalColumnCount} className="h-32 text-center">
                  <div
                    className="flex items-center justify-center gap-2 text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="sr-only">Cargando</span>
                    <RefreshCw className="h-5 w-5 animate-spin" aria-hidden />
                    <span aria-hidden>Cargando...</span>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={totalColumnCount} className="h-32 p-0">
                  <div
                    role="alert"
                    className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
                  >
                    <div className="rounded-full bg-red-50 p-3">
                      <AlertCircle className="h-6 w-6 text-red-500" aria-hidden />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {error.title ?? "No pudimos cargar los datos"}
                    </p>
                    {error.message && (
                      <p className="max-w-sm text-sm text-muted-foreground">
                        {error.message}
                      </p>
                    )}
                    {error.onRetry && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={error.onRetry}
                        className="mt-2"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                        {error.retryLabel ?? "Reintentar"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={totalColumnCount} className="h-32 p-0">
                  <div
                    className="flex h-full items-center justify-center p-6"
                    role={resolvedEmpty && React.isValidElement(resolvedEmpty) ? undefined : "status"}
                  >
                    {resolvedEmpty}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => {
                const key = rowKeyOf(row, rowIndex);
                const href = rowHref?.(row);
                const isSelected =
                  selection?.selected.has(selection.getKey(row)) ?? false;
                const customClassName = rowClassName?.(row);

                if (href) {
                  return (
                    <tr
                      key={key}
                      data-row-key={key}
                      className={cn(
                        "border-b transition-colors hover:bg-muted/50",
                        isSelected && "bg-zaltyko-teal/[0.04]",
                        customClassName
                      )}
                    >
                      {columns.map((column, colIndex) => {
                        const alignClass =
                          column.align === "right"
                            ? "text-right"
                            : column.align === "center"
                            ? "text-center"
                            : "text-left";
                        // Solo la primera celda envuelve en Link para evitar
                        // múltiples <a> por fila y respetar semántica de tabla.
                        const isFirst = colIndex === 0 && !selection;
                        return (
                          <td
                            key={column.id}
                            className={cn(
                              "p-4 align-middle",
                              alignClass,
                              column.className
                            )}
                          >
                            {isFirst ? (
                              <Link
                                href={href}
                                className="-m-4 block p-4 font-medium text-zaltyko-teal hover:underline"
                              >
                                {renderCell(row, column, rowIndex)}
                              </Link>
                            ) : (
                              renderCell(row, column, rowIndex)
                            )}
                          </td>
                        );
                      })}
                      {selection && (
                        <td className="w-10 px-3 py-3 align-middle">
                          <label className="flex cursor-pointer items-center justify-center">
                            <span className="sr-only">
                              {isSelected
                                ? `Deseleccionar ${selection.rowLabel(row)}`
                                : `Seleccionar ${selection.rowLabel(row)}`}
                            </span>
                            <input
                              type="checkbox"
                              aria-label={
                                isSelected
                                  ? `Deseleccionar ${selection.rowLabel(row)}`
                                  : `Seleccionar ${selection.rowLabel(row)}`
                              }
                              checked={isSelected}
                              onChange={() => selection.onToggle(selection.getKey(row))}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-zaltyko-teal focus:ring-zaltyko-teal"
                            />
                          </label>
                        </td>
                      )}
                    </tr>
                  );
                }

                const interactive = Boolean(onRowClick);
                return (
                  <tr
                    key={key}
                    data-row-key={key}
                    className={cn(
                      "border-b transition-colors",
                      interactive && "cursor-pointer hover:bg-muted/50",
                      isSelected && "bg-zaltyko-teal/[0.04]",
                      customClassName
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={(event) => {
                      if (!onRowClick) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }}
                    role={onRowClick ? "button" : undefined}
                  >
                    {renderRowCells(row, rowIndex, isSelected)}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="flex flex-col items-center justify-between gap-4 px-2 sm:flex-row">
          <div className="text-sm text-muted-foreground">
            {totalCount !== undefined && (
              <>
                Mostrando {(currentPage - 1) * pageSize + 1} a{" "}
                {Math.min(currentPage * pageSize, totalCount)} de {totalCount}{" "}
                {itemLabel}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              aria-label="Primera página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(totalPages)}
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

function DefaultEmpty({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
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

// Re-exports para compatibilidad con consumidores existentes.
export type Column<TData> = DataTableColumn<TData>;
export type SortState = DataTableSortState;
export type PaginationState = DataTablePaginationState;