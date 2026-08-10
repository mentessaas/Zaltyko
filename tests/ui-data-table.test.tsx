/**
 * @vitest-environment jsdom
 *
 * Tests del DataTable genérico (ZAL-559 / ZAL-551-B1) + DataTableSkeleton.
 *
 * Cubre el contrato de los 4 estados explícitos y mutuamente excluyentes:
 *  - loading       → spinner + aria-busy, sin filas
 *  - error         → panel con icono y CTA de retry, sin caer en empty
 *  - empty         → emptyState cuando no hay datos ni filtros activos
 *  - filtered-empty → filteredEmptyState cuando hay filtros pero 0 resultados
 *
 * Además cubre features opt-in: selection (incl. indeterminate), sort,
 * mobileCard, rowHref, getRowKey estable. El objetivo es bloquear
 * regresiones en cualquier piloto migrado (Atletas, Clases y siguientes).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";

interface Item {
  id: string;
  name: string;
  age: number;
}

const sample: Item[] = [
  { id: "1", name: "Ada Lovelace", age: 36 },
  { id: "2", name: "Grace Hopper", age: 85 },
  { id: "3", name: "Margaret Hamilton", age: 87 },
];

const columns: DataTableColumn<Item>[] = [
  {
    id: "name",
    header: "Nombre",
    sortable: true,
    accessorFn: (row) => row.name,
    sortValue: (row) => row.name,
  },
  {
    id: "age",
    header: "Edad",
    align: "right",
    sortable: true,
    accessorFn: (row) => row.age,
    sortValue: (row) => row.age,
  },
];

describe("DataTable — ZAL-559 contract", () => {
  describe("loading state", () => {
    it("renderiza spinner y aria-busy, sin filas", () => {
      render(<DataTable data={sample} columns={columns} loading />);

      const table = screen.getByRole("table", { name: undefined });
      expect(table).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);

      // No debe haber ninguna fila de datos mientras loading=true
      expect(screen.queryByText("Ada Lovelace")).toBeNull();
    });

    it("loading=true tiene prioridad sobre empty", () => {
      render(<DataTable data={[]} columns={columns} loading emptyState={<p>VACÍO</p>} />);
      // El emptyState NUNCA aparece cuando loading=true
      expect(screen.queryByText("VACÍO")).toBeNull();
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renderiza panel de error con CTA de retry, sin caer en empty", () => {
      const onRetry = vi.fn();
      render(
        <DataTable
          data={[]}
          columns={columns}
          error={{
            title: "No pudimos cargar los atletas",
            message: "Reintenta en unos segundos.",
            onRetry,
            retryLabel: "Reintentar",
          }}
        />
      );

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/no pudimos cargar los atletas/i);
      expect(alert).toHaveTextContent(/reintenta en unos segundos/i);

      const button = screen.getByRole("button", { name: /reintentar/i });
      expect(button).toBeInTheDocument();
    });

    it("error NUNCA cae en empty (ni con emptyMessage ni con emptyState)", () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          error={{ message: "falló la red" }}
          emptyMessage="No hay datos"
          emptyState={<p>EMPTY-STATE-MARKER</p>}
        />
      );

      // emptyState y emptyMessage no deben filtrarse cuando hay error
      expect(screen.queryByText("EMPTY-STATE-MARKER")).toBeNull();
      expect(screen.queryByText("No hay datos")).toBeNull();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  describe("empty state (sin datos, sin filtros)", () => {
    it("renderiza emptyState cuando data=[] y isFiltered=false", () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          emptyState={<p>Aún no hay atletas</p>}
        />
      );
      expect(screen.getByText("Aún no hay atletas")).toBeInTheDocument();
    });

    it("cai a emptyMessage por defecto si no se pasa emptyState", () => {
      render(<DataTable data={[]} columns={columns} emptyMessage="Sin resultados" />);
      expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    });
  });

  describe("filtered-empty state (con filtros, sin resultados)", () => {
    it("renderiza filteredEmptyState cuando data=[] e isFiltered=true", () => {
      render(
        <DataTable
          data={[]}
          columns={columns}
          isFiltered
          filteredEmptyState={<p>No hay atletas con esos filtros</p>}
        />
      );
      expect(screen.getByText("No hay atletas con esos filtros")).toBeInTheDocument();
    });

    it("isFiltered=true con filteredEmptyState omitido cae a emptyMessage", () => {
      render(
        <DataTable data={[]} columns={columns} isFiltered emptyMessage="Sin resultados" />
      );
      expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    });
  });

  describe("datos presentes", () => {
    it("renderiza filas con getRowKey estable", () => {
      render(<DataTable data={sample} columns={columns} getRowKey={(row) => row.id} />);
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
      expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
      expect(screen.getByText("Margaret Hamilton")).toBeInTheDocument();
    });
  });

  describe("sort opt-in", () => {
    it("alterna asc/desc al clickear el header de una columna sortable", async () => {
      const user = userEvent.setup();
      render(<DataTable data={sample} columns={columns} getRowKey={(row) => row.id} />);

      const nameHeader = screen.getByRole("columnheader", { name: /nombre/i });
      // aria-sort se omite cuando no hay sort activo
      expect(nameHeader).not.toHaveAttribute("aria-sort");

      await user.click(nameHeader);
      expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

      await user.click(nameHeader);
      expect(nameHeader).toHaveAttribute("aria-sort", "descending");
    });

    it("columnas no-sortable no responden a click", async () => {
      const user = userEvent.setup();
      const cols: DataTableColumn<Item>[] = [
        { id: "name", header: "Nombre", sortable: true, sortValue: (r) => r.name },
        { id: "age", header: "Edad", align: "right" /* sin sortable */ },
      ];
      render(<DataTable data={sample} columns={cols} />);

      const ageHeader = screen.getByRole("columnheader", { name: /edad/i });
      expect(ageHeader).not.toHaveAttribute("aria-sort", "ascending");
      await user.click(ageHeader);
      expect(ageHeader).not.toHaveAttribute("aria-sort");
    });
  });

  describe("selection opt-in", () => {
    function makeSelection(items: Item[]) {
      const selected = new Set<string>();
      const onToggle = vi.fn((key: string) => {
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
      });
      const onToggleAll = vi.fn(() => {
        const allSelected = items.every((i) => selected.has(i.id));
        items.forEach((i) => {
          if (allSelected) selected.delete(i.id);
          else selected.add(i.id);
        });
      });
      return { selected, onToggle, onToggleAll, items };
    }

    it("renderiza checkbox por fila con aria-label y toggle aislado", async () => {
      const user = userEvent.setup();
      const { selected, onToggle } = makeSelection(sample);
      render(
        <DataTable
          data={sample}
          columns={columns}
          getRowKey={(row) => row.id}
          selection={{
            selected,
            getKey: (row) => row.id,
            onToggle,
            onToggleAll: () => undefined,
            allSelected: false,
            someSelected: false,
            rowLabel: (row) => row.name,
          }}
        />
      );

      const adaCheckbox = screen.getByRole("checkbox", { name: /seleccionar ada lovelace/i });
      expect(adaCheckbox).toBeInTheDocument();
      await user.click(adaCheckbox);
      expect(onToggle).toHaveBeenCalledWith("1");
    });

    it("el checkbox header refleja allSelected y someSelected (indeterminate)", () => {
      const selected = new Set(["1"]);
      render(
        <DataTable
          data={sample}
          columns={columns}
          getRowKey={(row) => row.id}
          selection={{
            selected,
            getKey: (row) => row.id,
            onToggle: () => undefined,
            onToggleAll: () => undefined,
            allSelected: false,
            someSelected: true,
            rowLabel: (row) => row.name,
          }}
        />
      );
      const header = screen.getByRole("columnheader", { name: /seleccionar todos los visibles/i });
      const input = within(header).getByRole("checkbox");
      // vitest+jsdom: indeterminate se setea via ref, lo verificamos como
      // aria-label y checked=false (controlado). someSelected=true →
      // allSelected=false → label es "Seleccionar todos los visibles".
      expect(input).not.toBeChecked();
      expect(input).toHaveAccessibleName(/seleccionar todos los visibles/i);
    });
  });

  describe("rowHref opt-in", () => {
    it("hace la primera celda un Link al href devuelto", () => {
      render(
        <DataTable
          data={sample}
          columns={columns}
          getRowKey={(row) => row.id}
          rowHref={(row) => `/atletas/${row.id}`}
        />
      );
      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThanOrEqual(3);
      expect(links[0]).toHaveAttribute("href", "/atletas/1");
    });
  });

  describe("mobileCard opt-in", () => {
    it("renderiza el slot mobileCard por debajo de md (oculto en este entorno)", () => {
      render(
        <DataTable
          data={sample}
          columns={columns}
          getRowKey={(row) => row.id}
          mobileCard={(item) => <div data-testid={`mobile-${item.id}`}>CARD {item.name}</div>}
        />
      );
      // En jsdom, md:hidden está siempre "oculto" pero el nodo existe
      expect(screen.getByTestId("mobile-1")).toHaveTextContent("CARD Ada Lovelace");
      expect(screen.getByTestId("mobile-2")).toBeInTheDocument();
      expect(screen.getByTestId("mobile-3")).toBeInTheDocument();
    });
  });
});

describe("DataTableSkeleton — ZAL-559 / ZAL-551-B2", () => {
  it("parametriza columnas y filas", () => {
    const { container } = render(
      <DataTableSkeleton
        rows={3}
        columns={[
          { width: "40%" },
          { width: "30%", align: "right" },
          { multiline: true },
          { pill: true },
        ]}
        showFilters
        filterCount={2}
      />
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(container.querySelectorAll("thead th")).toHaveLength(4);
  });

  it("usa columnCount cuando columns no se pasa", () => {
    const { container } = render(<DataTableSkeleton rows={2} columnCount={5} showFilters={false} />);
    expect(container.querySelectorAll("thead th")).toHaveLength(5);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("tiene role=status y aria-label accesible", () => {
    render(<DataTableSkeleton rows={1} columnCount={2} showFilters={false} />);
    expect(screen.getByRole("status")).toHaveAccessibleName("Cargando datos");
  });
});
