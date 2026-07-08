import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const PROFILE_ID = "33333333-3333-3333-3333-333333333333";
const SPORT_CONFIG_ID = "44444444-4444-4444-4444-444444444444";

let selectQueue: unknown[][] = [];
let updateCalls: Array<{ table: unknown; data: unknown }> = [];
let activateAcademySportConfigMock: ReturnType<typeof vi.fn>;

function createSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"] as const;

  methods.forEach((method) => {
    chain[method] = vi.fn(() => chain);
  });

  Object.defineProperty(chain, "then", {
    value: (onFulfilled: unknown, onRejected?: unknown) =>
      Promise.resolve(result).then(onFulfilled as (value: unknown[]) => unknown, onRejected as () => unknown),
  });

  return chain;
}

function queueAcademy() {
  selectQueue.push([
    {
      id: ACADEMY_ID,
      tenantId: TENANT_ID,
      ownerId: PROFILE_ID,
      country: "España",
      countryCode: "ES",
      disciplineVariant: "artistic_female",
      specializationStatus: "configured",
    },
  ]);
}

function queueCurrentConfig() {
  selectQueue.push([
    {
      academySportConfigId: SPORT_CONFIG_ID,
      defaultDisciplineVariant: "artistic_female",
      isActive: true,
    },
  ]);
}

function queueUpdatedAcademy() {
  selectQueue.push([
    {
      id: ACADEMY_ID,
      name: "Academia Test",
      academyType: "artistica",
      country: "España",
      countryCode: "ES",
      region: "Madrid",
      city: "Madrid",
      disciplineVariant: "artistic_female",
      federationConfigVersion: "rfeg-2026-v1",
      specializationStatus: "configured",
      publicDescription: null,
      isPublic: true,
      logoUrl: null,
      website: null,
      contactEmail: null,
      contactPhone: null,
      address: null,
      socialInstagram: null,
      socialFacebook: null,
      socialTwitter: null,
      socialYoutube: null,
    },
  ]);
}

function requestFor(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/academies/${ACADEMY_ID}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function importRoute() {
  return import("@/app/api/academies/[academyId]/settings/route");
}

describe("API /api/academies/[academyId]/settings sport config", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
    updateCalls = [];
    activateAcademySportConfigMock = vi.fn().mockResolvedValue({
      id: SPORT_CONFIG_ID,
      activeProgramCodes: ["base"],
      activeApparatusCodes: ["vt", "fx"],
    });

    vi.doMock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: unknown) => Promise<Response>) =>
        (request: Request, contextOverride?: { params?: Record<string, string> }) =>
          handler(request, {
            tenantId: TENANT_ID,
            userId: "user-1",
            profile: {
              id: PROFILE_ID,
              tenantId: TENANT_ID,
              role: "owner",
            },
            params: contextOverride?.params ?? {},
          }),
    }));

    vi.doMock("@/lib/sport-config/seed", () => ({
      activateAcademySportConfig: activateAcademySportConfigMock,
    }));

    vi.doMock("@/lib/logger", () => ({
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        apiError: vi.fn(),
      },
    }));

    vi.doMock("@/lib/sport-config/service", () => ({
      getAcademySportConfigOptions: vi.fn().mockResolvedValue([
        {
          id: SPORT_CONFIG_ID,
          defaultDisciplineVariant: "artistic_female",
          branchName: "Femenina",
          disciplineName: "Gimnasia Artística",
          activeProgramCodes: ["base"],
          activeApparatusCodes: ["vt", "fx"],
        },
      ]),
    }));

    vi.doMock("@/lib/logger", () => ({
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        apiError: vi.fn(),
        dbOperation: vi.fn(),
        externalService: vi.fn(),
      },
    }));

    vi.doMock("@/db", () => ({
      db: {
        select: vi.fn(() => {
          const result = selectQueue.shift();
          if (!result) throw new Error("Select queue exhausted");
          return createSelectChain(result);
        }),
        update: vi.fn((table: unknown) => ({
          set: vi.fn((data: unknown) => {
            updateCalls.push({ table, data });
            return {
              where: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue([{ id: ACADEMY_ID }]),
              })),
            };
          }),
        })),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("actualiza programas y aparatos activos con códigos saneados", async () => {
    queueAcademy();
    queueCurrentConfig();
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([{ apparatus: ["vt"] }]);
    selectQueue.push([{ apparatus: ["fx"] }]);
    selectQueue.push([]);
    selectQueue.push([]);
    queueUpdatedAcademy();
    selectQueue.push([{ sportConfigId: SPORT_CONFIG_ID, programCode: "base" }]);
    selectQueue.push([{ sportConfigId: SPORT_CONFIG_ID, programCode: "base", apparatus: ["vt"] }]);
    selectQueue.push([{ sportConfigId: SPORT_CONFIG_ID, apparatus: ["fx"] }]);
    selectQueue.push([]);
    selectQueue.push([]);

    const { PATCH } = await importRoute();
    const response = await PATCH(
      requestFor({
        activeDisciplineVariants: ["artistic_female"],
        activeProgramCodesByVariant: {
          artistic_female: ["base", "unknown", "base"],
        },
        activeApparatusCodesByVariant: {
          artistic_female: ["vt", "fx", "bad_apparatus"],
        },
      }),
      { params: { academyId: ACADEMY_ID } } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        sportConfigs: [
          {
            id: SPORT_CONFIG_ID,
            usedProgramCodes: ["base"],
            usedApparatusCodes: ["vt", "fx"],
          },
        ],
      },
    });
    expect(activateAcademySportConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        academyId: ACADEMY_ID,
        countryCode: "ES",
        disciplineVariant: "artistic_female",
        activeProgramCodes: ["base"],
        activeApparatusCodes: ["vt", "fx"],
      })
    );
  }, 20000);

  it("bloquea desactivar un programa usado por atletas o grupos", async () => {
    queueAcademy();
    queueCurrentConfig();
    selectQueue.push([{ programCode: "base" }]);
    selectQueue.push([]);

    const { PATCH } = await importRoute();
    const response = await PATCH(
      requestFor({
        activeDisciplineVariants: ["artistic_female"],
        activeProgramCodesByVariant: {
          artistic_female: ["recreativo"],
        },
      }),
      { params: { academyId: ACADEMY_ID } } as never
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ code: "SPORT_CONFIG_IN_USE" });
    expect(body.message).toContain("programa");
    expect(activateAcademySportConfigMock).not.toHaveBeenCalled();
  }, 20000);

  it("bloquea desactivar un aparato usado en operación o histórico", async () => {
    queueAcademy();
    queueCurrentConfig();
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([{ apparatus: ["ub"] }]);
    selectQueue.push([]);

    const { PATCH } = await importRoute();
    const response = await PATCH(
      requestFor({
        activeDisciplineVariants: ["artistic_female"],
        activeApparatusCodesByVariant: {
          artistic_female: ["vt", "fx"],
        },
      }),
      { params: { academyId: ACADEMY_ID } } as never
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ code: "SPORT_CONFIG_IN_USE" });
    expect(body.message).toContain("aparato");
    expect(activateAcademySportConfigMock).not.toHaveBeenCalled();
  }, 20000);

  it("guarda overrides de terminología solo para la variante deportiva indicada", async () => {
    queueAcademy();
    queueCurrentConfig();
    queueUpdatedAcademy();
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);

    const { PATCH } = await importRoute();
    const response = await PATCH(
      requestFor({
        activeDisciplineVariants: ["artistic_female"],
        terminologyOverridesByVariant: {
          artistic_female: {
            athlete: "  Gimnasta  ",
            athletes: "Gimnastas",
            group: "Grupo técnico",
            unsupported: "No debe persistirse",
            license: "",
          },
          rhythmic: {
            team: "Conjunto",
          },
        },
      }),
      { params: { academyId: ACADEMY_ID } } as never
    );

    expect(response.status).toBe(200);
    expect(activateAcademySportConfigMock).toHaveBeenCalledTimes(1);
    expect(activateAcademySportConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disciplineVariant: "artistic_female",
        terminologyOverrides: {
          athlete: "Gimnasta",
          athletes: "Gimnastas",
          group: "Grupo técnico",
        },
      })
    );
  }, 20000);
});
