import { describe, expect, it, vi } from "vitest";

import type { TransactionClient } from "@/lib/db-transactions";
import {
  AccountErasureError,
  eraseUserAccount,
  prepareAccountErasure,
  type AccountErasureDependencies,
} from "@/modules/data-rights/application/account-erasure";

/**
 * Orden y bloqueos de la supresión de cuentas sin base de datos. El efecto de
 * las claves foráneas se prueba en tests/account-erasure-pg.test.ts.
 */

type Rows = Record<string, unknown>[];

/** Texto de una consulta Drizzle (fragmentos, identificadores y SQL anidado). */
function render(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks;
  if (!chunks) return "?";
  return chunks
    .map((chunk) => {
      if (chunk && typeof chunk === "object") {
        if ("queryChunks" in chunk) return render(chunk);
        if ("value" in chunk) {
          const value = (chunk as { value: unknown }).value;
          return Array.isArray(value) ? value.join("") : `"${String(value)}"`;
        }
      }
      return "?";
    })
    .join("");
}

/** Transacción falsa: `respond` decide las filas según el SQL; registra todo. */
function fakeTransaction(respond: (statement: string) => Rows) {
  const statements: string[] = [];
  const tx = {
    execute: vi.fn(async (query: unknown) => {
      const statement = render(query).replace(/\s+/g, " ").trim();
      statements.push(statement);
      return { rows: respond(statement) };
    }),
  };
  return { tx: tx as unknown as TransactionClient, statements };
}

interface Scenario {
  installed?: boolean;
  memberships?: Rows;
  blockingKeys?: Rows;
  blockingCounts?: Record<string, number>;
  owners?: Rows;
}

function scenario(options: Scenario) {
  return (statement: string): Rows => {
    if (statement.includes("as installed")) return [{ installed: options.installed ?? true }];
    if (statement.startsWith("select id::text, organization_id::text, role::text, status::text")) return options.memberships ?? [];
    if (statement.includes("as points_to")) return options.blockingKeys ?? [];
    if (statement.startsWith("select count(*)::int as total from")) {
      const table = /from (\S+)/.exec(statement)?.[1] ?? "";
      return [{ total: options.blockingCounts?.[table] ?? 0 }];
    }
    if (statement.startsWith("select organization_id::text, user_id::text")) return options.owners ?? [];
    if (statement.startsWith("update zaltyko.organization_members")) {
      return (options.memberships ?? [])
        .filter((row) => row.status !== "revoked")
        .map((row) => ({ ...row, status: "revoked" }));
    }
    if (statement.startsWith("update zaltyko.organization_member_invitations")) return [{ id: "i1" }];
    if (statement.startsWith("update public.directory_claims")) return [{ id: "c1" }];
    if (statement.startsWith("update public.directory_subscriptions")) return [{ id: "s1" }, { id: "s2" }];
    return [];
  };
}

const writes = (statements: string[]) => statements.filter((statement) => /^(update|insert|delete)\b/i.test(statement));

describe("prepareAccountErasure", () => {
  it("falla cerrada (503) sin el candidato y no escribe", async () => {
    const { tx, statements } = fakeTransaction(scenario({ installed: false }));
    await expect(prepareAccountErasure(tx, { userId: "u1", profileId: "p1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_NOT_AVAILABLE",
      status: 503,
    });
    expect(writes(statements)).toEqual([]);
  });

  it("pone lock_timeout y bloquea el perfil y las pertenencias antes de comprobar nada", async () => {
    const { tx, statements } = fakeTransaction(scenario({}));
    await prepareAccountErasure(tx, { userId: "u1", profileId: "p1", actorUserId: "admin" });
    expect(statements[0]).toBe("set local lock_timeout = '5s'");
    const profileLock = statements.findIndex((statement) => statement.startsWith("select id from public.profiles") && statement.endsWith("for update"));
    const membershipLock = statements.findIndex((statement) => statement.startsWith("select id::text, organization_id::text") && statement.endsWith("for update"));
    const blockingCheck = statements.findIndex((statement) => statement.includes("as points_to"));
    expect(profileLock).toBeGreaterThan(0);
    expect(membershipLock).toBeGreaterThan(profileLock);
    expect(blockingCheck).toBeGreaterThan(membershipLock);
  });

  it("rechaza (409) una cuenta que firmó decisiones de conciliación SaaS, antes de revocar nada", async () => {
    const { tx, statements } = fakeTransaction(scenario({
      memberships: [{ id: "m1", organization_id: "o1", role: "coach", status: "active" }],
      blockingKeys: [{ schema_name: "zaltyko", table_name: "organization_saas_webhook_reconciliation_decisions", column_name: "actor_user_id", points_to: "user" }],
      blockingCounts: { '"zaltyko"."organization_saas_webhook_reconciliation_decisions"': 2 },
    }));
    await expect(prepareAccountErasure(tx, { userId: "u1", profileId: "p1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_RETAINED_BILLING_EVIDENCE",
      status: 409,
    });
    expect(writes(statements)).toEqual([]);
  });

  it("rechaza (409) un perfil dueño de academias legacy, con el número de academias", async () => {
    const { tx, statements } = fakeTransaction(scenario({
      blockingKeys: [{ schema_name: "public", table_name: "academies", column_name: "owner_id", points_to: "profile" }],
      blockingCounts: { '"public"."academies"': 3 },
    }));
    await expect(prepareAccountErasure(tx, { userId: "u1", profileId: "p1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES",
      status: 409,
      details: { academies: 3 },
    });
    expect(writes(statements)).toEqual([]);
  });

  it("rechaza (409) cualquier otra referencia que bloquearía Auth, sin revocar antes", async () => {
    const { tx, statements } = fakeTransaction(scenario({
      memberships: [{ id: "m1", organization_id: "o1", role: "coach", status: "active" }],
      blockingKeys: [
        { schema_name: "storage", table_name: "objects", column_name: "owner", points_to: "user" },
        { schema_name: "public", table_name: "unrelated", column_name: "created_by", points_to: "user" },
      ],
      blockingCounts: { '"storage"."objects"': 1 },
    }));
    const error = await prepareAccountErasure(tx, { userId: "u1", profileId: "p1", actorUserId: "admin" }).catch((caught) => caught);
    expect(error).toMatchObject({ code: "ACCOUNT_ERASURE_BLOCKED_REFERENCE", status: 409, details: { references: 1 } });
    expect(error.message).toContain("storage.objects.owner");
    expect(error.message).not.toContain("public.unrelated");
    expect(writes(statements)).toEqual([]);
  });

  it("no consulta referencias al perfil si no hay perfil", async () => {
    const { tx, statements } = fakeTransaction(scenario({
      blockingKeys: [{ schema_name: "public", table_name: "academies", column_name: "owner_id", points_to: "profile" }],
      blockingCounts: { '"public"."academies"': 3 },
    }));
    await expect(prepareAccountErasure(tx, { userId: "u1", profileId: null, actorUserId: "admin" })).resolves.toMatchObject({ revokedMemberships: 0 });
    expect(statements.some((statement) => statement.includes('from "public"."academies"'))).toBe(false);
    expect(statements.some((statement) => statement.startsWith("select id from public.profiles"))).toBe(false);
  });

  it("rechaza (409) dejar una academia sin dueña activa con cuenta", async () => {
    const { tx, statements } = fakeTransaction(scenario({
      memberships: [{ id: "m1", organization_id: "o1", role: "owner", status: "active" }],
      // Otra «dueña» sin cuenta (ya suprimida) no cuenta.
      owners: [{ organization_id: "o1", user_id: "u1" }, { organization_id: "o1", user_id: null }],
    }));
    await expect(prepareAccountErasure(tx, { userId: "u1", profileId: "p1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_LAST_OWNER",
      status: 409,
      details: { organizations: 1 },
    });
    expect(writes(statements)).toEqual([]);
  });

  it("revoca las pertenencias con auditoría, seudonimiza invitaciones y retira reclamaciones", async () => {
    const { tx, statements } = fakeTransaction(scenario({
      memberships: [
        { id: "m1", organization_id: "o1", role: "owner", status: "active" },
        { id: "m2", organization_id: "o2", role: "coach", status: "suspended" },
      ],
      owners: [{ organization_id: "o1", user_id: "u1" }, { organization_id: "o1", user_id: "u2" }],
    }));
    await expect(prepareAccountErasure(tx, { userId: "u1", profileId: "p1", actorUserId: "admin" })).resolves.toEqual({
      revokedMemberships: 2,
      organizations: 2,
      pseudonymizedInvitations: 1,
      withdrawnDirectoryClaims: 1,
      withdrawnDirectorySubscriptions: 2,
    });
    const subscriptions = statements.find((statement) => statement.startsWith("update public.directory_subscriptions"))!;
    expect(subscriptions).toContain("set withdrawn_at = now() where withdrawn_at is null");
    expect(subscriptions).toContain("lower(email) = (select lower(email) from auth.users where id = ?::uuid)");
    expect(statements.filter((statement) => statement.startsWith("insert into zaltyko.audit_log"))).toHaveLength(2);
    const invitation = statements.find((statement) => statement.startsWith("update zaltyko.organization_member_invitations"))!;
    expect(invitation).toContain("normalized_email = 'cuenta-suprimida+' || id::text || '@zaltyko.invalid'");
    expect(invitation).toContain("where accepted_by_user_id = ?::uuid and status = 'accepted'");
    // Nunca borra pertenencias ni escribe en la cuenta de Auth (solo lee su email).
    expect(statements.some((statement) => /^delete\b/i.test(statement) || /\b(?:delete from|update|insert into) auth\.users\b/i.test(statement))).toBe(false);
  });
});

function dependencies(overrides: Partial<AccountErasureDependencies> = {}) {
  const calls: string[] = [];
  const deps: AccountErasureDependencies = {
    transaction: async () => {
      calls.push("transaction");
      return { revokedMemberships: 1, organizations: 1, pseudonymizedInvitations: 0, withdrawnDirectoryClaims: 0, withdrawnDirectorySubscriptions: 0 } as never;
    },
    deleteAuthAccount: async () => {
      calls.push("auth");
    },
    deleteLegacyProfile: async () => {
      calls.push("profile");
    },
    ...overrides,
  };
  return { deps, calls };
}

const pgError = (code: string) => Object.assign(new Error(`pg ${code}`), { code });

describe("eraseUserAccount", () => {
  it("revoca (transacción), borra la cuenta de Auth y por último el perfil legacy", async () => {
    const { deps, calls } = dependencies();
    await expect(eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" })).resolves.toMatchObject({
      revokedMemberships: 1,
    });
    expect(calls).toEqual(["transaction", "auth", "profile"]);
  });

  it("si Auth falla, devuelve un error reintentable y no borra el perfil", async () => {
    const authFailure = new Error("auth down");
    const { deps, calls } = dependencies({
      deleteAuthAccount: async () => {
        throw authFailure;
      },
    });
    const error = await eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(AccountErasureError);
    expect(error).toMatchObject({ code: "ACCOUNT_ERASURE_AUTH_FAILED", status: 502, underlying: authFailure });
    expect(calls).toEqual(["transaction"]);
  });

  it.each(["40P01", "55P03"])("convierte %s (supresiones simultáneas) en 409 reintentable sin tocar Auth", async (code) => {
    const { deps, calls } = dependencies({
      transaction: async () => {
        throw Object.assign(new Error("Failed query"), { cause: pgError(code) });
      },
    });
    await expect(eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_CONCURRENT",
      status: 409,
    });
    expect(calls).toEqual([]);
  });

  it("deja pasar los demás errores de la transacción", async () => {
    const boom = pgError("XX000");
    const { deps } = dependencies({
      transaction: async () => {
        throw boom;
      },
    });
    await expect(eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" })).rejects.toBe(boom);
  });

  it("si el perfil quedó enlazado (23503) responde 409 con un motivo claro", async () => {
    const { deps, calls } = dependencies({
      deleteLegacyProfile: async () => {
        throw Object.assign(new Error("Failed query"), { cause: pgError("23503") });
      },
    });
    await expect(eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_PROFILE_BLOCKED",
      status: 409,
    });
    expect(calls).toEqual(["transaction", "auth"]);
  });

  it("un perfil sin cuenta de Auth solo borra el perfil", async () => {
    const { deps, calls } = dependencies();
    await eraseUserAccount(deps, { profileId: "p1", userId: null, actorUserId: "admin" });
    expect(calls).toEqual(["profile"]);
  });

  it("un bloqueo de la preparación no borra la cuenta ni el perfil", async () => {
    const { deps, calls } = dependencies({
      transaction: async () => {
        throw new AccountErasureError("ACCOUNT_ERASURE_LAST_OWNER", "x", 409);
      },
    });
    await expect(eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_LAST_OWNER",
    });
    expect(calls).toEqual([]);
  });
});

describe("deleteAuthUserIfPresent", () => {
  async function withAuthError(error: unknown) {
    vi.resetModules();
    const deleteUser = vi.fn(async () => ({ data: {}, error }));
    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdminClient: () => ({ auth: { admin: { deleteUser } } }),
    }));
    const { deleteAuthUserIfPresent } = await import("@/lib/supabase/admin-operations");
    return { deleteAuthUserIfPresent, deleteUser };
  }

  it("borra la cuenta", async () => {
    const { deleteAuthUserIfPresent, deleteUser } = await withAuthError(null);
    await expect(deleteAuthUserIfPresent("u1")).resolves.toBeUndefined();
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it.each([
    ["404", { status: 404, message: "User not found" }],
    ["user_not_found", { status: 400, code: "user_not_found", message: "User not found" }],
  ])("una cuenta que ya no existe (%s) no es error", async (_label, error) => {
    const { deleteAuthUserIfPresent } = await withAuthError(error);
    await expect(deleteAuthUserIfPresent("u1")).resolves.toBeUndefined();
  });

  it.each([
    ["500", { status: 500, message: "Database error deleting user" }],
    ["403", { status: 403, code: "not_admin", message: "User not allowed" }],
  ])("cualquier otro error (%s) se propaga", async (_label, error) => {
    const { deleteAuthUserIfPresent } = await withAuthError(error);
    await expect(deleteAuthUserIfPresent("u1")).rejects.toThrow(error.message);
  });
});
