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

/** Transacción falsa: responde en orden y registra el SQL que recibe. */
function fakeTransaction(responses: Record<string, unknown>[][]) {
  const statements: string[] = [];
  const tx = {
    execute: vi.fn(async (query: { queryChunks?: unknown[] }) => {
      const text = (query.queryChunks ?? [])
        .map((chunk) => (typeof chunk === "object" && chunk && "value" in chunk ? (chunk as { value: string[] }).value.join("") : ""))
        .join("?");
      statements.push(text.replace(/\s+/g, " ").trim());
      return { rows: responses.shift() ?? [] };
    }),
  };
  return { tx: tx as unknown as TransactionClient, statements };
}

function dependencies(overrides: Partial<AccountErasureDependencies> = {}) {
  const calls: string[] = [];
  const deps: AccountErasureDependencies = {
    transaction: async (callback) => {
      calls.push("transaction");
      return callback({} as TransactionClient);
    },
    countLegacyOwnedAcademies: async () => {
      calls.push("legacy-academies");
      return 0;
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

describe("prepareAccountErasure", () => {
  it("falla cerrada (503) sin el candidato y no escribe", async () => {
    const { tx, statements } = fakeTransaction([[{ present: true }], [{ installed: false }]]);
    await expect(prepareAccountErasure(tx, { userId: "u1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_NOT_AVAILABLE",
      status: 503,
    });
    expect(statements.some((statement) => /^(update|insert|delete)\b/i.test(statement))).toBe(false);
  });

  it("rechaza (409) una cuenta que firmó decisiones de conciliación SaaS, antes de revocar nada", async () => {
    const { tx, statements } = fakeTransaction([
      [{ present: true }],
      [{ installed: true }],
      [{ id: "m1", organization_id: "o1", role: "coach", status: "active" }],
      [{ present: true }],
    ]);
    await expect(prepareAccountErasure(tx, { userId: "u1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_RETAINED_BILLING_EVIDENCE",
      status: 409,
    });
    expect(statements).toHaveLength(4);
    expect(statements.some((statement) => /\bupdate\b/i.test(statement))).toBe(false);
  });

  it("rechaza (409) dejar una academia sin dueña activa con cuenta", async () => {
    const { tx, statements } = fakeTransaction([
      [{ present: true }],
      [{ installed: true }],
      [{ id: "m1", organization_id: "o1", role: "owner", status: "active" }],
      [{ present: false }],
      // Otra «dueña» sin cuenta (ya suprimida) no cuenta.
      [{ organization_id: "o1", user_id: "u1" }, { organization_id: "o1", user_id: null }],
    ]);
    await expect(prepareAccountErasure(tx, { userId: "u1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_LAST_OWNER",
      status: 409,
      details: { organizations: 1 },
    });
    expect(statements.some((statement) => /\bupdate zaltyko\.organization_members\b/i.test(statement))).toBe(false);
  });

  it("revoca las pertenencias, deja constancia en cada academia y retira reclamaciones pendientes", async () => {
    const { tx, statements } = fakeTransaction([
      [{ present: true }],
      [{ installed: true }],
      [
        { id: "m1", organization_id: "o1", role: "owner", status: "active" },
        { id: "m2", organization_id: "o2", role: "coach", status: "suspended" },
      ],
      [{ present: false }],
      [{ organization_id: "o1", user_id: "u1" }, { organization_id: "o1", user_id: "u2" }],
      [{ id: "m1", organization_id: "o1", status: "revoked" }, { id: "m2", organization_id: "o2", status: "revoked" }],
      [],
      [],
      [{ present: true }],
      [{ id: "c1" }],
    ]);
    await expect(prepareAccountErasure(tx, { userId: "u1", actorUserId: "admin" })).resolves.toEqual({
      revokedMemberships: 2,
      organizations: 2,
      withdrawnDirectoryClaims: 1,
    });
    expect(statements.filter((statement) => statement.startsWith("insert into zaltyko.audit_log"))).toHaveLength(2);
    expect(statements.some((statement) => statement.includes("set status = 'revoked'"))).toBe(true);
    expect(statements.some((statement) => statement.startsWith("update public.directory_claims"))).toBe(true);
    // Nunca borra pertenencias ni toca la cuenta de Auth.
    expect(statements.some((statement) => /\bdelete\b/i.test(statement) || statement.includes("auth.users where"))).toBe(false);
  });

  it("sin esquema canónico ni directorio no hace nada", async () => {
    const { tx } = fakeTransaction([[{ present: false }], [{ present: false }]]);
    await expect(prepareAccountErasure(tx, { userId: "u1", actorUserId: "admin" })).resolves.toEqual({
      revokedMemberships: 0,
      organizations: 0,
      withdrawnDirectoryClaims: 0,
    });
  });
});

describe("eraseUserAccount", () => {
  it("revoca (transacción), borra la cuenta de Auth y por último el perfil legacy", async () => {
    const { deps, calls } = dependencies({
      transaction: async () => {
        calls.push("transaction");
        return { revokedMemberships: 1, organizations: 1, withdrawnDirectoryClaims: 0 } as never;
      },
    });
    await expect(eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" })).resolves.toEqual({
      revokedMemberships: 1,
      organizations: 1,
      withdrawnDirectoryClaims: 0,
    });
    expect(calls).toEqual(["legacy-academies", "transaction", "auth", "profile"]);
  });

  it("no borra un perfil dueño de academias legacy (se perderían sus cobros y facturas)", async () => {
    const { deps, calls } = dependencies({ countLegacyOwnedAcademies: async () => 2 });
    await expect(eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" })).rejects.toMatchObject({
      code: "ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES",
      status: 409,
      details: { academies: 2 },
    });
    expect(calls).toEqual([]);
  });

  it("si Auth falla, devuelve un error reintentable y no borra el perfil", async () => {
    const authFailure = new Error("auth down");
    const { deps, calls } = dependencies({
      transaction: async () => ({ revokedMemberships: 1, organizations: 1, withdrawnDirectoryClaims: 0 }) as never,
      deleteAuthAccount: async () => {
        throw authFailure;
      },
    });
    const error = await eraseUserAccount(deps, { profileId: "p1", userId: "u1", actorUserId: "admin" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(AccountErasureError);
    expect(error).toMatchObject({ code: "ACCOUNT_ERASURE_AUTH_FAILED", status: 502, underlying: authFailure });
    expect(calls).toEqual(["legacy-academies"]);
  });

  it("un perfil sin cuenta de Auth solo borra el perfil", async () => {
    const { deps, calls } = dependencies();
    await eraseUserAccount(deps, { profileId: "p1", userId: null, actorUserId: "admin" });
    expect(calls).toEqual(["legacy-academies", "profile"]);
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
    expect(calls).toEqual(["legacy-academies"]);
  });
});
