// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FamilySkillsSection } from "@/components/family-portal/FamilySkillsSection";
import { SkillAthletePanel } from "@/components/skill-levels/SkillAthletePanel";
import { SkillDiploma } from "@/components/skill-levels/SkillDiploma";
import { SkillRosterEvaluator } from "@/components/skill-levels/SkillRosterEvaluator";
import { SkillTemplateProgress } from "@/components/skill-levels/SkillTemplateProgress";
import {
  buildTemplateProgress,
  type DiplomaView,
  type FamilySkillsView,
  type SkillRosterView,
  type TemplateLevelView,
} from "@/modules/skill-levels/domain/skill-levels";

const ORG = "00000000-0000-4000-8000-000000000001";
const SITE = "00000000-0000-4000-8000-000000000002";
const GROUP = "00000000-0000-4000-8000-000000000003";
const TEMPLATE = "00000000-0000-4000-8000-000000000004";
const L1 = "00000000-0000-4000-8000-000000000005";
const L2 = "00000000-0000-4000-8000-000000000006";
const E1 = "00000000-0000-4000-8000-000000000007";
const E2 = "00000000-0000-4000-8000-000000000008";
const E3 = "00000000-0000-4000-8000-000000000009";
const ANA = "00000000-0000-4000-8000-00000000000a";
const DANI = "00000000-0000-4000-8000-00000000000b";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const levels: TemplateLevelView[] = [
  {
    id: L1,
    position: 1,
    name: "Iniciación",
    description: null,
    elements: [
      { id: E1, name: "Voltereta adelante", apparatus: "floor", description: null, required: true },
      { id: E2, name: "Caminar sobre barra baja", apparatus: "beam", description: null, required: true },
    ],
  },
  {
    id: L2,
    position: 2,
    name: "Nivel 1",
    description: null,
    elements: [{ id: E3, name: "Rueda lateral", apparatus: "floor", description: null, required: true }],
  },
];

function roster(overrides: Partial<SkillRosterView> = {}): SkillRosterView {
  return {
    label: "Base 3 GAF",
    template: { id: TEMPLATE, name: "GAF · Progresión general", discipline: "artistic_female", archived: false, levels },
    athletes: [
      { id: ANA, name: "Ana Niveles", statuses: { [E1]: "achieved", [E2]: "achieved" }, currentLevelId: L1, readyToPass: true, finished: false, overallPercent: 50, passedLevelIds: [] },
      { id: DANI, name: "Dani Niveles", statuses: {}, currentLevelId: L1, readyToPass: false, finished: false, overallPercent: 0, passedLevelIds: [] },
    ],
    truncated: false,
    canWrite: true,
    readOnly: false,
    availableTemplates: [],
    ...overrides,
  };
}

const templatesList = (readOnly = false) => ({
  templates: [
    {
      id: TEMPLATE,
      name: "GAF · Progresión general",
      discipline: "artistic_female",
      description: null,
      source: "starter",
      starterKey: "gaf_progresion_general",
      archived: false,
      revision: 1,
      levelCount: 2,
      elementCount: 3,
      updatedAt: "2026-11-14T10:00:00.000Z",
    },
  ],
  starters: [],
  canManage: true,
  readOnly,
});

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function routeFetch(data: { roster?: SkillRosterView; readOnly?: boolean; status?: number; body?: unknown }) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "POST") return json(200, { data: { id: "x", revision: 1, replayed: false, changed: 2, unchanged: 0 } });
    if (url.includes("/skill-templates")) return json(200, { data: templatesList(data.readOnly) });
    if (data.status) return json(data.status, data.body);
    return json(200, { data: data.roster ?? roster() });
  });
}

describe("evaluación rápida de un grupo", () => {
  it("marca varias gimnastas y varios elementos a la vez con una sola petición", async () => {
    routeFetch({});
    render(<SkillRosterEvaluator organizationId={ORG} locationId={SITE} source={{ kind: "group", id: GROUP }} initialTemplateId={null} />);

    expect(await screen.findByText("Base 3 GAF")).toBeTruthy();
    const mark = screen.getByRole("button", { name: "Conseguido" }) as HTMLButtonElement;
    // Sin elementos ni gimnastas elegidos no se puede guardar.
    expect(mark.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Voltereta adelante/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Caminar sobre barra baja/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Ana Niveles/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Dani Niveles/ }));
    expect(mark.disabled).toBe(false);
    fireEvent.click(mark);

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe("/api/v1/owner/skill-evaluations");
    const body = JSON.parse(String(post[1]!.body));
    expect(body).toMatchObject({
      organizationId: ORG,
      locationId: SITE,
      templateId: TEMPLATE,
      status: "achieved",
      athleteIds: [ANA, DANI],
      elementIds: [E1, E2],
    });
    expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText(/2 marcas guardadas/)).toBeTruthy();
  });

  it("avisa de las gimnastas listas para pasar de nivel y registra el paso", async () => {
    routeFetch({});
    render(<SkillRosterEvaluator organizationId={ORG} locationId={SITE} source={{ kind: "group", id: GROUP }} initialTemplateId={null} />);
    expect(await screen.findByText("Listas para pasar de nivel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pasar de nivel" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe(`/api/v1/owner/athletes/${ANA}/skills/level-passes`);
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ templateId: TEMPLATE, levelId: L1 });
  });

  it("muestra el progreso del grupo por nivel con enlace a la hoja de cada gimnasta", async () => {
    routeFetch({});
    render(<SkillRosterEvaluator organizationId={ORG} locationId={SITE} source={{ kind: "group", id: GROUP }} initialTemplateId={null} />);
    const link = (await screen.findByRole("link", { name: "Ana Niveles" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(`/owner/skills/athletes/${ANA}?organizationId=${ORG}&locationId=${SITE}`);
    // Ana tiene el primer nivel al 100 % (el único); el resto de celdas, al 0 %.
    expect(screen.getAllByText("100 %")).toHaveLength(1);
    expect(screen.getAllByText("0 %").length).toBeGreaterThan(0);
  });

  it("con el plan en solo lectura se consulta pero no se evalúa", async () => {
    routeFetch({ roster: roster({ readOnly: true }) });
    render(<SkillRosterEvaluator organizationId={ORG} locationId={SITE} source={{ kind: "group", id: GROUP }} initialTemplateId={null} />);
    expect(await screen.findByText(/La academia está en solo lectura/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conseguido" })).toBeNull();
    expect(screen.queryByText("Listas para pasar de nivel")).toBeNull();
    expect(screen.getByRole("link", { name: "Dani Niveles" })).toBeTruthy();
  });

  it("sin la función muestra «no disponible» solo con el motivo exacto; cualquier otro 503 es un error", async () => {
    routeFetch({ status: 503, body: { detail: "no", errors: { reason: "skill_levels_unavailable" } } });
    const first = render(<SkillRosterEvaluator organizationId={ORG} locationId={SITE} source={{ kind: "group", id: GROUP }} initialTemplateId={null} />);
    expect(await screen.findByText(/todavía no están disponibles/)).toBeTruthy();
    first.unmount();

    routeFetch({ status: 503, body: { detail: "El uso del plan no se pudo comprobar." } });
    render(<SkillRosterEvaluator organizationId={ORG} locationId={SITE} source={{ kind: "group", id: GROUP }} initialTemplateId={null} />);
    expect(await screen.findByText("El uso del plan no se pudo comprobar.")).toBeTruthy();
    expect(screen.queryByText(/todavía no están disponibles/)).toBeNull();
  });
});

describe("hoja de niveles de una gimnasta", () => {
  const progress = buildTemplateProgress({
    template: { id: TEMPLATE, name: "GAF · Progresión general", discipline: "artistic_female", description: null, archived: false },
    levels,
    progress: new Map([
      [E1, { status: "achieved", achievedOn: "2026-11-10", evaluatedByName: "Marta Ruiz", evaluatedAt: "2026-11-10T10:00:00.000Z" }],
      [E2, { status: "achieved", achievedOn: "2026-11-11", evaluatedByName: "Marta Ruiz", evaluatedAt: "2026-11-11T10:00:00.000Z" }],
    ]),
    passes: [],
  });
  const view = {
    athlete: { id: ANA, name: "Ana Niveles", archived: false },
    canWrite: true,
    readOnly: false,
    templates: [progress],
    availableTemplates: [],
  };

  it("marca el estado de un elemento y registra el paso de nivel cuando el actual está completo", async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === "POST" ? json(200, { data: { id: "x", revision: 1, replayed: false, changed: 1, unchanged: 0 } }) : json(200, { data: view })
    );
    render(<SkillAthletePanel organizationId={ORG} locationId={SITE} athleteId={ANA} />);
    expect(await screen.findByText("GAF · Progresión general")).toBeTruthy();
    // El nivel actual está completo: aparece «Pasar de nivel».
    const passButton = screen.getByRole("button", { name: /Pasar de nivel: Iniciación/ });
    // Un elemento conseguido se puede devolver a «en progreso».
    const group = screen.getByRole("group", { name: "Estado de Voltereta adelante" });
    fireEvent.click(group.querySelectorAll("button")[1]!);
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const evaluation = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(evaluation[0])).toBe("/api/v1/owner/skill-evaluations");
    expect(JSON.parse(String(evaluation[1]!.body))).toMatchObject({ athleteIds: [ANA], elementIds: [E1], status: "in_progress" });
    expect(passButton).toBeTruthy();
  });

  it("de solo lectura (plan o ficha archivada) no ofrece ningún control de escritura", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { ...view, readOnly: true } }));
    render(<SkillAthletePanel organizationId={ORG} locationId={SITE} athleteId={ANA} />);
    expect(await screen.findByText("GAF · Progresión general")).toBeTruthy();
    expect(screen.getByText(/La academia está en solo lectura/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pasar de nivel/ })).toBeNull();
    expect(screen.queryByRole("group", { name: /Estado de/ })).toBeNull();
  });
});

describe("progreso de solo lectura, diploma y sección de familias", () => {
  const progress = buildTemplateProgress({
    template: { id: TEMPLATE, name: "GAF · Progresión general", discipline: "artistic_female", description: null, archived: false },
    levels,
    progress: new Map([[E1, { status: "achieved", achievedOn: "2026-11-10", evaluatedByName: null, evaluatedAt: null }]]),
    passes: [{ id: "p1", levelId: L1, levelName: "Iniciación", levelPosition: 1, passedOn: "2026-11-12", passedByName: null }],
  });

  it("el progreso muestra niveles, estados y fechas, y enlaza el diploma solo si se le da el enlace", () => {
    const withLink = renderToStaticMarkup(
      <SkillTemplateProgress progress={progress} diplomaHrefFor={(passId) => `/familia/gimnastas/x/diplomas/${passId}`} />
    );
    expect(withLink).toContain("GAF · Progresión general");
    expect(withLink).toContain("Superado el");
    expect(withLink).toContain("Conseguido");
    expect(withLink).toContain("/familia/gimnastas/x/diplomas/p1");
    const withoutLink = renderToStaticMarkup(<SkillTemplateProgress progress={progress} />);
    expect(withoutLink).not.toContain("/diplomas/");
    // Solo lectura: ningún botón ni formulario.
    expect(withLink).not.toMatch(/<button|<form|<input/);
  });

  const diploma: DiplomaView = {
    passId: "p1",
    athleteName: "Ana Niveles",
    academyName: "Club Gimnasia Sintético",
    templateName: "GAF · Progresión general",
    discipline: "artistic_female",
    levelName: "Iniciación",
    levelPosition: 1,
    passedOn: "2026-11-14",
    achievements: [
      { name: "Voltereta adelante", apparatus: "floor" },
      { name: "Posición hueca (10 s)", apparatus: null },
    ],
  };

  it("el diploma lleva la academia, la gimnasta, el nivel, la fecha y los logros, y se imprime a A4 apaisado", () => {
    const html = renderToStaticMarkup(<SkillDiploma diploma={diploma} />);
    for (const text of [
      "Club Gimnasia Sintético",
      "Ana Niveles",
      "Diploma de nivel",
      "«Iniciación»",
      "GAF · Progresión general",
      "14 de noviembre de 2026",
      "Voltereta adelante (Suelo)",
      "Posición hueca (10 s)",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("size: A4 landscape");
    expect(html).not.toContain("undefined");
  });

  it("el diploma resume los logros que no caben", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ name: `Elemento ${index + 1}`, apparatus: null }));
    const html = renderToStaticMarkup(<SkillDiploma diploma={{ ...diploma, achievements: many }} />);
    expect(html).toContain("Elemento 8");
    expect(html).not.toContain("Elemento 9<");
    expect(html).toContain("y 4 más");
  });

  it("la sección de familias no pinta nada sin datos, y sin progreso lo dice sin formularios", () => {
    expect(renderToStaticMarkup(<FamilySkillsSection view={null} athleteId={ANA} />)).toBe("");
    const view: FamilySkillsView = { athleteName: "Ana Niveles", academyName: "Club Gimnasia Sintético", templates: [] };
    const empty = renderToStaticMarkup(<FamilySkillsSection view={view} athleteId={ANA} />);
    expect(empty).toContain("Niveles y progreso");
    expect(empty).toContain("Todavía no hay progreso registrado");
    const filled = renderToStaticMarkup(<FamilySkillsSection view={{ ...view, templates: [progress] }} athleteId={ANA} />);
    expect(filled).toContain(`/familia/gimnastas/${ANA}/diplomas/p1`);
    expect(filled).not.toMatch(/<button|<form|<input/);
  });
});
