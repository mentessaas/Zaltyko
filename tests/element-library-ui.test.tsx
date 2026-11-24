// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ElementLibraryBrowser, type ElementLibraryGroupLabels } from "@/components/element-library/ElementLibraryBrowser";
import { formatCatalogValue, formatFigReference } from "@/components/element-library/format";
import { elementAttributionText } from "@/modules/element-library/domain/element-library";
import type {
  CatalogElementCard,
  CatalogElementSummary,
  CatalogSearchResult,
  EditionView,
} from "@/modules/element-library/domain/library-requests";

const ORG = "00000000-0000-4000-8000-000000000001";
const SITE = "00000000-0000-4000-8000-000000000002";
const EDITION = "00000000-0000-4000-8000-000000000003";
const VAULT = "00000000-0000-4000-8000-000000000004";
const BEAM = "00000000-0000-4000-8000-000000000005";
const DOC = "https://www.gymnastics.sport/publicdir/rules/files/en_1.1%20-%20WAG%20COP%202025-2028.pdf";
const TITLE = "Código de Puntuación de Gimnasia Artística Femenina 2025-2028";

const edition: EditionView = {
  id: EDITION,
  code: "fig-wag-2025-2028",
  discipline: "artistic_female",
  title: TITLE,
  cycleStart: 2025,
  cycleEnd: 2028,
  coverDate: "2026-10-14",
  documentUrl: DOC,
  attribution: elementAttributionText({ title: TITLE, coverDate: "2026-10-14", documentUrl: DOC }),
};

const vault: CatalogElementSummary = {
  id: VAULT,
  elementKey: "vt_yurchenko_tuck",
  apparatus: "vault",
  group: "4",
  valueLetter: null,
  valuePoints: 4.2,
  figReference: "3.12",
  name: "Yurchenko con mortal atrás agrupado",
  shortName: "Yurchenko agrupado",
  hasNote: false,
};

const beam: CatalogElementSummary = {
  id: BEAM,
  elementKey: "bb_salto_back_layout",
  apparatus: "beam",
  group: "3",
  valueLetter: "D",
  valuePoints: null,
  figReference: null,
  name: "Mortal atrás en plancha",
  shortName: "Mortal atrás plancha",
  hasNote: false,
};

const groupLabels: ElementLibraryGroupLabels = {
  "fig-wag-2025-2028": {
    vault: [
      { key: "1", label: "Sin mortal: paloma, Yamashita y rondada" },
      { key: "4", label: "Yurchenko: rondada y mortal atrás" },
    ],
  },
};

function card(summary: CatalogElementSummary, overrides: Partial<CatalogElementCard> = {}): CatalogElementCard {
  return {
    id: summary.id,
    elementKey: summary.elementKey,
    apparatus: summary.apparatus,
    group: summary.group,
    valueLetter: summary.valueLetter,
    valuePoints: summary.valuePoints,
    figReference: summary.figReference,
    name: summary.name,
    shortName: summary.shortName,
    discipline: "artistic_female",
    description: null,
    localVocabulary: null,
    edition,
    attribution: edition.attribution,
    note: null,
    readOnly: false,
    ...overrides,
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function routeFetch(options: { cards?: Record<string, CatalogElementCard>; search?: CatalogSearchResult } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { note: string | null; expectedRevision: number | null };
      return json(200, {
        data: {
          note: body.note
            ? { text: body.note, revision: (body.expectedRevision ?? 0) + 1, updatedAt: "2026-11-19T10:00:00.000Z" }
            : null,
          replayed: false,
        },
      });
    }
    if (url.pathname === "/api/v1/owner/element-library") {
      if (options.search) return json(200, { data: options.search });
      const apparatus = url.searchParams.get("apparatus");
      const elements = [vault, beam].filter((element) => !apparatus || element.apparatus === apparatus);
      return json(200, { data: { edition, elements, truncated: false } satisfies CatalogSearchResult });
    }
    const elementId = url.pathname.split("/").at(-1) ?? "";
    const found = options.cards?.[elementId];
    return found ? json(200, { data: found }) : json(404, { detail: "Elemento no encontrado" });
  });
}

function renderBrowser(disciplines: ("artistic_female" | "artistic_male")[] = ["artistic_female"]) {
  return render(
    <ElementLibraryBrowser organizationId={ORG} locationId={SITE} disciplines={disciplines} groupLabels={groupLabels} />
  );
}

describe("formato de la biblioteca", () => {
  it("muestra la letra tal cual y los puntos con coma decimal", () => {
    expect(formatCatalogValue({ valueLetter: "D", valuePoints: null })).toBe("D");
    expect(formatCatalogValue({ valueLetter: null, valuePoints: 4.2 })).toBe("4,20 p.");
    expect(formatFigReference("3.12")).toBe("Nº 3.12");
  });
});

describe("pantalla de la biblioteca", () => {
  it("filtra por aparato y solo ofrece las disciplinas con edición publicada", async () => {
    routeFetch();
    renderBrowser();

    expect(await screen.findByText("Mortal atrás plancha")).toBeTruthy();
    expect(screen.getByText("Yurchenko agrupado")).toBeTruthy();
    const disciplineSelect = screen.getByLabelText("Disciplina") as HTMLSelectElement;
    expect([...disciplineSelect.options].map((option) => option.value)).toEqual(["artistic_female"]);
    // Sin aparato no se puede elegir grupo: cada aparato tiene los suyos.
    expect((screen.getByLabelText("Grupo") as HTMLSelectElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Aparato"), { target: { value: "vault" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Yurchenko agrupado")).toBeTruthy();
    expect(screen.queryByText("Mortal atrás plancha")).toBeNull();
    const url = new URL(String(fetchMock.mock.calls[1]![0]), "http://localhost");
    expect(url.pathname).toBe("/api/v1/owner/element-library");
    expect(url.searchParams.get("organizationId")).toBe(ORG);
    expect(url.searchParams.get("locationId")).toBe(SITE);
    expect(url.searchParams.get("discipline")).toBe("artistic_female");
    expect(url.searchParams.get("apparatus")).toBe("vault");
    expect(url.searchParams.get("limit")).toBe("100");

    const groupSelect = screen.getByLabelText("Grupo") as HTMLSelectElement;
    expect(groupSelect.disabled).toBe(false);
    expect(screen.getByRole("option", { name: "Grupo 4 · Yurchenko: rondada y mortal atrás" })).toBeTruthy();
  });

  it("el pie de atribución sigue a la vista mientras se repite la búsqueda o si falla", async () => {
    routeFetch();
    renderBrowser();
    await screen.findByText("Yurchenko agrupado");

    fetchMock.mockImplementation(async () => json(500, { detail: "No se ha podido cargar la biblioteca." }));
    fireEvent.change(screen.getByLabelText("Aparato"), { target: { value: "vault" } });

    expect(await screen.findByText("No se ha podido cargar la biblioteca.")).toBeTruthy();
    expect(screen.getAllByText(/Zaltyko no está afiliado a la FIG ni cuenta con su respaldo\./)).toHaveLength(1);
  });

  it("lista nombre corto, nombre, grupo y valor, con el pie de atribución", async () => {
    routeFetch();
    renderBrowser();

    const item = await screen.findByRole("button", { name: /Yurchenko agrupado/ });
    expect(within(item).getByText("Yurchenko con mortal atrás agrupado")).toBeTruthy();
    expect(within(item).getByText("Salto · Grupo 4")).toBeTruthy();
    expect(within(item).getByText("4,20 p.")).toBeTruthy();
    const beamItem = screen.getByRole("button", { name: /Mortal atrás plancha/ });
    expect(within(beamItem).getByText("D")).toBeTruthy();
    expect(screen.getAllByText(/Zaltyko no está afiliado a la FIG ni cuenta con su respaldo\./)).toHaveLength(1);
    expect(document.querySelectorAll("img, iframe, video")).toHaveLength(0);
  });

  it("abre la ficha sin descripción cuando la API no la trae, con atribución en lista y ficha", async () => {
    routeFetch({ cards: { [VAULT]: card(vault) } });
    renderBrowser();

    fireEvent.click(await screen.findByRole("button", { name: /Yurchenko agrupado/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Nº 3.12")).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Yurchenko con mortal atrás agrupado" })).toBeTruthy();
    expect(within(dialog).getByText("Salto")).toBeTruthy();
    expect(within(dialog).getByText("Grupo 4 · Yurchenko: rondada y mortal atrás")).toBeTruthy();
    expect(within(dialog).getByText("4,20 p.")).toBeTruthy();
    expect(within(dialog).queryByText("Descripción")).toBeNull();
    expect(within(dialog).getByText("Esta nota la ve todo el equipo de la academia.")).toBeTruthy();

    // Pie de atribución en la lista y en la ficha; el único enlace es el documento oficial.
    expect(screen.getAllByText(/Zaltyko no está afiliado a la FIG ni cuenta con su respaldo\./)).toHaveLength(2);
    const links = [...document.querySelectorAll("a")];
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute("href") === DOC)).toBe(true);
    expect(document.querySelectorAll("img, iframe, video")).toHaveLength(0);
  });

  it("muestra la descripción cuando la API la trae", async () => {
    routeFetch({
      cards: { [BEAM]: card(beam, { description: "Desde parado, mortal atrás con el cuerpo extendido." }) },
    });
    renderBrowser();

    fireEvent.click(await screen.findByRole("button", { name: /Mortal atrás plancha/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Descripción")).toBeTruthy();
    expect(within(dialog).getByText("Desde parado, mortal atrás con el cuerpo extendido.")).toBeTruthy();
    // Sin referencia del Código no se muestra la fila.
    expect(within(dialog).queryByText("Referencia FIG")).toBeNull();
    expect(within(dialog).getByText("D")).toBeTruthy();
  });

  it("con vocabulario del país, la ficha enseña «Así se dice en México» (ADR-0030)", async () => {
    routeFetch({
      cards: {
        [VAULT]: card(vault, {
          localVocabulary: {
            country: "MX",
            countryName: "México",
            terms: [
              { key: "rondada", es: "rondada", local: ["redondilla"], note: null },
              { key: "kippe", es: "kippe", local: ["kip", "alemana"], note: "«Kip» en las rutinas obligatorias." },
            ],
          },
        }),
      },
    });
    renderBrowser();

    fireEvent.click(await screen.findByRole("button", { name: /Yurchenko agrupado/ }));
    const dialog = await screen.findByRole("dialog");
    const heading = await within(dialog).findByRole("heading", { name: "Así se dice en México" });
    const box = heading.closest("section");
    expect(box).toBeTruthy();
    const terms = within(box!).getAllByRole("term").map((node) => node.textContent);
    expect(terms).toEqual(["En España, rondada", "En España, kippe"]);
    const definitions = within(box!).getAllByRole("definition").map((node) => node.textContent);
    expect(definitions[0]).toBe("en México, → redondilla");
    expect(definitions[1]).toContain("kip o alemana");
    expect(definitions[1]).toContain("«Kip» en las rutinas obligatorias.");
  });

  it("sin vocabulario del país no hay recuadro", async () => {
    routeFetch({ cards: { [VAULT]: card(vault) } });
    renderBrowser();

    fireEvent.click(await screen.findByRole("button", { name: /Yurchenko agrupado/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Nombre corto")).toBeTruthy();
    expect(within(dialog).queryByText(/Así se dice en/)).toBeNull();
  });

  it("guardar nota envía la revisión que se vio", async () => {
    routeFetch({
      cards: {
        [VAULT]: card(vault, {
          note: { text: "Brazos atrás en la rondada", revision: 3, updatedAt: "2026-11-18T09:00:00.000Z" },
        }),
      },
    });
    renderBrowser();

    fireEvent.click(await screen.findByRole("button", { name: /Yurchenko agrupado/ }));
    const dialog = await screen.findByRole("dialog");
    const note = (await within(dialog).findByLabelText("Nota de la academia")) as HTMLTextAreaElement;
    expect(note.value).toBe("Brazos atrás en la rondada");
    const save = within(dialog).getByRole("button", { name: "Guardar nota" }) as HTMLButtonElement;
    // Sin cambios no hay nada que guardar.
    expect(save.disabled).toBe(true);

    fireEvent.change(note, { target: { value: "Brazos atrás en la rondada y mirada al tapiz" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const [putUrl, putInit] = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(String(putUrl)).toBe(`/api/v1/owner/element-library/${VAULT}/note`);
    const body = JSON.parse(String(putInit!.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      organizationId: ORG,
      locationId: SITE,
      expectedRevision: 3,
      note: "Brazos atrás en la rondada y mirada al tapiz",
    });
    expect(typeof body.clientRequestId).toBe("string");

    expect(await within(dialog).findByText("Nota guardada.")).toBeTruthy();
    // La lista marca el elemento con nota (texto, no solo color).
    expect(screen.getByText("Con nota")).toBeTruthy();
  });

  it("si otra persona cambió la nota, ofrece cargar la última versión y vuelve a pedir la ficha", async () => {
    const versions = [
      card(vault, { note: { text: "Brazos atrás", revision: 3, updatedAt: "2026-11-18T09:00:00.000Z" } }),
      card(vault, { note: { text: "Versión de otra entrenadora", revision: 4, updatedAt: "2026-11-19T08:00:00.000Z" } }),
    ];
    let cardReads = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (init?.method === "PUT") {
        return json(409, {
          title: "Conflicto",
          detail: "Otra persona ha cambiado esta nota. Recarga para ver la última versión.",
          errors: { currentRevision: 4 },
        });
      }
      if (url.pathname === "/api/v1/owner/element-library") {
        return json(200, { data: { edition, elements: [vault], truncated: false } });
      }
      const version = versions[Math.min(cardReads, versions.length - 1)];
      cardReads += 1;
      return json(200, { data: version });
    });
    renderBrowser();

    fireEvent.click(await screen.findByRole("button", { name: /Yurchenko agrupado/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Nota de la academia"), {
      target: { value: "Brazos atrás y mirada al tapiz" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar nota" }));

    expect(
      await within(dialog).findByText("Otra persona ha cambiado esta nota. Recarga para ver la última versión.")
    ).toBeTruthy();
    expect(cardReads).toBe(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cargar la última versión" }));

    await waitFor(() => expect(cardReads).toBe(2));
    const note = (await within(dialog).findByDisplayValue("Versión de otra entrenadora")) as HTMLTextAreaElement;
    expect(note).toBeTruthy();
    expect(within(dialog).queryByText("Cargar la última versión")).toBeNull();
  });

  it("una nota nueva se guarda sin revisión previa", async () => {
    routeFetch({ cards: { [VAULT]: card(vault) } });
    renderBrowser();

    fireEvent.click(await screen.findByRole("button", { name: /Yurchenko agrupado/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Nota de la academia"), {
      target: { value: "Trabajar la entrada en el foso" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar nota" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const [, putInit] = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(putInit!.body))).toMatchObject({ expectedRevision: null });
  });

  it("en solo lectura la nota se ve pero no se guarda", async () => {
    routeFetch({
      cards: {
        [VAULT]: card(vault, {
          readOnly: true,
          note: { text: "Brazos atrás", revision: 1, updatedAt: "2026-11-18T09:00:00.000Z" },
        }),
      },
    });
    renderBrowser();

    fireEvent.click(await screen.findByRole("button", { name: /Yurchenko agrupado/ }));
    const dialog = await screen.findByRole("dialog");
    const note = (await within(dialog).findByLabelText("Nota de la academia")) as HTMLTextAreaElement;
    expect(note.value).toBe("Brazos atrás");
    expect(note.readOnly).toBe(true);
    expect(within(dialog).queryByRole("button", { name: "Guardar nota" })).toBeNull();
  });

  it("sin edición publicada avisa de que aún no hay elementos revisados", async () => {
    routeFetch({ search: { edition: null, elements: [], truncated: false } });
    renderBrowser();

    expect(await screen.findByText("Aún no hay elementos revisados en esta disciplina")).toBeTruthy();
    expect(screen.queryByText(/Zaltyko no está afiliado a la FIG/)).toBeNull();
  });

  it("sin ninguna disciplina publicada no pide nada a la API", () => {
    routeFetch();
    renderBrowser([]);

    expect(screen.getByText("Aún no hay elementos revisados en esta disciplina")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con la biblioteca apagada muestra que no está disponible", async () => {
    fetchMock.mockResolvedValue(
      json(503, { detail: "No disponible", errors: { reason: "element_library_unavailable" } })
    );
    renderBrowser();

    expect(
      await screen.findByText("La biblioteca de elementos todavía no está disponible en tu academia.")
    ).toBeTruthy();
  });
});
