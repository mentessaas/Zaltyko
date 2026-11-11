import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

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
      code: "CONCURRENCY_RETRY",
      status: 409,
      details: { retryable: true },
    });
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("la emisión mensual no adopta el 409 sin revisar su gestor", () => {
  it("nada de billing ni de la pantalla de cuotas mensuales importa este helper", () => {
    // El gestor de cuotas mensuales trata cualquier 4xx del primer intento como
    // definitivo y descarta la orden pendiente; por eso allí CONCURRENCY_RETRY
    // es 503 (monthly-invoice/errors.ts). Si hace falta unificarlo, primero hay
    // que cambiar ese gestor y su prueba, y después actualizar esta lista.
    const roots = [join(process.cwd(), "src/modules/billing"), join(process.cwd(), "src/components/owner-dashboard")];
    const offenders = roots
      .flatMap(sourceFiles)
      .filter((file) => !/owner-dashboard\//.test(file) || /MonthlyInvoice|monthly-invoice/i.test(file))
      .filter((file) => readFileSync(file, "utf8").includes("retryable-db-conflict"))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
    expect(readFileSync(join(process.cwd(), "src/modules/billing/application/monthly-invoice/errors.ts"), "utf8")).toMatch(
      /"CONCURRENCY_RETRY",[\s\S]*?503/
    );
  });
});

