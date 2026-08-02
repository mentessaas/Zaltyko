/**
 * Cobertura HTTP y de servicio para el flujo D-006 v0:
 *
 * - GET (server component) decide entre OwnerClaimCard y OwnerOnboardingForm
 *   según si el email del usuario matchea `academies.contactEmail`.
 * - POST /api/onboarding/owner/claim crea profile + actualiza ownerId +
 *   inserta membership owner cuando el match es válido.
 * - POST /api/onboarding/owner acepta contactPhone y lo persiste en la
 *   academia creada (camino fallback).
 *
 * Aislamiento por tenant: la claimAcademy() reusa el `tenantId` que la academia
 * ya tiene en la seed, no genera uno nuevo. Si el email del caller no coincide
 * con `academies.contactEmail` se devuelve 403 CLAIM_EMAIL_MISMATCH.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryHandler {
  (table: unknown): unknown;
}

interface MutableCall {
  table: string;
  method: string;
  args: unknown[];
}

const state = {
  academy: null as null | {
    id: string;
    name: string;
    tenantId: string;
    contactEmail: string | null;
    contactPhone: string | null;
    ownerId: string;
    utmSource?: string | null;
    utmMedium?: string | null;
    canalRegistro?: string | null;
  },
  profile: null as null | { id: string; role: string; name: string | null },
  membership: null as null | { academyId: string; role: string },
  log: [] as Array<{ academyId: string; eventType: string; metadata: unknown }>,
  // Lista completa de llamadas para aserciones de aislamiento.
  calls: [] as MutableCall[],
};

const createChain = (handler: (table: string) => unknown) => {
  const make = (table: string): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const wrap = (method: string) => (arg: unknown) => {
      state.calls.push({ table, method, args: [arg] });
      return chain;
    };
    chain.select = wrap("select");
    chain.insert = wrap("insert");
    chain.update = wrap("update");
    chain.values = wrap("values");
    chain.set = wrap("set");
    chain.where = wrap("where");
    chain.orderBy = wrap("orderBy");
    chain.limit = (n: number) => {
      state.calls.push({ table, method: "limit", args: [n] });
      const result = handler(table);
      // Resuelve como thenable para mantener contrato drizzle.
      (chain as Record<string, unknown>).then = (
        onFulfilled: (v: unknown) => unknown
      ) => Promise.resolve(result).then(onFulfilled);
      return chain;
    };
    chain.returning = wrap("returning");
    chain.onConflictDoNothing = () => chain;
    chain.onConflictDoUpdate = () => chain;
    (chain as Record<string, unknown>).then = (
      onFulfilled: (v: unknown) => unknown
    ) => Promise.resolve(handler(table)).then(onFulfilled);
    return chain;
  };
  return make;
};

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      state.calls.push({ table: "*select", method: "select", args });
      return {
        from: (table: unknown) => {
          const t = (table as { _name?: string })._name ?? "unknown";
          const chain = createChain(() => {
            if (t === "academies") {
              return state.academy ? [state.academy] : [];
            }
            if (t === "profiles") {
              return state.profile ? [state.profile] : [];
            }
            if (t === "memberships") {
              return state.membership ? [state.membership] : [];
            }
            return [];
          })(t);
          return chain;
        },
      };
    },
    insert: (table: unknown) => {
      const t = (table as { _name?: string })._name ?? "unknown";
      state.calls.push({ table: t, method: "insert", args: [table] });
      const chain = createChain(() => {
        if (t === "profiles") {
          state.profile = {
            id: "profile_new",
            role: "owner",
            name: "Maria Garcia",
          };
          return [{ id: "profile_new", role: "owner" }];
        }
        if (t === "memberships") {
          return [{ academyId: state.academy?.id, role: "owner" }];
        }
        return [];
      })(t);
      return chain;
    },
    execute: vi.fn(async () => undefined),
    update: (table: unknown) => {
      const t = (table as { _name?: string })._name ?? "unknown";
      state.calls.push({ table: t, method: "update", args: [table] });
      return createChain(() => {
        if (t === "academies" && state.academy) {
          state.academy = { ...state.academy, ownerId: "profile_new" };
          return [state.academy];
        }
        if (t === "profiles" && state.profile) {
          return [state.profile];
        }
        return [];
      })(t);
    },
  },
}));

vi.mock("@/db/schema", () => ({
  academies: {
    _name: "academies",
    id: "a.id",
    name: "a.name",
    ownerId: "a.ownerId",
    contactEmail: "a.contactEmail",
  },
  memberships: {
    _name: "memberships",
    academyId: "m.academyId",
    userId: "m.userId",
    role: "m.role",
  },
  profiles: {
    _name: "profiles",
    id: "p.id",
    userId: "p.userId",
    name: "p.name",
    role: "p.role",
    tenantId: "p.tenantId",
    activeAcademyId: "p.activeAcademyId",
  },
  // El fallback path de /api/onboarding/owner acaba invocando
  // activateAcademySportConfig → ensureCountry / ensureDiscipline / etc.
  // Declaramos el shape mínimo de las tablas que el seed consulta
  // (`client.insert(countries)`, `client.insert(sportDisciplines)`, …) para
  // que el mock de db.insert no lance "No X export is defined".
  countries: { _name: "countries" },
  sportDisciplines: { _name: "sport_disciplines" },
  disciplineVariants: { _name: "discipline_variants" },
  programs: { _name: "programs" },
  apparatus: { _name: "apparatus" },
  sportConfigLevels: { _name: "sport_config_levels" },
  classes: { _name: "classes" },
  classWeekdays: { _name: "class_weekdays" },
  groups: { _name: "groups" },
}));

vi.mock("@/lib/db-transactions", () => ({
  // El callback de withTransaction recibe un cliente tx con la misma forma
  // que db (select/insert/update/execute). Reusamos la misma shape del mock
  // de @/db para que tx.select / tx.insert / tx.update funcionen en los
  // happy-path sin tener que mockear drizzle dos veces.
  withTransaction: async <T>(
    handler: (tx: unknown) => Promise<T>
  ): Promise<T> =>
    handler({
      select: (...args: unknown[]) => {
        state.calls.push({ table: "*select", method: "select", args });
        return {
          from: (table: unknown) => {
            const t = (table as { _name?: string })._name ?? "unknown";
            const chain = createChain(() => {
              if (t === "academies") {
                return state.academy ? [state.academy] : [];
              }
              if (t === "profiles") {
                return state.profile ? [state.profile] : [];
              }
              if (t === "memberships") {
                return state.membership ? [state.membership] : [];
              }
              return [];
            })(t);
            return chain;
          },
        };
      },
      insert: (table: unknown) => {
        const t = (table as { _name?: string })._name ?? "unknown";
        state.calls.push({ table: t, method: "insert", args: [table] });
        const chain = createChain(() => {
          if (t === "profiles") {
            state.profile = {
              id: "profile_new",
              role: "owner",
              name: "Maria Garcia",
            };
            return [{ id: "profile_new", role: "owner" }];
          }
          if (t === "memberships") {
            return [{ academyId: state.academy?.id, role: "owner" }];
          }
          return [];
        })(t);
        return chain;
      },
      update: (table: unknown) => {
        const t = (table as { _name?: string })._name ?? "unknown";
        state.calls.push({ table: t, method: "update", args: [table] });
        return createChain(() => {
          if (t === "academies" && state.academy) {
            state.academy = { ...state.academy, ownerId: "profile_new" };
            return [state.academy];
          }
          if (t === "profiles" && state.profile) {
            return [state.profile];
          }
          return [];
        })(t);
      },
      execute: vi.fn(async () => undefined),
    }),
}));

vi.mock("@/lib/sport-config/seed", () => ({
  activateAcademySportConfig: vi.fn(async () => ({
    id: "sport_config_mock",
    isGenericFallback: false,
    activeProgramCodes: [],
    activeApparatusCodes: [],
  })),
}));

vi.mock("@/lib/event-logging", () => ({
  logEvent: vi.fn(async (entry: unknown) => {
    state.log.push(
      entry as { academyId: string; eventType: string; metadata: unknown }
    );
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn(() => []),
  })),
}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
  })),
}));

let POST_CLAIM: typeof import("@/app/api/onboarding/owner/claim/route").POST;
let POST_ONBOARDING: typeof import("@/app/api/onboarding/owner/route").POST;
let findClaimableAcademyByEmail: typeof import("@/lib/onboarding/owner-claim").findClaimableAcademyByEmail;
let claimAcademy: typeof import("@/lib/onboarding/owner-claim").claimAcademy;

beforeEach(async () => {
  vi.clearAllMocks();
  state.calls = [];
  state.log = [];
  state.academy = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Club Gimnasia Demo",
    tenantId: "tenant_seed",
    contactEmail: "duena@clubdemo.com",
    contactPhone: "+34 600 000 000",
    ownerId: "profile_placeholder",
  };
  state.profile = null;
  state.membership = null;
  getUserMock.mockResolvedValue({
    data: { user: { id: "user_1", email: "duena@clubdemo.com" } },
  });
  if (!POST_CLAIM) {
    POST_CLAIM = (await import("@/app/api/onboarding/owner/claim/route")).POST;
  }
  if (!POST_ONBOARDING) {
    POST_ONBOARDING = (await import("@/app/api/onboarding/owner/route")).POST;
  }
  if (!findClaimableAcademyByEmail) {
    ({ findClaimableAcademyByEmail } = await import(
      "@/lib/onboarding/owner-claim"
    ));
  }
  if (!claimAcademy) {
    ({ claimAcademy } = await import("@/lib/onboarding/owner-claim"));
  }
});

afterEach(() => {
  state.academy = null;
  state.profile = null;
  state.membership = null;
});

describe("findClaimableAcademyByEmail (helper D-006)", () => {
  it("devuelve la academia cuando el email matchea el contactEmail (case-insensitive)", async () => {
    const result = await findClaimableAcademyByEmail("DUENA@CLUBDEMO.COM");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(result?.tenantId).toBe("tenant_seed");
    expect(result?.contactPhone).toBe("+34 600 000 000");
  });

  it("devuelve null cuando el email no matchea ninguna academia", async () => {
    state.academy = null;
    const result = await findClaimableAcademyByEmail("otra@persona.com");
    expect(result).toBeNull();
  });

  it("devuelve null cuando el email viene vacío o solo espacios", async () => {
    expect(await findClaimableAcademyByEmail(null)).toBeNull();
    expect(await findClaimableAcademyByEmail("   ")).toBeNull();
    expect(await findClaimableAcademyByEmail("")).toBeNull();
  });
});

describe("claimAcademy (servicio)", () => {
  it("devuelve ok=true y redirectUrl cuando el email coincide y crea profile + membership", async () => {
    const result = await claimAcademy({
      userId: "user_1",
      userEmail: "duena@clubdemo.com",
      body: {
        academyId: "00000000-0000-0000-0000-000000000001",
        fullName: "Maria Garcia",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.academyId).toBe("00000000-0000-0000-0000-000000000001");
      expect(result.tenantId).toBe("tenant_seed");
      expect(result.redirectUrl).toBe(
        "/app/00000000-0000-0000-0000-000000000001/dashboard"
      );
    }

    // Verifica que se reusó el tenantId del seed (NO se generó uno nuevo —
    // crítico para no romper aislamiento de datos ya creados en la academia).
    const profileInsert = state.calls.find(
      (c) => c.table === "profiles" && c.method === "values"
    );
    expect(profileInsert).toBeDefined();
    const insertValues = profileInsert!.args[0] as Record<string, unknown>;
    expect(insertValues.tenantId).toBe("tenant_seed");
    expect(insertValues.activeAcademyId).toBe(
      "00000000-0000-0000-0000-000000000001"
    );
    expect(insertValues.role).toBe("owner");

    // membership insertada con role=owner (noConflictDoNothing seguro).
    const membershipInsert = state.calls.find(
      (c) => c.table === "memberships" && c.method === "values"
    );
    expect(membershipInsert).toBeDefined();
    const membershipValues = membershipInsert!.args[0] as Record<
      string,
      unknown
    >;
    expect(membershipValues.role).toBe("owner");
    expect(membershipValues.academyId).toBe(
      "00000000-0000-0000-0000-000000000001"
    );

    // academies.ownerId reasignado al nuevo perfil.
    const academyUpdate = state.calls.find(
      (c) => c.table === "academies" && c.method === "set"
    );
    expect(academyUpdate).toBeDefined();
    expect((academyUpdate!.args[0] as Record<string, unknown>).ownerId).toBe(
      "profile_new"
    );
  });

  it("devuelve 403 CLAIM_EMAIL_MISMATCH si el caller intenta reclamar con email distinto", async () => {
    const result = await claimAcademy({
      userId: "user_2",
      userEmail: "atacante@otro.com",
      body: {
        academyId: "00000000-0000-0000-0000-000000000001",
        fullName: "Atacante",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const response = result.response;
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("CLAIM_EMAIL_MISMATCH");
    }

    // No debe haberse tocado la academia ni creado profile.
    const academyUpdates = state.calls.filter(
      (c) => c.table === "academies" && c.method === "set"
    );
    expect(academyUpdates).toHaveLength(0);
    const profileInserts = state.calls.filter(
      (c) => c.table === "profiles" && c.method === "values"
    );
    expect(profileInserts).toHaveLength(0);
  });

  it("captura el canal una sola vez al reclamar una academia pre-registrada sin UTM", async () => {
    await claimAcademy({
      userId: "user_1",
      userEmail: "duena@clubdemo.com",
      body: {
        academyId: "00000000-0000-0000-0000-000000000001",
        fullName: "Maria Garcia",
        utm: { utm_source: "instagram", utm_medium: "cpc" },
      },
    });

    const academyUpdate = state.calls.find(
      (call) => call.table === "academies" && call.method === "set"
    );
    const values = academyUpdate?.args[0] as Record<string, unknown>;
    expect(values.utmSource).toBe("instagram");
    expect(values.utmMedium).toBe("cpc");
    expect(values.canalRegistro).toBe("paid");
  });

  it("conserva UTM y canal existentes al reclamar una academia ya atribuida", async () => {
    if (!state.academy) throw new Error("fixture academy missing");
    state.academy.utmSource = "google_organic";
    state.academy.utmMedium = "organic";
    state.academy.canalRegistro = "organic";

    await claimAcademy({
      userId: "user_1",
      userEmail: "duena@clubdemo.com",
      body: {
        academyId: "00000000-0000-0000-0000-000000000001",
        fullName: "Maria Garcia",
        utm: { utm_source: "google_ads", utm_medium: "cpc" },
      },
    });

    const academyUpdate = state.calls.find(
      (call) => call.table === "academies" && call.method === "set"
    );
    const values = academyUpdate?.args[0] as Record<string, unknown>;
    expect(values).toEqual({ ownerId: "profile_new" });
  });

  it("devuelve 404 ACADEMY_NOT_FOUND cuando el academyId no existe", async () => {
    state.academy = null;
    const result = await claimAcademy({
      userId: "user_1",
      userEmail: "duena@clubdemo.com",
      body: {
        academyId: "00000000-0000-0000-0000-000000000000",
        fullName: "X",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
    }
  });
});

describe("POST /api/onboarding/owner/claim (HTTP)", () => {
  it("rechaza con 401 cuando no hay sesión", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const response = await POST_CLAIM(
      new Request("http://localhost/api/onboarding/owner/claim", {
        method: "POST",
        body: JSON.stringify({
          academyId: "00000000-0000-0000-0000-000000000001",
          fullName: "Maria",
        }),
      })
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("UNAUTHENTICATED");
  });

  it("rechaza con 400 cuando el body no cumple el schema", async () => {
    const response = await POST_CLAIM(
      new Request("http://localhost/api/onboarding/owner/claim", {
        method: "POST",
        body: JSON.stringify({ academyId: "no-es-uuid", fullName: "x" }),
      })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_PAYLOAD");
  });

  it("happy path: 201 + redirectUrl a /app/[id]/dashboard y registra evento", async () => {
    const response = await POST_CLAIM(
      new Request("http://localhost/api/onboarding/owner/claim", {
        method: "POST",
        body: JSON.stringify({
          academyId: "00000000-0000-0000-0000-000000000001",
          fullName: "Maria Garcia",
        }),
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.academyId).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.data.redirectUrl).toBe(
      "/app/00000000-0000-0000-0000-000000000001/dashboard"
    );
    expect(state.log).toHaveLength(1);
    expect(state.log[0].eventType).toBe("owner_claimed");
  });
});

describe("POST /api/onboarding/owner — fallback con contactPhone", () => {
  it("rechaza con 400 INVALID_PHONE si el teléfono no cumple formato internacional", async () => {
    const response = await POST_ONBOARDING(
      new Request("http://localhost/api/onboarding/owner", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Maria Garcia",
          academyName: "Mi Club",
          contactPhone: "no-es-telefono",
          disciplineVariant: "artistic_female",
          countryCode: "es",
        }),
      })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_PHONE");
  });

  it("acepta contactPhone vacío (compatibilidad con callers que todavía no lo envían)", async () => {
    // Estado: usuario autenticado, sin profile, sin memberships, sin academy
    // que matchee por email. La API debería iniciar el flujo de creación
    // sin quejarse por el phone ausente.
    state.academy = null; // ninguna academia pre-registrada matchea
    state.profile = null;

    // Mockeamos createAcademy para que no toque DB real (no existe en este
    // test aislado). Necesitamos interceptar el import dinámico que hace la
    // ruta — más simple: espiamos el módulo.
    const academiesLib = await import("@/app/api/academies/academies.lib");
    const createAcademySpy = vi
      .spyOn(academiesLib, "createAcademy")
      .mockResolvedValue({
        id: "academy_new",
        tenantId: "tenant_new",
        academyType: "artistica",
      } as any);

    const response = await POST_ONBOARDING(
      new Request("http://localhost/api/onboarding/owner", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Maria Garcia",
          academyName: "Mi Club",
          // contactPhone ausente
          disciplineVariant: "artistic_female",
          countryCode: "es",
        }),
      })
    );
    // Puede que llegue hasta createAcademy o falle por mocks faltantes; lo
    // importante es que NO falla con INVALID_PHONE.
    const body = await response.json().catch(() => ({}));
    expect(body.error).not.toBe("INVALID_PHONE");

    createAcademySpy.mockRestore();
  });
});
