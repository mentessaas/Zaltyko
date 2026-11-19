import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tables = {
    athleteAssessments: { tableName: "athleteAssessments" },
    assessmentVideos: { tableName: "assessmentVideos" },
    athletes: { tableName: "athletes" },
    coaches: { tableName: "coaches" },
    groups: { tableName: "groups" },
  };
  const athleteRow = {
    id: "30000000-0000-4000-8000-000000000003",
    academyId: "20000000-0000-4000-8000-000000000002",
    tenantId: "10000000-0000-4000-8000-000000000001",
    groupId: null,
    primarySportConfigId: null,
  };
  const dbSelect = vi.fn(() => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      limit: vi.fn(async () => [athleteRow]),
    };
    return chain;
  });
  const insertedTables: string[] = [];
  const tx = {
    insert: vi.fn((table: { tableName: string }) => {
      insertedTables.push(table.tableName);
      return { values: vi.fn(async () => []) };
    }),
  };
  const withTransaction = vi.fn(async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx));
  return {
    tables,
    athleteRow,
    db: { select: dbSelect, insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
    dbSelect,
    tx,
    insertedTables,
    withTransaction,
  };
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/db/schema", () => mocks.tables);
vi.mock("@/lib/authz", () => ({ withTenant: (handler: unknown) => handler }));
vi.mock("@/lib/authz/resource-scope", () => ({
  authorizeAcademyCapability: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: (error: unknown) =>
    new Response(JSON.stringify({ code: "UNEXPECTED", message: String(error) }), { status: 500 }),
}));
vi.mock("@/lib/db-transactions", () => ({ withTransaction: mocks.withTransaction }));
vi.mock("@/lib/limits", () => ({
  assertAcademyOperationalWritable: vi.fn(async () => undefined),
  lockAcademyOperationalWrites: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api-response", () => ({
  apiError: (code: string, message: string, status: number) =>
    new Response(JSON.stringify({ ok: false, code, message }), { status, headers: { "content-type": "application/json" } }),
  apiSuccess: (data: unknown) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } }),
}));
vi.mock("@/lib/sport-config/service", () => ({
  getAcademySportConfigOptions: vi.fn(async () => []),
  verifyAcademySportConfig: vi.fn(async () => true),
}));
vi.mock("@/lib/progress/service", () => ({
  verifyProgressAccess: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/progress/session-context", () => ({
  resolveAssessingCoachId: vi.fn(async () => null),
  verifyAssessmentSessionContext: vi.fn(async () => ({ allowed: true, sportConfigId: null })),
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  desc: (column: unknown) => ({ type: "desc", column }),
  inArray: (...args: unknown[]) => ({ type: "inArray", args }),
  isNull: (column: unknown) => ({ type: "isNull", column }),
}));

import { POST as postCollection } from "@/app/api/assessments/route";
import { POST as postByAthlete } from "@/app/api/assessments/[athleteId]/route";

const source = readFileSync(new URL("../src/app/api/assessments/route.ts", import.meta.url), "utf8");
const athleteSource = readFileSync(new URL("../src/app/api/assessments/[athleteId]/route.ts", import.meta.url), "utf8");

const context = {
  tenantId: mocks.athleteRow.tenantId,
  profile: { role: "owner", activeAcademyId: mocks.athleteRow.academyId },
  params: { athleteId: mocks.athleteRow.id },
};
const baseBody = {
  assessmentDate: "2026-11-19",
  assessmentType: "practice",
  overallComment: "Buen trabajo",
  totalScore: 8,
};

function post(body: unknown) {
  return new Request("https://sandbox.invalid/api/assessments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routes = [
  { name: "POST /api/assessments", handler: postCollection, body: { ...baseBody, athleteId: mocks.athleteRow.id } },
  { name: "POST /api/assessments/[athleteId]", handler: postByAthlete, body: baseBody },
] as const;

describe("assessments API P0 contract", () => {
  it("protege POST con autenticación tenant y validación", () => {
    expect(source).toMatch(/export const POST/);
    expect(source).toMatch(/withTenant/);
    expect(source).toMatch(/safeParse|parse\(/);
  });

  it("mantiene el alcance de academia/atleta en la ruta por atleta", () => {
    expect(athleteSource).toMatch(/withTenant/);
    expect(athleteSource).toMatch(/athleteId/);
    expect(athleteSource).toMatch(/tenantId|academyId/);
  });

  it("rechaza payloads inválidos con respuesta API estandarizada", () => {
    expect(source).toMatch(/apiError/);
    expect(source).toMatch(/400|VALIDATION/);
  });
});

describe("retirada de las puntuaciones por elemento (ADR-0029 §7)", () => {
  beforeEach(() => {
    mocks.dbSelect.mockClear();
    mocks.withTransaction.mockClear();
    mocks.tx.insert.mockClear();
    mocks.insertedTables.length = 0;
  });

  for (const route of routes) {
    it(`${route.name} responde 400 si llegan puntuaciones y no toca la base`, async () => {
      for (const scores of [[], [{ skillId: "60000000-0000-4000-8000-000000000006", score: 7 }], null]) {
        const response = await route.handler(post({ ...route.body, scores }), context as never);
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          code: "ASSESSMENT_SCORES_RETIRED",
          message: "Las puntuaciones por elemento ya no se guardan",
        });
      }
      expect(mocks.dbSelect).not.toHaveBeenCalled();
      expect(mocks.withTransaction).not.toHaveBeenCalled();
    });

    it(`${route.name} sin puntuaciones sigue guardando solo la evaluación`, async () => {
      const response = await route.handler(post(route.body), context as never);
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { ok: boolean; data: { id: string } };
      expect(payload.ok).toBe(true);
      expect(payload.data.id).toEqual(expect.any(String));
      expect(mocks.withTransaction).toHaveBeenCalledTimes(1);
      expect(mocks.insertedTables).toEqual(["athleteAssessments"]);
    });
  }

  it("ninguna ruta escribe ni lee las tablas antiguas", () => {
    for (const text of [source, athleteSource]) {
      expect(text).not.toMatch(/assessmentScores|skillCatalog|scoreSchema/);
      expect(text).toContain("Las puntuaciones por elemento ya no se guardan");
    }
  });

  it("la consulta por gimnasta ya no devuelve puntuaciones y conserva los vídeos", () => {
    const get = athleteSource.slice(athleteSource.indexOf("export const GET"), athleteSource.indexOf("export const PATCH"));
    expect(get).not.toMatch(/\bscores\b/);
    expect(get).toContain(".from(assessmentVideos)");
    expect(get).toContain("athleteName: athleteRow.name");
  });
});
