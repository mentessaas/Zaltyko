import { describe, expect, it } from "vitest";

import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  isRetryableDbConflict,
  retryableDbConflictError,
} from "@/modules/shared/infrastructure/retryable-db-conflict";

/**
 * Helper compartido por Pasar lista y la asignación de entrenadoras. La
 * traducción de punta a punta del servicio de asignación (inAssignmentTransaction)
 * la prueba tests/coach-assignment-routes-db-conflicts.test.ts con el servicio
 * real y la transacción abortando como PostgreSQL.
 */
describe("conflictos reintentables de PostgreSQL", () => {
  const wrapped = (code: string) =>
    Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("deadlock detected"), { code }) });

  it.each(["40P01", "40001", "55P03"])("reconoce %s directo y envuelto en cause (Drizzle)", (code) => {
    expect(isRetryableDbConflict(Object.assign(new Error("x"), { code }))).toBe(true);
    expect(isRetryableDbConflict(wrapped(code))).toBe(true);
  });

  it("no confunde otros errores", () => {
    expect(isRetryableDbConflict(wrapped("23505"))).toBe(false);
    expect(isRetryableDbConflict(new Error("sin código"))).toBe(false);
    expect(isRetryableDbConflict(null)).toBe(false);
    expect(isRetryableDbConflict("40P01")).toBe(false);
  });

  it("construye un 409 reintentable", () => {
    const error = retryableDbConflictError("Vuelve a intentarlo.");
    expect(error).toBeInstanceOf(OperationalError);
    expect({ code: error.code, status: error.status, details: error.details }).toEqual({
      code: "VERSION_CONFLICT",
      status: 409,
      details: { retryable: true },
    });
  });
});
