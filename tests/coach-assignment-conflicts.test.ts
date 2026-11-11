import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import { setClassCoaches, setSessionCoaches } from "@/modules/coach-assignment/application/coach-assignment-service";

/**
 * Un interbloqueo (40P01) o un fallo de serialización (40001) de PostgreSQL
 * nunca llega como 500: se responde 409 reintentable. Drizzle envuelve el
 * error original en `cause`.
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

function pgFailure(code: string) {
  return Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("deadlock detected"), { code }) });
}

beforeEach(() => mocks.transaction.mockReset());

describe("conflictos de PostgreSQL en la asignación", () => {
  it.each(["40P01", "40001", "55P03"])("%s en titulares se traduce a 409 reintentable", async (code) => {
    mocks.transaction.mockRejectedValue(pgFailure(code));
    await expect(setClassCoaches({ actor, classTemplateId: TARGET, command })).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
      details: { retryable: true },
    });
  });

  it("40P01 en una sustitución también es 409", async () => {
    mocks.transaction.mockRejectedValue(Object.assign(new Error("deadlock detected"), { code: "40P01" }));
    await expect(setSessionCoaches({ actor, sessionId: TARGET, command: { ...command, reason: null } })).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
  });

  it("cualquier otro error de base de datos no se disfraza", async () => {
    const failure = pgFailure("23505");
    mocks.transaction.mockRejectedValue(failure);
    await expect(setClassCoaches({ actor, classTemplateId: TARGET, command })).rejects.toBe(failure);
  });
});
