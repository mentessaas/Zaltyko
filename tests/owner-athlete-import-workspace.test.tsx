// @vitest-environment jsdom
/**
 * O4 · Pantalla de importación: vista previa, mapeo editable, confirmación con
 * la misma clave tras un fallo de red y solo lectura. Datos sintéticos.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OwnerAthleteImportWorkspace,
  type AthleteImportPreviewResponse,
} from "@/components/owner-dashboard/OwnerAthleteImportWorkspace";

const organizationId = "10000000-0000-4000-8000-000000000111";

function preview(overrides: Partial<AthleteImportPreviewResponse> = {}): AthleteImportPreviewResponse {
  return {
    format: "csv",
    headers: ["Nombre", "Apellidos", "Fecha de nacimiento", "Grupo"],
    mapping: {
      givenName: 0,
      familyName: 1,
      dateOfBirth: 2,
      group: 3,
      guardianGivenName: null,
      guardianFamilyName: null,
      guardianEmail: null,
      guardianPhone: null,
      guardianRelationship: null,
    },
    mappingProblems: [],
    hiddenRows: [],
    rows: [
      {
        row: 2,
        status: "create",
        issues: [],
        values: {
          givenName: "Lucía",
          familyName: "Prueba",
          dateOfBirth: "2016-03-15",
          group: "Iniciación",
          guardianName: null,
          guardianEmail: null,
          guardianPhone: null,
        },
      },
      {
        row: 3,
        status: "create",
        issues: [{ severity: "warning", field: null, code: "SIBLING", message: "Comparte tutor con la fila 2: irán a la misma familia." }],
        values: {
          givenName: "Ana",
          familyName: "Prueba",
          dateOfBirth: "2018-05-20",
          group: null,
          guardianName: null,
          guardianEmail: null,
          guardianPhone: null,
        },
      },
      {
        row: 4,
        status: "duplicate",
        issues: [
          {
            severity: "error",
            field: null,
            code: "DUPLICATE_EXISTING",
            message: "Ya existe en la academia una gimnasta con el mismo nombre y fecha de nacimiento.",
          },
        ],
        values: {
          givenName: "Bea",
          familyName: "Sintética",
          dateOfBirth: "2015-02-01",
          group: null,
          guardianName: null,
          guardianEmail: null,
          guardianPhone: null,
        },
      },
    ],
    summary: {
      total: 3,
      toCreate: 2,
      errors: 0,
      duplicates: 1,
      skipped: 0,
      withWarnings: 1,
      newFamilies: 1,
      newTutors: 0,
      groupMemberships: 1,
    },
    plan: { current: 10, limit: 30, readOnly: false },
    canConfirm: true,
    previewToken: "b".repeat(64),
    ...overrides,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

let requests: Array<{ url: string; headers: Record<string, string>; form: FormData }>;
let nextPreview: AthleteImportPreviewResponse;
let failConfirmOnce: boolean;

beforeEach(() => {
  requests = [];
  nextPreview = preview();
  failConfirmOnce = false;
  let uuid = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `10000000-0000-4000-8000-00000000090${(uuid += 1)}` });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({
        url,
        headers: (init?.headers ?? {}) as Record<string, string>,
        form: init?.body as FormData,
      });
      if (url.startsWith("/api/v1/owner/athlete-import/preview?")) return json({ data: nextPreview });
      if (url.startsWith("/api/v1/owner/athlete-import/confirm?")) {
        if (failConfirmOnce) {
          failConfirmOnce = false;
          throw new TypeError("Respuesta perdida de prueba");
        }
        return json(
          {
            data: {
              batchId: "20000000-0000-4000-8000-000000000001",
              created: [
                { row: 2, athleteId: "30000000-0000-4000-8000-000000000001" },
                { row: 3, athleteId: "30000000-0000-4000-8000-000000000002" },
              ],
              skipped: [{ row: 4, code: "DUPLICATE_EXISTING", message: "Ya existe en la academia una gimnasta con el mismo nombre y fecha de nacimiento." }],
              replayed: false,
            },
          },
          201
        );
      }
      throw new Error(`Petición inesperada ${url}`);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function loadPreview() {
  const user = userEvent.setup();
  render(<OwnerAthleteImportWorkspace organizationId={organizationId} organizationName="Club sintético" />);
  await user.upload(
    screen.getByLabelText("Fichero CSV o Excel (.xlsx)"),
    new File(["Nombre;Apellidos\n"], "gimnastas.csv", { type: "text/csv" })
  );
  await user.click(screen.getByRole("button", { name: "Ver vista previa" }));
  await screen.findByTestId("athlete-import-summary");
  return user;
}

describe("OwnerAthleteImportWorkspace", () => {
  it("muestra el resumen, el resultado por fila y los avisos antes de escribir nada", async () => {
    await loadPreview();

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`/api/v1/owner/athlete-import/preview?organizationId=${organizationId}`);
    expect(requests[0]!.form.get("mapping")).toBeNull();
    expect(screen.getByTestId("athlete-import-summary")).toHaveTextContent(
      "3 filas: se crearán 2 gimnastas, 1 familia, 0 tutores y 1 alta en grupo. 0 filas con errores, 1 duplicada y 0 que no se importan."
    );
    expect(screen.getByText("Tu plan admite 30 gimnastas y ya tienes 10.")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Se crea")).toHaveLength(2);
    expect(within(table).getByText("Duplicada")).toBeInTheDocument();
    expect(within(table).getByText(/Aviso: Comparte tutor con la fila 2/)).toBeInTheDocument();
    expect(within(table).getByText(/Error: Ya existe en la academia/)).toBeInTheDocument();
    // Nothing is imported until the legal declaration is ticked.
    expect(screen.getByRole("button", { name: "Importar 2 gimnastas" })).toBeDisabled();
    expect(screen.getByText("Marca la declaración para poder importar.")).toBeInTheDocument();
    expect(screen.getByText("Qué significa cada resultado")).toBeInTheDocument();
  });

  it("al cambiar una columna pide actualizar la vista previa y no deja importar hasta entonces", async () => {
    const user = await loadPreview();
    await user.click(screen.getByLabelText(/Declaro que tengo base legal/));

    await user.selectOptions(screen.getByLabelText("Grupo"), "");
    expect(screen.getByRole("button", { name: "Importar 2 gimnastas" })).toBeDisabled();
    expect(screen.getByText("Actualiza la vista previa antes de importar.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actualizar vista previa" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(JSON.parse(String(requests[1]!.form.get("mapping")))).toMatchObject({ givenName: 0, group: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Importar 2 gimnastas" })).toBeEnabled());
  });

  it("confirma con la misma clave si se pierde la respuesta y muestra lo creado y lo saltado", async () => {
    const user = await loadPreview();
    await user.click(screen.getByLabelText(/Declaro que tengo base legal/));
    failConfirmOnce = true;

    await user.click(screen.getByRole("button", { name: "Importar 2 gimnastas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no se duplicará nada");
    await user.click(screen.getByRole("button", { name: "Importar 2 gimnastas" }));
    await screen.findByText("Importación completada");

    const confirms = requests.filter((request) => request.url.includes("/confirm?"));
    expect(confirms).toHaveLength(2);
    expect(confirms[0]!.headers["Idempotency-Key"]).toMatch(/^owner-athlete-import:/u);
    expect(confirms[1]!.headers["Idempotency-Key"]).toBe(confirms[0]!.headers["Idempotency-Key"]);
    expect(confirms[0]!.form.get("previewToken")).toBe("b".repeat(64));
    expect(confirms[0]!.form.get("legalBasisConfirmed")).toBe("true");
    expect(confirms[0]!.url).toBe(`/api/v1/owner/athlete-import/confirm?organizationId=${organizationId}`);
    expect(JSON.parse(String(confirms[0]!.form.get("mapping")))).toMatchObject({ givenName: 0, dateOfBirth: 2 });
    expect(screen.getByText("Gimnastas creadas: 2. Filas no importadas: 1.")).toBeInTheDocument();
    expect(screen.getByText(/Fila 4: Ya existe en la academia/)).toBeInTheDocument();
  });

  it("en solo lectura avisa y no deja importar", async () => {
    nextPreview = preview({ plan: { current: 31, limit: 30, readOnly: true }, canConfirm: false });
    const user = await loadPreview();
    await user.click(screen.getByLabelText(/Declaro que tengo base legal/));

    expect(screen.getByText(/La academia está en solo lectura/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar 2 gimnastas" })).toBeDisabled();
  });

  it("avisa de las filas ocultas o filtradas que no se importan", async () => {
    nextPreview = preview({ hiddenRows: [7, 9] });
    await loadPreview();
    expect(screen.getByRole("note")).toHaveTextContent("Las filas ocultas o filtradas del Excel no se importan (2): 7, 9.");
  });

  it("explica las columnas que faltan y no muestra filas", async () => {
    nextPreview = preview({
      mappingProblems: ["Falta la columna obligatoria «Fecha de nacimiento»."],
      rows: [],
      canConfirm: false,
    });
    const user = userEvent.setup();
    render(<OwnerAthleteImportWorkspace organizationId={organizationId} organizationName="Club sintético" />);
    await user.upload(
      screen.getByLabelText("Fichero CSV o Excel (.xlsx)"),
      new File(["Nombre;Apellidos\n"], "gimnastas.csv", { type: "text/csv" })
    );
    await user.click(screen.getByRole("button", { name: "Ver vista previa" }));

    expect(await screen.findByText("Falta la columna obligatoria «Fecha de nacimiento».")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Importar/ })).not.toBeInTheDocument();
  });
});
