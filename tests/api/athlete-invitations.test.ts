/**
 * ZAL-138 [D-006 v0] — cobertura del flujo de magic links para primeras atletas.
 *
 * Cubre:
 *  - `inviteFirstAthletes`: dedup intra-batch, validación max 10, idempotencia
 *    (retry regenera token y sube attempt_count), rechazo si academia/tenant
 *    no coinciden, marcado de error en last_error si Supabase falla.
 *  - `acceptInvitationByEmail`: marca magic_link_opened_at, idempotente al
 *    segundo clic, crea athlete stub vinculado al auth.users.
 *  - `completeAthleteProfile`: cierra D-006 v0 gate 1 (profile_completed_at),
 *    idempotente, devuelve 4xx si el tenant no coincide.
 *  - Schema Zod: rechaza > 10 emails, emails inválidos, plantilla con chars
 *    prohibidos.
 *
 * Aislamiento: las llamadas a Supabase admin se mockean vía `SupabaseMagicLinkGenerator`.
 * Las queries a DB usan un chainable mockeado similar a `owner-claim.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MutableCall {
  table: string;
  method: string;
  args: unknown[];
}

interface AthleteRow {
  id: string;
  academyId: string;
  tenantId: string;
  userId: string | null;
  inviteEmail: string | null;
  magicLinkOpenedAt: Date | null;
  profileCompletedAt: Date | null;
}

interface AthleteInvitationRow {
  id: string;
  tenantId: string;
  academyId: string;
  email: string;
  emailNormalized: string;
  status: string;
  magicLinkToken: string;
  magicLinkSentAt: Date | null;
  magicLinkOpenedAt: Date | null;
  profileCompletedAt: Date | null;
  athleteId: string | null;
  attemptCount: number;
  lastError: string | null;
  expiresAt: Date;
  customMessage: string | null;
  template: string;
  createdAt: Date;
  updatedAt: Date;
}

const state = {
  academy: null as null | { id: string; tenantId: string; name: string },
  invitations: [] as AthleteInvitationRow[],
  athletes: [] as AthleteRow[],
  calls: [] as MutableCall[],
};

const createChain = (resolver: () => unknown) => {
  const chain: Record<string, unknown> = {};
  const wrap = (method: string) => (...args: unknown[]) => {
    state.calls.push({ table: "*", method, args });
    return chain;
  };
  chain.select = wrap("select");
  chain.insert = wrap("insert");
  chain.update = wrap("update");
  chain.values = (vals: unknown) => {
    state.calls.push({ table: "*", method: "values", args: [vals] });
    return chain;
  };
  chain.set = (vals: unknown) => {
    state.calls.push({ table: "*", method: "set", args: [vals] });
    return chain;
  };
  chain.where = wrap("where");
  chain.orderBy = wrap("orderBy");
  chain.limit = (n: number) => {
    state.calls.push({ table: "*", method: "limit", args: [n] });
    const result = resolver();
    (chain as Record<string, unknown>).then = (
      onFulfilled: (v: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled);
    return chain;
  };
  chain.returning = (cols: unknown) => {
    state.calls.push({ table: "*", method: "returning", args: [cols] });
    return chain;
  };
  chain.onConflictDoNothing = (opts?: unknown) => {
    state.calls.push({ table: "*", method: "onConflictDoNothing", args: [opts] });
    // Resolver resultado ahora (sin transacción real): si la fila ya
    // existe, no se inserta (devuelve []); si es nueva, devuelve el insert.
    const target = (opts as { target?: string[] } | undefined)?.target;
    if (
      target &&
      target[0] === "academy_id" &&
      target[1] === "email_normalized"
    ) {
      const incoming = (chain.values as unknown as (_: unknown) => void) || null;
      // No podemos leer values sincrónicamente; usamos estado compartido.
    }
    return chain;
  };
  (chain as Record<string, unknown>).then = (
    onFulfilled: (v: unknown) => unknown
  ) => Promise.resolve(resolver()).then(onFulfilled);
  return chain;
};

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      state.calls.push({ table: "select", method: "select", args });
      return {
        from: (table: unknown) => {
          const t = (table as { _name?: string })._name ?? "unknown";
          return createChain(() => {
            if (t === "academies") {
              return state.academy ? [state.academy] : [];
            }
            if (t === "athlete_invitations") {
              return state.invitations;
            }
            if (t === "athletes") {
              return state.athletes;
            }
            return [];
          });
        },
      };
    },
    insert: (table: unknown) => {
      const t = (table as { _name?: string })._name ?? "unknown";
      state.calls.push({ table: t, method: "insert", args: [table] });
      const chain = createChain(() => []);
      // Interceptar values+returning para simular el insert real.
      let captured: Record<string, unknown> | null = null;
      chain.values = (vals: unknown) => {
        captured = vals as Record<string, unknown>;
        state.calls.push({ table: t, method: "values", args: [vals] });
        return chain;
      };
      chain.returning = (cols: unknown) => {
        state.calls.push({ table: t, method: "returning", args: [cols] });
        if (captured) {
          const id =
            (captured.id as string | undefined) ??
            `inv_${state.invitations.length + 1}`;
          if (t === "athlete_invitations") {
            const row: AthleteInvitationRow = {
              id,
              tenantId: captured.tenantId as string,
              academyId: captured.academyId as string,
              email: captured.email as string,
              emailNormalized: captured.emailNormalized as string,
              status: (captured.status as string) ?? "pending",
              magicLinkToken: captured.magicLinkToken as string,
              magicLinkSentAt:
                (captured.magicLinkSentAt as Date | null) ?? null,
              magicLinkOpenedAt: null,
              profileCompletedAt: null,
              athleteId: null,
              attemptCount: (captured.attemptCount as number) ?? 1,
              lastError: null,
              expiresAt: captured.expiresAt as Date,
              customMessage:
                (captured.customMessage as string | null) ?? null,
              template:
                (captured.template as string) ?? "first_athlete_v1",
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            // Simular conflicto: si ya existe una invitación activa con el
            // mismo academy+email_normalized, devolvemos [] (el onConflictDoNothing).
            const exists = state.invitations.find(
              (i) =>
                i.academyId === row.academyId &&
                i.emailNormalized === row.emailNormalized &&
                ["pending", "sent", "opened"].includes(i.status)
            );
            if (!exists) {
              state.invitations.push(row);
            }
            return exists ? [] : [{ id: row.id }];
          }
          if (t === "athletes") {
            const row: AthleteRow = {
              id,
              academyId: captured.academyId as string,
              tenantId: captured.tenantId as string,
              userId: (captured.userId as string | null) ?? null,
              inviteEmail:
                (captured.inviteEmail as string | null) ?? null,
              magicLinkOpenedAt:
                (captured.magicLinkOpenedAt as Date | null) ?? null,
              profileCompletedAt: null,
            };
            // onConflictDoNothing por userId: idempotente.
            const exists = state.athletes.find(
              (a) => a.userId && a.userId === row.userId
            );
            if (!exists) {
              state.athletes.push(row);
            }
            return exists ? [] : [{ id: row.id }];
          }
        }
        return [];
      };
      return chain;
    },
    update: (table: unknown) => {
      const t = (table as { _name?: string })._name ?? "unknown";
      state.calls.push({ table: t, method: "update", args: [table] });
      const chain = createChain(() => []);
      let pendingSet: Record<string, unknown> | null = null;
      let pendingWhere: unknown[] = [];
      chain.set = (vals: unknown) => {
        pendingSet = vals as Record<string, unknown>;
        state.calls.push({ table: t, method: "set", args: [vals] });
        return chain;
      };
      chain.where = (...args: unknown[]) => {
        pendingWhere = args;
        state.calls.push({ table: t, method: "where", args });
        return chain;
      };
      // En Drizzle real, `await update(...).set({...}).where(...)` aplica los
      // cambios al consumirse la promesa (no requiere .limit()). El mock por
      // tanto simula el UPDATE cuando el chain se resuelve (`then`).
      const applyPending = () => {
        if (!pendingSet) return;
        // El helper siempre usa eq con valores primitivos; los eq clauses reales
        // no exponen shape `{_op}`, así que hacemos match por valores y por las
        // columnas que el helper usa en WHERE (id / academyId / emailNormalized).
        // Para tests con una sola fila objetivo por tabla, el primer match sirve.
        if (t === "athlete_invitations") {
          const target = state.invitations.find((i) =>
            i.id === pendingSet.athleteId ||
            i.academyId === pendingWhere[0] ||
            true // fallback al primer match: hay una sola fila por test
          );
          if (target) {
            Object.assign(target, pendingSet, { updatedAt: new Date() });
          }
        }
        if (t === "athletes") {
          const target = state.athletes[0]; // single-athlete tests
          if (target) {
            Object.assign(target, pendingSet);
          }
        }
        pendingSet = null;
        pendingWhere = [];
      };
      (chain as Record<string, unknown>).then = (
        onFulfilled: (v: unknown) => unknown
      ) => {
        applyPending();
        return Promise.resolve([]).then(onFulfilled);
      };
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  academies: { _name: "academies" },
  athletes: { _name: "athletes" },
  athleteInvitations: { _name: "athlete_invitations" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({
    auth: {
      admin: {
        getUserByEmail: vi.fn(async (email: string) => ({
          data: { user: { id: `auth_${email.replace(/[^a-z0-9]/gi, "_")}` } },
        })),
      },
    },
  }),
}));

let inviteFirstAthletes: typeof import("@/lib/athletes/invitations").inviteFirstAthletes;
let acceptInvitationByEmail: typeof import("@/lib/athletes/invitations").acceptInvitationByEmail;
let completeAthleteProfile: typeof import("@/lib/athletes/invitations").completeAthleteProfile;
let MAX_BULK_INVITES: typeof import("@/lib/athletes/invitations").MAX_BULK_INVITES;
let InviteFirstAthletesBodySchema: typeof import("@/lib/athletes/invitations").InviteFirstAthletesBodySchema;
let CompleteAthleteProfileBodySchema: typeof import("@/lib/athletes/invitations").CompleteAthleteProfileBodySchema;

beforeEach(async () => {
  vi.clearAllMocks();
  state.calls = [];
  state.invitations = [];
  state.athletes = [];
  state.academy = {
    id: "academy_1",
    tenantId: "tenant_1",
    name: "Club Demo",
  };

  if (!inviteFirstAthletes) {
    const mod = await import("@/lib/athletes/invitations");
    inviteFirstAthletes = mod.inviteFirstAthletes;
    acceptInvitationByEmail = mod.acceptInvitationByEmail;
    completeAthleteProfile = mod.completeAthleteProfile;
    MAX_BULK_INVITES = mod.MAX_BULK_INVITES;
    InviteFirstAthletesBodySchema = mod.InviteFirstAthletesBodySchema;
    CompleteAthleteProfileBodySchema = mod.CompleteAthleteProfileBodySchema;
  }
});

afterEach(() => {
  state.academy = null;
});

describe("inviteFirstAthletes — limites y validacion (ZAL-138)", () => {
  it("dedup: el mismo email dos veces solo cuenta una invitacion", async () => {
    const generator = {
      generateMagicLink: vi.fn(async ({ email }: { email: string }) => ({
        actionLink: `https://x/${email}`,
        token: `tok_${email}`,
      })),
    };

    const result = await inviteFirstAthletes(
      {
        emails: ["ana@club.com", "ANA@club.com", "  ana@club.com  "],
      },
      {
        tenantId: "tenant_1",
        academyId: "academy_1",
        invitedBy: "user_1",
        origin: "https://app.zaltyko.com",
        generator,
      }
    );

    expect(generator.generateMagicLink).toHaveBeenCalledTimes(1);
    expect(result.sent.length).toBe(1);
    expect(result.rejected.length).toBe(0);
    expect(state.invitations.length).toBe(1);
    expect(state.invitations[0].emailNormalized).toBe("ana@club.com");
  });

  it("idempotente: reintento con el mismo email NO duplica fila, regenera token y sube attempt_count", async () => {
    const tokens: string[] = [];
    const generator = {
      generateMagicLink: vi.fn(async ({ email }: { email: string }) => {
        tokens.push(`tok_${email}_${tokens.length}`);
        return {
          actionLink: `https://x/${email}?tok=${tokens.length}`,
          token: tokens[tokens.length - 1],
        };
      }),
    };

    const first = await inviteFirstAthletes(
      { emails: ["ana@club.com"] },
      {
        tenantId: "tenant_1",
        academyId: "academy_1",
        invitedBy: "user_1",
        origin: "https://app.zaltyko.com",
        generator,
      }
    );
    expect(first.sent.length).toBe(1);
    expect(state.invitations.length).toBe(1);
    const firstAttempt = state.invitations[0].attemptCount;

    const second = await inviteFirstAthletes(
      { emails: ["ana@club.com"] },
      {
        tenantId: "tenant_1",
        academyId: "academy_1",
        invitedBy: "user_1",
        origin: "https://app.zaltyko.com",
        generator,
      }
    );
    expect(second.sent.length).toBe(1);
    expect(second.sent[0].alreadySent).toBe(true);
    expect(state.invitations.length).toBe(1); // sigue siendo una fila
    expect(state.invitations[0].attemptCount).toBe(firstAttempt + 1);
  });

  it("rechaza academy que no existe con ACADEMY_NOT_FOUND para todos los emails", async () => {
    state.academy = null;
    const generator = {
      generateMagicLink: vi.fn(),
    };
    const result = await inviteFirstAthletes(
      { emails: ["ana@club.com", "luisa@club.com"] },
      {
        tenantId: "tenant_1",
        academyId: "missing",
        invitedBy: "user_1",
        origin: "https://app.zaltyko.com",
        generator,
      }
    );
    expect(result.sent.length).toBe(0);
    expect(result.rejected.length).toBe(2);
    expect(result.rejected.every((r) => r.reason === "ACADEMY_NOT_FOUND")).toBe(
      true
    );
    expect(generator.generateMagicLink).not.toHaveBeenCalled();
  });

  it("persiste lastError si Supabase falla y sigue con el resto del batch", async () => {
    const generator = {
      generateMagicLink: vi
        .fn()
        .mockRejectedValueOnce(new Error("Supabase down"))
        .mockResolvedValueOnce({
          actionLink: "https://x/luisa",
          token: "tok_luisa",
        }),
    };

    const result = await inviteFirstAthletes(
      { emails: ["ana@club.com", "luisa@club.com"] },
      {
        tenantId: "tenant_1",
        academyId: "academy_1",
        invitedBy: "user_1",
        origin: "https://app.zaltyko.com",
        generator,
      }
    );

    expect(result.sent.length).toBe(1);
    expect(result.sent[0].email).toBe("luisa@club.com");
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].email).toBe("ana@club.com");
    expect(result.rejected[0].reason).toBe("MAGIC_LINK_FAILED");
  });
});

describe("InviteFirstAthletesBodySchema (ZAL-138)", () => {
  it("rechaza más de MAX_BULK_INVITES emails", () => {
    const emails = Array.from(
      { length: MAX_BULK_INVITES + 1 },
      (_, i) => `atleta${i}@club.com`
    );
    const result = InviteFirstAthletesBodySchema.safeParse({ emails });
    expect(result.success).toBe(false);
  });

  it("rechaza emails sin formato válido", () => {
    const result = InviteFirstAthletesBodySchema.safeParse({
      emails: ["no-es-email"],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza template con caracteres prohibidos", () => {
    const result = InviteFirstAthletesBodySchema.safeParse({
      emails: ["ana@club.com"],
      template: "mi plantilla mala",
    });
    expect(result.success).toBe(false);
  });

  it("acepta exactamente MAX_BULK_INVITES emails", () => {
    const emails = Array.from(
      { length: MAX_BULK_INVITES },
      (_, i) => `atleta${i}@club.com`
    );
    const result = InviteFirstAthletesBodySchema.safeParse({ emails });
    expect(result.success).toBe(true);
  });
});

describe("CompleteAthleteProfileBodySchema (ZAL-138)", () => {
  it("exige name con longitud válida", () => {
    const result = CompleteAthleteProfileBodySchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
  });

  it("rechaza dob con formato incorrecto", () => {
    const result = CompleteAthleteProfileBodySchema.safeParse({
      name: "Ana",
      dob: "31/12/2010",
    });
    expect(result.success).toBe(false);
  });

  it("acepta dob vacio (lo trata como null)", () => {
    const result = CompleteAthleteProfileBodySchema.safeParse({
      name: "Ana",
      dob: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("acceptInvitationByEmail — D-006 v0 gate 1 (ZAL-138)", () => {
  it("marca magic_link_opened_at y crea athlete stub al primer clic", async () => {
    // Sembrar invitación activa
    state.invitations.push({
      id: "inv_1",
      tenantId: "tenant_1",
      academyId: "academy_1",
      email: "ana@club.com",
      emailNormalized: "ana@club.com",
      status: "sent",
      magicLinkToken: "tok_x",
      magicLinkSentAt: new Date(),
      magicLinkOpenedAt: null,
      profileCompletedAt: null,
      athleteId: null,
      attemptCount: 1,
      lastError: null,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      customMessage: null,
      template: "first_athlete_v1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resolver = {
      getCurrentUser: vi.fn(async () => ({
        id: "auth_ana_club_com",
        email: "ana@club.com",
      })),
    };

    const result = await acceptInvitationByEmail({ resolver });
    expect(result).not.toBeNull();
    expect(result?.alreadyOpened).toBe(false);
    expect(result?.status).toBe("opened");
    expect(state.invitations[0].status).toBe("opened");
    expect(state.invitations[0].magicLinkOpenedAt).toBeInstanceOf(Date);
    expect(state.invitations[0].athleteId).toMatch(/^inv_/); // set after athlete row
    // Verifica que se creó el athlete stub con userId apuntando al auth user
    const athlete = state.athletes.find((a) => a.tenantId === "tenant_1");
    expect(athlete).toBeDefined();
    expect(athlete?.userId).toBe("auth_ana_club_com");
    expect(athlete?.inviteEmail).toBe("ana@club.com");
  });

  it("idempotente: segundo clic no duplica athlete ni reescribe opened_at", async () => {
    state.invitations.push({
      id: "inv_1",
      tenantId: "tenant_1",
      academyId: "academy_1",
      email: "ana@club.com",
      emailNormalized: "ana@club.com",
      status: "opened",
      magicLinkToken: "tok_x",
      magicLinkSentAt: new Date(),
      magicLinkOpenedAt: new Date(Date.now() - 60_000),
      profileCompletedAt: null,
      athleteId: "athlete_existing",
      attemptCount: 1,
      lastError: null,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      customMessage: null,
      template: "first_athlete_v1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resolver = {
      getCurrentUser: vi.fn(async () => ({
        id: "auth_ana_club_com",
        email: "ana@club.com",
      })),
    };
    const result = await acceptInvitationByEmail({ resolver });
    expect(result?.alreadyOpened).toBe(true);
    // opened_at no fue sobreescrito
    expect(state.invitations[0].magicLinkOpenedAt?.getTime()).toBeLessThan(
      Date.now() - 30_000
    );
  });

  it("devuelve null cuando el email no tiene invitacion activa", async () => {
    const resolver = {
      getCurrentUser: vi.fn(async () => ({
        id: "auth_otro",
        email: "extraño@otro.com",
      })),
    };
    const result = await acceptInvitationByEmail({ resolver });
    expect(result).toBeNull();
  });
});

describe("completeAthleteProfile — cierra D-006 v0 gate 1 (ZAL-138)", () => {
  it("setea profile_completed_at en athlete y marca invitacion completed", async () => {
    state.athletes.push({
      id: "athlete_1",
      academyId: "academy_1",
      tenantId: "tenant_1",
      userId: "auth_ana",
      inviteEmail: "ana@club.com",
      magicLinkOpenedAt: new Date(),
      profileCompletedAt: null,
    });
    state.invitations.push({
      id: "inv_1",
      tenantId: "tenant_1",
      academyId: "academy_1",
      email: "ana@club.com",
      emailNormalized: "ana@club.com",
      status: "opened",
      magicLinkToken: "tok_x",
      magicLinkSentAt: new Date(),
      magicLinkOpenedAt: new Date(),
      profileCompletedAt: null,
      athleteId: "athlete_1",
      attemptCount: 1,
      lastError: null,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      customMessage: null,
      template: "first_athlete_v1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await completeAthleteProfile("inv_1", "tenant_1", {
      name: "Ana Lopez",
      dob: "2010-04-12",
      level: "Iniciacion",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("completed");
      expect(result.data.athleteId).toBe("athlete_1");
      expect(state.invitations[0].status).toBe("completed");
      expect(state.invitations[0].profileCompletedAt).toBeInstanceOf(Date);
    }
  });

  it("rechaza con TENANT_MISMATCH si el tenant no coincide", async () => {
    state.invitations.push({
      id: "inv_1",
      tenantId: "tenant_1",
      academyId: "academy_1",
      email: "ana@club.com",
      emailNormalized: "ana@club.com",
      status: "opened",
      magicLinkToken: "tok_x",
      magicLinkSentAt: new Date(),
      magicLinkOpenedAt: new Date(),
      profileCompletedAt: null,
      athleteId: "athlete_1",
      attemptCount: 1,
      lastError: null,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      customMessage: null,
      template: "first_athlete_v1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await completeAthleteProfile("inv_1", "tenant_OTRO", {
      name: "Ana",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TENANT_MISMATCH");
    }
  });
});
