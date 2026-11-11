import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import { setClassCoaches, setSessionCoaches } from "@/modules/coach-assignment/application/coach-assignment-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { isRetryableDbConflict } from "@/modules/shared/infrastructure/retryable-db-conflict";

/**
 * Un interbloqueo (40P01), un fallo de serialización (40001) o un cerrojo no
 * disponible (55P03) de PostgreSQL nunca llega como 500: se responde 409
 * reintentable. Drizzle envuelve el error original en `cause`.
 *
 * El error se crea dentro de la transacción simulada (como haría PostgreSQL)
 * y se captura explícitamente, sin promesas rechazadas creadas de antemano.
 */
const ORG = "a0000000-0000-4000-8000-000000000001";
const SITE = "a0000000-0000-4000-8000-000000000002";
const TARGET = "a0000000-0000-4000-8000-000000000003";
const actor = { userId: "a0000000-0000-4000-8000-000000000004", memberId: "a0000000-0000-4000-8000-000000000005" };
const command = {
  organizationId: ORG,
  locationId: SITE,
  clientRequestId: "a0000000-0000-4000-8000-000000000006",
  staffProfileIds: [],
  expectedStaffProfileIds: [],
};

function drizzleFailure(code: string): Error {
  const cause = Object.assign(new Error("deadlock detected"), { code });
  return Object.assign(new Error("Failed query"), { cause });
}

function failTransactionWith(build: () => Error): { thrown: () => Error | undefined } {
  let thrown: Error | undefined;
  mocks.transaction.mockImplementation(async () => {
    thrown = build();
    throw thrown;
  });
  return { thrown: () => thrown };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("La operación debía fallar");
}

beforeEach(() => mocks.transaction.mockReset());

describe("conflictos de PostgreSQL en la asignación", () => {
  it("reconoce el código en el error o en su causa", () => {
    expect(isRetryableDbConflict(drizzleFailure("40P01"))).toBe(true);
    expect(isRetryableDbConflict(Object.assign(new Error("x"), { code: "40001" }))).toBe(true);
    expect(isRetryableDbConflict(drizzleFailure("23505"))).toBe(false);
    expect(isRetryableDbConflict(new Error("sin código"))).toBe(false);
    expect(isRetryableDbConflict(null)).toBe(false);
  });

  it.each(["40P01", "40001", "55P03"])("%s en titulares se traduce a 409 reintentable", async (code) => {
    failTransactionWith(() => drizzleFailure(code));
    const error = await caught(setClassCoaches({ actor, classTemplateId: TARGET, command }));
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(OperationalError);
    const operational = error as OperationalError;
    expect(operational.code).toBe("VERSION_CONFLICT");
    expect(operational.status).toBe(409);
    expect(operational.details).toEqual({ retryable: true });
  });

  it("40P01 en una sustitución también es 409", async () => {
    failTransactionWith(() => Object.assign(new Error("deadlock detected"), { code: "40P01" }));
    const error = await caught(setSessionCoaches({ actor, sessionId: TARGET, command: { ...command, reason: null } }));
    expect(error).toBeInstanceOf(OperationalError);
    expect((error as OperationalError).code).toBe("VERSION_CONFLICT");
    expect((error as OperationalError).status).toBe(409);
  });

  it("cualquier otro error de base de datos no se disfraza", async () => {
    const failure = failTransactionWith(() => drizzleFailure("23505"));
    const error = await caught(setClassCoaches({ actor, classTemplateId: TARGET, command }));
    expect(error).not.toBeInstanceOf(OperationalError);
    expect(error).toBe(failure.thrown());
  });
});
