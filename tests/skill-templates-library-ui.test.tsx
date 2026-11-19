// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillTemplatesManager } from "@/components/skill-levels/SkillTemplatesManager";
import type { CatalogSearchResult } from "@/modules/element-library/domain/library-requests";
import type {
  SkillTemplatesListView,
  SkillTemplateView,
  TemplateElementView,
} from "@/modules/skill-levels/domain/skill-levels";

/**
 * Plantillas de niveles con la biblioteca de elementos (ADR-0029 §3.1 y §3.6):
 * «Añadir desde la biblioteca» solo si la API lo indica, el selector añade un
 * elemento con su nombre corto y el enlace, los avisos de los enlaces
 * retirados o de una edición anterior, y el PUT solo lleva `catalogElementId`
 * cuando el enlace cambia.
 */

const ORG = "00000000-0000-4000-8000-000000000001";
const SITE = "00000000-0000-4000-8000-000000000002";
const TEMPLATE = "00000000-0000-4000-8000-000000000003";
const LEVEL = "00000000-0000-4000-8000-000000000004";
const E_WITHDRAWN = "00000000-0000-4000-8000-000000000005";
const E_PREVIOUS = "00000000-0000-4000-8000-000000000006";
const E_PLAIN = "00000000-0000-4000-8000-000000000007";
const CAT_WITHDRAWN = "00000000-0000-4000-8000-0000000000a1";
const CAT_PREVIOUS = "00000000-0000-4000-8000-0000000000a2";
const CAT_REPLACEMENT = "00000000-0000-4000-8000-0000000000a3";
const CAT_VAULT = "00000000-0000-4000-8000-0000000000a4";
const CAT_SHORT = "00000000-0000-4000-8000-0000000000a5";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const elements: TemplateElementView[] = [
  {
    id: E_WITHDRAWN,
    name: "Rondada de la academia",
    apparatus: "vault",
    description: null,
    required: true,
    catalogLink: { id: CAT_WITHDRAWN, name: "Rondada", status: "withdrawn", replacementId: null, apparatusMismatch: false },
  },
  {
    id: E_PREVIOUS,
    name: "Paloma de la academia",
    apparatus: "vault",
    description: null,
    required: true,
    catalogLink: {
      id: CAT_PREVIOUS,
      name: "Paloma",
      status: "previous_edition",
      replacementId: CAT_REPLACEMENT,
      apparatusMismatch: true,
    },
  },
  { id: E_PLAIN, name: "Carrera y batida", apparatus: "vault", description: null, required: false },
];

function templateView(libraryAvailable: boolean): SkillTemplateView {
  return {
    id: TEMPLATE,
    name: "GAF · Salto",
    discipline: "artistic_female",
    description: null,
    source: "blank",
    starterKey: null,
    archived: false,
    revision: 4,
    levelCount: 1,
    elementCount: elements.length,
    updatedAt: "2026-11-19T10:00:00.000Z",
    levels: [{ id: LEVEL, position: 1, name: "Nivel 1", description: null, elements }],
    canEdit: true,
    libraryAvailable,
  };
}

const list: SkillTemplatesListView = {
  templates: [
    {
      id: TEMPLATE,
      name: "GAF · Salto",
      discipline: "artistic_female",
      description: null,
      source: "blank",
      starterKey: null,
      archived: false,
      revision: 4,
      levelCount: 1,
      elementCount: elements.length,
      updatedAt: "2026-11-19T10:00:00.000Z",
    },
  ],
  starters: [],
  canManage: true,
  readOnly: false,
};

const search: CatalogSearchResult = {
  edition: {
    id: "00000000-0000-4000-8000-0000000000e1",
    code: "fig-wag-2025-2028",
    discipline: "artistic_female",
    title: "Código de prueba",
    cycleStart: 2025,
    cycleEnd: 2028,
    coverDate: "2026-10-14",
    documentUrl: "https://www.gymnastics.sport/",
    attribution: "Pie de atribución de prueba.",
  },
  elements: [
    {
      id: CAT_VAULT,
      elementKey: "ci_vault",
      apparatus: "vault",
      group: "1",
      valueLetter: null,
      valuePoints: 2.4,
      figReference: null,
      name: "Rondada con medio giro",
      shortName: "Rondada ½",
      hasNote: false,
    },
  ],
  truncated: false,
};

const shortOnly: CatalogSearchResult = {
  ...search,
  elements: [{ ...search.elements[0]!, id: CAT_SHORT, shortName: "Y", name: "Yurchenko de prueba" }],
};

const fetchMock = vi.fn<typeof fetch>();
let uuid = 0;

beforeEach(() => {
  fetchMock.mockReset();
  uuid = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", {
    randomUUID: () => `10000000-0000-4000-8000-${(++uuid).toString(16).padStart(12, "0")}`,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function routeFetch(libraryAvailable: boolean, result: CatalogSearchResult = search) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "PUT") return json(200, { data: { id: TEMPLATE, revision: 5, replayed: false } });
    if (url.startsWith("/api/v1/owner/element-library?")) return json(200, { data: result });
    if (url.startsWith(`/api/v1/owner/skill-templates/${TEMPLATE}?`)) return json(200, { data: templateView(libraryAvailable) });
    if (url.startsWith("/api/v1/owner/skill-templates?")) return json(200, { data: list });
    return json(404, { detail: "No encontrado" });
  });
}

async function openEditor() {
  render(<SkillTemplatesManager organizationId={ORG} locationId={SITE} />);
  fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  await screen.findByRole("heading", { name: "Editar plantilla" });
}

function putBody() {
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  expect(put).toBeDefined();
  return JSON.parse(String(put![1]!.body)) as {
    levels: Array<{ elements: Array<Record<string, unknown>> }>;
  };
}

describe("plantillas de niveles con la biblioteca", () => {
  it("el selector añade un elemento con su nombre corto y el enlace, y solo ese lleva catalogElementId", async () => {
    routeFetch(true);
    await openEditor();

    fireEvent.click(screen.getByRole("button", { name: "Añadir desde la biblioteca" }));
    const dialog = await screen.findByRole("dialog", { name: "Añadir desde la biblioteca" });
    // Filtrado por la disciplina de la plantilla y el aparato que comparte el nivel.
    await waitFor(() => {
      const searchCall = fetchMock.mock.calls.find(([input]) => String(input).startsWith("/api/v1/owner/element-library?"));
      expect(searchCall).toBeDefined();
      const params = new URL(String(searchCall![0]), "http://localhost").searchParams;
      expect(params.get("organizationId")).toBe(ORG);
      expect(params.get("locationId")).toBe(SITE);
      expect(params.get("discipline")).toBe("artistic_female");
      expect(params.get("apparatus")).toBe("vault");
    });
    expect(await within(dialog).findByText("Pie de atribución de prueba.")).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole("button", { name: /Rondada ½/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const names = screen.getAllByLabelText("Elemento") as HTMLInputElement[];
    expect(names.map((input) => input.value)).toEqual([
      "Rondada de la academia",
      "Paloma de la academia",
      "Carrera y batida",
      "Rondada ½",
    ]);
    // El nombre sigue siendo de la academia: se puede cambiar.
    fireEvent.change(names[3]!, { target: { value: "Rondada con medio giro (base)" } });
    expect(screen.getAllByText("De la biblioteca")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const sent = putBody().levels[0]!.elements;
    expect(sent).toHaveLength(4);
    expect(sent[3]).toEqual({
      id: null,
      name: "Rondada con medio giro (base)",
      apparatus: "vault",
      description: null,
      required: true,
      catalogElementId: CAT_VAULT,
    });
    // Los que no cambian de enlace no lo mandan: el servidor conserva el guardado.
    for (const element of sent.slice(0, 3)) expect(element).not.toHaveProperty("catalogElementId");
  });

  it("si el nombre corto tiene menos de 2 caracteres, el elemento se añade con el nombre completo", async () => {
    routeFetch(true, shortOnly);
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Añadir desde la biblioteca" }));
    const dialog = await screen.findByRole("dialog", { name: "Añadir desde la biblioteca" });
    expect(await within(dialog).findByText("1 elemento")).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole("button", { name: /Yurchenko de prueba/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const names = screen.getAllByLabelText("Elemento") as HTMLInputElement[];
    expect(names.at(-1)!.value).toBe("Yurchenko de prueba");
  });

  it("avisa de los enlaces retirados o de una edición anterior y solo actualiza el enlace si se pide", async () => {
    routeFetch(true);
    await openEditor();

    expect(screen.getByText("Ya no está en la biblioteca")).toBeTruthy();
    expect(screen.getByText("Edición anterior")).toBeTruthy();
    // Aviso de aparato distinto (p. ej., cambiado con la biblioteca apagada).
    expect(screen.getAllByText("El aparato no coincide con el de la biblioteca")).toHaveLength(1);
    // «Actualizar enlace» solo aparece con un elemento de la edición nueva, con nombre propio.
    const update = screen.getAllByRole("button", { name: /^Actualizar enlace/ });
    expect(update).toHaveLength(1);
    expect(update[0]!.getAttribute("aria-label")).toBe("Actualizar enlace de Paloma de la academia");
    expect(screen.getByRole("button", { name: "Quitar enlace de Rondada de la academia" })).toBeTruthy();
    fireEvent.click(update[0]!);
    expect(screen.queryByText("Edición anterior")).toBeNull();
    expect(screen.queryByText("El aparato no coincide con el de la biblioteca")).toBeNull();
    expect(screen.getByText("De la biblioteca")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const sent = putBody().levels[0]!.elements;
    expect(sent[0]).not.toHaveProperty("catalogElementId");
    expect(sent[1]).toMatchObject({ id: E_PREVIOUS, catalogElementId: CAT_REPLACEMENT });
    expect(sent[2]).not.toHaveProperty("catalogElementId");
  });

  it("sin la biblioteca no ofrece añadir ni actualizar, pero sigue mostrando el aviso del enlace", async () => {
    routeFetch(false);
    await openEditor();

    expect(screen.getByRole("button", { name: "Añadir elemento" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Añadir desde la biblioteca" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Actualizar enlace/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Quitar enlace/ })).toBeNull();
    expect(screen.getByText("Ya no está en la biblioteca")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/element-library"))).toBe(false);
  });
});
