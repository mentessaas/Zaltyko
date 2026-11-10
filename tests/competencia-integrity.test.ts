import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integridad del panel de competencia sin base de datos: referencias validadas
 * en servidor, traducción de errores de Postgres, disponibilidad de las tablas,
 * protección del script de semilla y enlaces externos seguros.
 */

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  inserts: [] as unknown[],
  execute: vi.fn(),
}));

function chain(result: unknown[]) {
  const node: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "leftJoin", "innerJoin"]) {
    node[method] = () => node;
  }
  node.limit = () => Promise.resolve(result);
  node.then = (resolve: (value: unknown[]) => unknown) => resolve(result);
  return node;
}

vi.mock("@/db", () => {
  const tx = {
    select: () => chain(state.selectResults.shift() ?? []),
    insert: (table: unknown) => {
      state.inserts.push(table);
      const node = {
        values: () => node,
        onConflictDoUpdate: () => node,
        returning: () => Promise.resolve([{ id: "new-row" }]),
        then: (resolve: (value: unknown) => unknown) => resolve(undefined),
      };
      return node;
    },
  };
  return {
    db: {
      ...tx,
      execute: state.execute,
      transaction: (callback: (executor: typeof tx) => unknown) => callback(tx),
    },
  };
});
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { competenciaErrorResponse } from "@/lib/competencia/api";
import { safeHttpUrl } from "@/lib/competencia/domain";
import {
  CompetenciaReferenceError,
  createOpportunity,
  createPricingPlan,
  upsertFlowCoverage,
  upsertSection,
} from "@/lib/competencia/mutations";
import {
  ALLOW_REMOTE_FLAG,
  checkSeedTarget,
} from "@/lib/competencia/seed-guard";
import { isCompetitiveIntelligenceAvailable } from "@/lib/competencia/storage";

const COMPETITOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const FLOW = "44444444-4444-4444-8444-444444444444";

const section = {
  content: "Texto",
  dataStatus: "verificado" as const,
  evidenceLevel: "observado" as const,
  lastVerifiedOn: "2026-11-10",
  reviewAfterDays: 60,
  sourceIds: [SOURCE],
};

const pricing = {
  planName: "Básico",
  priceAmount: 35,
  currency: "EUR",
  billingPeriod: "mes" as const,
  vatMode: "incluido" as const,
  limitsText: null,
  feesText: null,
  extrasText: null,
  trialText: null,
  commitmentText: null,
  estimateSmall: null,
  estimateMedium: null,
  estimateLarge: null,
  sourceId: SOURCE,
  dataStatus: "verificado" as const,
  lastVerifiedOn: null,
  reviewAfterDays: 60,
};

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.execute.mockReset();
});

describe("referencias validadas en servidor", () => {
  it("rechaza en una sección una fuente que no existe", async () => {
    state.selectResults = [[{ id: COMPETITOR, name: "RG" }], []];
    await expect(
      upsertSection(COMPETITOR, "precios", section, null)
    ).rejects.toBeInstanceOf(CompetenciaReferenceError);
    expect(state.inserts).toHaveLength(0);
  });

  it("rechaza en una sección una fuente de otra empresa", async () => {
    state.selectResults = [
      [{ id: COMPETITOR, name: "RG" }],
      [{ id: SOURCE, competitorId: OTHER }],
    ];
    await expect(
      upsertSection(COMPETITOR, "precios", section, null)
    ).rejects.toThrow(/no pertenece a esta empresa/);
    expect(state.inserts).toHaveLength(0);
  });

  it("acepta una fuente de la misma empresa y guarda con historial", async () => {
    state.selectResults = [
      [{ id: COMPETITOR, name: "RG" }],
      [{ id: SOURCE, competitorId: COMPETITOR }],
      [],
    ];
    await expect(
      upsertSection(COMPETITOR, "precios", section, null)
    ).resolves.toMatchObject({ id: "new-row" });
    expect(state.inserts).toHaveLength(2);
  });

  it("valida la fuente de un plan de precios y de una cobertura", async () => {
    state.selectResults = [
      [{ id: COMPETITOR, name: "RG" }],
      [{ id: SOURCE, competitorId: OTHER }],
    ];
    await expect(
      createPricingPlan(COMPETITOR, pricing, null)
    ).rejects.toBeInstanceOf(CompetenciaReferenceError);

    state.selectResults = [
      [{ id: COMPETITOR, name: "RG" }],
      [{ id: FLOW, name: "Asistencia" }],
      [],
    ];
    await expect(
      upsertFlowCoverage(
        COMPETITOR,
        {
          flowId: FLOW,
          coverage: "resuelve",
          evidenceLevel: "observado",
          sourceId: SOURCE,
          notes: null,
        },
        null
      )
    ).rejects.toBeInstanceOf(CompetenciaReferenceError);
  });

  it("rechaza oportunidades vinculadas a empresas inexistentes", async () => {
    state.selectResults = [[{ id: COMPETITOR }]];
    await expect(
      createOpportunity(
        {
          title: "Avisos de choque",
          description: null,
          classification: "diferenciar",
          priority: 1,
          whoPays: null,
          frequency: null,
          currentCost: null,
          minimumSolution: null,
          codeDependencies: null,
          confidence: null,
          effort: null,
          successMetric: null,
          validationPlan: null,
          status: "hipotesis",
          competitorIds: [COMPETITOR, OTHER],
        },
        null
      )
    ).rejects.toThrow(/no existe/);
    expect(state.inserts).toHaveLength(0);
  });
});

describe("traducción de errores de Postgres", () => {
  const status = (error: unknown) =>
    (competenciaErrorResponse(error) as Response).status;

  it("convierte referencias y CHECK en 400, duplicados en 409 y tablas ausentes en 503", () => {
    expect(status(new CompetenciaReferenceError("x"))).toBe(400);
    expect(status(Object.assign(new Error("fk"), { code: "23503" }))).toBe(400);
    expect(status(new Error("wrapped", { cause: { code: "23503" } }))).toBe(
      400
    );
    expect(status(Object.assign(new Error("chk"), { code: "23514" }))).toBe(
      400
    );
    expect(status(Object.assign(new Error("dup"), { code: "23505" }))).toBe(
      409
    );
    expect(status(Object.assign(new Error("tbl"), { code: "42P01" }))).toBe(
      503
    );
  });

  it("propaga cualquier otro error", () => {
    const boom = Object.assign(new Error("conexión"), { code: "08006" });
    expect(() => competenciaErrorResponse(boom)).toThrow(boom);
  });
});

describe("estado «no disponible»", () => {
  it("devuelve true o false según existan las tablas", async () => {
    state.execute.mockResolvedValueOnce({ rows: [{ available: true }] });
    await expect(isCompetitiveIntelligenceAvailable()).resolves.toBe(true);
    state.execute.mockResolvedValueOnce({ rows: [{ available: false }] });
    await expect(isCompetitiveIntelligenceAvailable()).resolves.toBe(false);
  });

  it("trata 42P01 como no disponible, pero propaga otros errores de base", async () => {
    state.execute.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "42P01" })
    );
    await expect(isCompetitiveIntelligenceAvailable()).resolves.toBe(false);

    const down = Object.assign(new Error("connection refused"), {
      code: "ECONNREFUSED",
    });
    state.execute.mockRejectedValueOnce(down);
    await expect(isCompetitiveIntelligenceAvailable()).rejects.toBe(down);
  });
});

describe("protección del script de semilla", () => {
  it("acepta solo bases en loopback por defecto", () => {
    for (const url of [
      "postgresql://u:p@localhost:5432/db",
      "postgresql://u:p@127.0.0.1:54329/db",
      "postgresql://u:p@[::1]:5432/db",
      "postgresql://u@/db?host=/tmp/pg",
    ]) {
      expect(checkSeedTarget(url, []), url).toMatchObject({
        ok: true,
        remote: false,
      });
    }
  });

  it("rechaza una base alojada salvo con el flag explícito", () => {
    const hosted = "postgresql://u:p@db.example.supabase.co:5432/postgres";
    expect(checkSeedTarget(hosted, [])).toMatchObject({ ok: false });
    expect(checkSeedTarget(hosted, [ALLOW_REMOTE_FLAG])).toMatchObject({
      ok: true,
      remote: true,
    });
    expect(checkSeedTarget(undefined, [])).toMatchObject({ ok: false });
    expect(checkSeedTarget("no-es-una-url", [])).toMatchObject({ ok: false });
  });
});

describe("safeHttpUrl", () => {
  it("solo devuelve URLs http(s)", () => {
    expect(safeHttpUrl("https://www.rgmanager.com/")).toBe(
      "https://www.rgmanager.com/"
    );
    expect(safeHttpUrl("http://example.com/a?b=1")).toBe(
      "http://example.com/a?b=1"
    );
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hola")).toBeNull();
    expect(safeHttpUrl("//example.com")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
