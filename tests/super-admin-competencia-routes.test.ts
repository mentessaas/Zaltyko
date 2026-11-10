import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUserId: vi.fn(),
  getCurrentProfile: vi.fn(),
  createCompetitor: vi.fn(),
  updateCompetitor: vi.fn(),
  createSource: vi.fn(),
  listCompetitors: vi.fn(),
  listSources: vi.fn(),
  applyCompetitiveSeed: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/authz/user-resolver", () => ({
  resolveUserId: mocks.resolveUserId,
}));
vi.mock("@/lib/authz/profile-service", () => ({
  getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock("@/lib/authz/tenant-resolver", () => ({
  getTenantId: vi.fn(),
  resolveTenantWithUpdate: vi.fn(),
}));
vi.mock("@/lib/authz/profile-updater", () => ({
  updateProfileIfNeeded: vi.fn(),
}));
vi.mock("@/lib/authz/endpoint-config", () => ({
  isPublicEndpoint: vi.fn(() => false),
  isAcademyCreationEndpoint: vi.fn(() => false),
  isFlexibleTenantEndpoint: vi.fn(() => false),
  extractVerifiedAcademyCandidate: vi.fn(),
}));
vi.mock("@/lib/authz/route-permissions", () => ({
  getRequiredRoutePermission: vi.fn(() => null),
}));
vi.mock("@/lib/authz/permissions-service", () => ({
  getUserPermissions: vi.fn(),
}));
vi.mock("@/lib/supabase/bearer-client", () => ({
  getBearerToken: vi.fn(),
  createBearerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(),
  getVerifiedTenantRateLimitIdentifier: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/admin-logs", () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock("@/lib/competencia/mutations", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/competencia/mutations")>();
  return {
    ...original,
    createCompetitor: mocks.createCompetitor,
    updateCompetitor: mocks.updateCompetitor,
    createSource: mocks.createSource,
    applyCompetitiveSeed: mocks.applyCompetitiveSeed,
  };
});
vi.mock("@/lib/competencia/storage", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/competencia/storage")>();
  return {
    ...original,
    listCompetitors: mocks.listCompetitors,
    listSources: mocks.listSources,
  };
});

import {
  GET as listRoute,
  POST as createRoute,
} from "@/app/api/super-admin/competencia/competitors/route";
import { PATCH as updateRoute } from "@/app/api/super-admin/competencia/competitors/[competitorId]/route";
import { POST as seedRoute } from "@/app/api/super-admin/competencia/seed/route";
import {
  GET as listSourcesRoute,
  POST as createSourceRoute,
} from "@/app/api/super-admin/competencia/sources/route";
import { CompetenciaNotFoundError } from "@/lib/competencia/mutations";

const COMPETITOR_ID = "6f1f0b0e-5b0c-4c2a-9d7e-1a2b3c4d5e6f";

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API super-admin de competencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveUserId.mockResolvedValue("user-1");
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-1",
      role: "super_admin",
      isSuspended: false,
    });
    mocks.listCompetitors.mockResolvedValue([]);
    mocks.listSources.mockResolvedValue([]);
    mocks.logAdminAction.mockResolvedValue(undefined);
  });

  it("exige sesión antes de leer o escribir", async () => {
    mocks.resolveUserId.mockResolvedValue(null);
    const response = await createRoute(
      jsonRequest("/api/super-admin/competencia/competitors", "POST", {
        name: "X",
        competitorType: "directo",
      }),
      {}
    );
    expect(response.status).toBe(401);
    expect(mocks.createCompetitor).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "coach", "parent"])(
    "deniega el rol %s",
    async (role) => {
      mocks.getCurrentProfile.mockResolvedValue({
        id: "profile-1",
        role,
        isSuspended: false,
      });
      const list = await listRoute(
        new Request("http://localhost/api/super-admin/competencia/competitors"),
        {}
      );
      expect(list.status).toBe(403);
      expect(mocks.listCompetitors).not.toHaveBeenCalled();
    }
  );

  it("crea un competidor con los datos validados y registra la acción", async () => {
    mocks.createCompetitor.mockResolvedValue({
      id: COMPETITOR_ID,
      slug: "nuevo-soft",
      name: "Nuevo Soft",
    });
    const response = await createRoute(
      jsonRequest("/api/super-admin/competencia/competitors", "POST", {
        name: "Nuevo Soft",
        website: "https://nuevo.example",
        competitorType: "adyacente",
        summary: null,
      }),
      {}
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toEqual({ id: COMPETITOR_ID, slug: "nuevo-soft" });
    expect(mocks.createCompetitor).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nuevo Soft",
        competitorType: "adyacente",
        summary: null,
      }),
      "profile-1"
    );
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "competencia.competitor_created" })
    );
  });

  it("responde 400 con un mensaje legible si faltan datos", async () => {
    const response = await createRoute(
      jsonRequest("/api/super-admin/competencia/competitors", "POST", {
        competitorType: "directo",
      }),
      {}
    );
    expect(response.status).toBe(400);
    expect(mocks.createCompetitor).not.toHaveBeenCalled();
  });

  it("traduce duplicados a 409 y tablas ausentes a 503", async () => {
    mocks.createCompetitor.mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "23505" })
    );
    const duplicate = await createRoute(
      jsonRequest("/api/super-admin/competencia/competitors", "POST", {
        name: "Dup Soft",
        competitorType: "directo",
      }),
      {}
    );
    expect(duplicate.status).toBe(409);

    mocks.listCompetitors.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "42P01" })
    );
    const missing = await listRoute(
      new Request("http://localhost/api/super-admin/competencia/competitors"),
      {}
    );
    expect(missing.status).toBe(503);
  });

  it("archiva conservando el registro y devuelve 404 si no existe", async () => {
    mocks.updateCompetitor.mockResolvedValueOnce({
      id: COMPETITOR_ID,
      slug: "x",
      name: "X",
      lifecycleStatus: "archivado",
    });
    const archived = await updateRoute(
      jsonRequest(
        `/api/super-admin/competencia/competitors/${COMPETITOR_ID}`,
        "PATCH",
        { lifecycleStatus: "archivado" }
      ),
      { params: Promise.resolve({ competitorId: COMPETITOR_ID }) }
    );
    expect(archived.status).toBe(200);
    expect(mocks.updateCompetitor).toHaveBeenCalledWith(
      COMPETITOR_ID,
      { lifecycleStatus: "archivado" },
      "profile-1"
    );

    mocks.updateCompetitor.mockRejectedValueOnce(
      new CompetenciaNotFoundError("Competidor")
    );
    const notFound = await updateRoute(
      jsonRequest(
        `/api/super-admin/competencia/competitors/${COMPETITOR_ID}`,
        "PATCH",
        { researchStatus: "completa" }
      ),
      { params: Promise.resolve({ competitorId: COMPETITOR_ID }) }
    );
    expect(notFound.status).toBe(404);

    const badId = await updateRoute(
      jsonRequest(
        "/api/super-admin/competencia/competitors/no-es-uuid",
        "PATCH",
        { researchStatus: "completa" }
      ),
      { params: Promise.resolve({ competitorId: "no-es-uuid" }) }
    );
    expect(badId.status).toBe(400);
  });

  it("guarda una fuente con fecha y nivel de evidencia", async () => {
    mocks.createSource.mockResolvedValue({
      id: COMPETITOR_ID,
      url: "https://a.example",
      title: null,
      evidenceLevel: "observado",
    });
    const response = await createSourceRoute(
      jsonRequest("/api/super-admin/competencia/sources", "POST", {
        competitorId: COMPETITOR_ID,
        url: "https://a.example/precios",
        title: null,
        accessedOn: "2026-11-10",
        sourceType: "precios",
        claim: "Plan básico a 35 € con IVA",
        evidenceLevel: "observado",
        notes: null,
      }),
      {}
    );
    expect(response.status).toBe(201);
    expect(mocks.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        accessedOn: "2026-11-10",
        evidenceLevel: "observado",
        accessible: true,
      }),
      "profile-1"
    );
  });

  it("un fallo del registro de auditoría tras guardar no convierte el alta en 500", async () => {
    mocks.createCompetitor.mockResolvedValueOnce({
      id: COMPETITOR_ID,
      slug: "log-soft",
      name: "Log Soft",
    });
    mocks.logAdminAction.mockRejectedValueOnce(new Error("audit down"));
    const response = await createRoute(
      jsonRequest("/api/super-admin/competencia/competitors", "POST", {
        name: "Log Soft",
        competitorType: "directo",
      }),
      {}
    );
    expect(response.status).toBe(201);
  });

  it("ignora una búsqueda de fuentes demasiado larga en vez de devolver 500", async () => {
    const response = await listSourcesRoute(
      new Request(
        `http://localhost/api/super-admin/competencia/sources?q=${"a".repeat(300)}&evidence=inventado`
      ),
      {}
    );
    expect(response.status).toBe(200);
    expect(mocks.listSources).toHaveBeenCalledWith({
      competitorId: null,
      evidence: null,
      type: null,
      q: null,
    });
  });

  describe("POST /seed", () => {
    const seedRequest = () =>
      new Request("http://localhost/api/super-admin/competencia/seed", {
        method: "POST",
      });

    it("solo lo puede lanzar un super-admin", async () => {
      mocks.getCurrentProfile.mockResolvedValueOnce({
        id: "profile-2",
        role: "owner",
        isSuspended: false,
      });
      const response = await seedRoute(seedRequest(), {});
      expect(response.status).toBe(403);
      expect(mocks.applyCompetitiveSeed).not.toHaveBeenCalled();
    });

    it("aplica la semilla versionada y devuelve el informe", async () => {
      const report = {
        competitorsCreated: 9,
        sectionsCreated: 0,
        sourcesCreated: 43,
        pricingCreated: 21,
        flowsCreated: 25,
        coverageCreated: 101,
        opportunitiesCreated: 9,
      };
      mocks.applyCompetitiveSeed.mockResolvedValueOnce(report);
      const response = await seedRoute(seedRequest(), {});
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.report).toEqual(report);
      expect(mocks.applyCompetitiveSeed).toHaveBeenCalledWith(
        expect.objectContaining({ version: expect.any(String) }),
        "profile-1"
      );
    });

    it("responde 503 si faltan las tablas ci_*", async () => {
      mocks.applyCompetitiveSeed.mockRejectedValueOnce(
        Object.assign(new Error("missing"), { code: "42P01" })
      );
      const response = await seedRoute(seedRequest(), {});
      expect(response.status).toBe(503);
    });
  });
});
