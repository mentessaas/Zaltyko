import { describe, expect, it } from "vitest";
import { archiveOutcome } from "@/components/owner-dashboard/owner-archive-response";

const data = { readOnly: false, planCode: "free", resources: [
  { resource: "athletes", current: 30, limit: 30, excess: 0 },
  { resource: "groups", current: 3, limit: 3, excess: 0 },
  { resource: "classes", current: 10, limit: 10, excess: 0 },
] };
describe("acuse de archivo conservador", () => {
  it.each([{ error: "ERROR" }, { code: "ERROR" }, { type: "https://zaltyko.com/problems/error" }, { status: 409 }])("un éxito contradictorio no libera el archivo: %j", fields => {
    expect(archiveOutcome({ ok: true, status: 200 }, { ok: true, data, ...fields }).status).toBe("uncertain");
  });
  it("solo confirma con el acuse canónico de uso", () => {
    expect(archiveOutcome({ ok: true, status: 200 }, { ok: true, data }).status).toBe("confirmed");
    expect(archiveOutcome({ ok: true, status: 200 }, { ok: true, data }, { previouslyUncertain: true }).status).toBe("confirmed");
  });
  it.each([null, {}, { ok: true }, { ok: "true", data }, { ok: true, data: { ...data, resources: [] } }, { ok: false, code: "FAIL" }])("un 2xx incompleto no afirma éxito %j", payload => {
    expect(archiveOutcome({ ok: true, status: 200 }, payload).status).toBe("uncertain");
  });
  it.each([[400, "VALIDATION_ERROR"], [401, "UNAUTHENTICATED"], [403, "FORBIDDEN"], [404, "NOT_FOUND"], [409, "RESOURCE_NOT_OVER_LIMIT"]] as const)("un rechazo conocido %s/%s permite revisar antes de otro envío humano", (status, code) => {
    expect(archiveOutcome({ ok: false, status }, { ok: false, error: code, code, message: "Revisa la ficha" })).toEqual({ status: "rejected", message: "Revisa la ficha", code });
    expect(archiveOutcome({ ok: false, status }, { ok: false, error: code, code, message: "Revisa la ficha" }, { previouslyUncertain: true }).status).toBe("uncertain");
  });
  it.each([
    [404, "NOT_FOUND", true],
    [409, "RESOURCE_NOT_OVER_LIMIT", true],
    [429, "RATE_LIMIT_EXCEEDED", false],
  ] as const)("expone el código y destino de refresh correcto para %s/%s", (status, code, shouldRefreshUsage) => {
    const payload = status === 429
      ? { error: code, message: "Espera antes de reintentar" }
      : { ok: false, error: code, code, message: "Revisa la ficha" };
    const outcome = archiveOutcome({ ok: false, status }, payload);
    expect(outcome).toMatchObject({ status: "rejected", code });
    const outcomeCode = outcome.status === "rejected" ? outcome.code : "";
    expect(["NOT_FOUND", "RESOURCE_NOT_OVER_LIMIT"].includes(outcomeCode)).toBe(shouldRefreshUsage);
  });
  it("reconoce el contrato específico del rate limiter sin eludirlo", () => {
    expect(archiveOutcome({ ok: false, status: 429 }, { error: "RATE_LIMIT_EXCEEDED", message: "Espera antes de reintentar" })).toEqual({ status: "rejected", message: "Espera antes de reintentar", code: "RATE_LIMIT_EXCEEDED" });
    expect(archiveOutcome({ ok: false, status: 429 }, { error: "RATE_LIMIT_EXCEEDED", message: "Espera antes de reintentar" }, { previouslyUncertain: true }).status).toBe("uncertain");
  });
  it.each([408, 500, 502, 503, 504])("un %s no demuestra que la operación no se aplicó", status => {
    expect(archiveOutcome({ ok: false, status }, { ok: false, code: "TIMEOUT", message: "Error" }).status).toBe("uncertain");
  });
  it.each([null, {}, { ok: false }, { ok: false, code: {} }, { ok: true, code: "FAIL" }])("un 4xx sin rechazo canónico conserva la solicitud %j", payload => {
    expect(archiveOutcome({ ok: false, status: 403 }, payload).status).toBe("uncertain");
  });
  it.each([
    [409, { ok: false, error: "IDEMPOTENCY_CONFLICT", code: "IDEMPOTENCY_CONFLICT", message: "Conflicto" }],
    [403, { ok: false, error: "NEW_ERROR", code: "NEW_ERROR", message: "Error" }],
    [403, { ok: false, error: "VALIDATION_ERROR", code: "VALIDATION_ERROR", message: "Error" }],
    [403, { ok: false, error: "RESOURCE_NOT_OVER_LIMIT", code: "RESOURCE_NOT_OVER_LIMIT", message: "Error" }],
    [404, { ok: false, error: "FORBIDDEN", code: "NOT_FOUND", message: "Error" }],
    [404, { ok: false, code: "NOT_FOUND", message: "Error" }],
    [404, { ok: false, error: "NOT_FOUND", code: "NOT_FOUND", message: " " }],
    [404, { ok: false, error: "NOT_FOUND", code: "NOT_FOUND", message: "Error", data }],
    [429, { error: "RATE_LIMIT_EXCEEDED", message: " " }],
    [429, { ok: true, error: "RATE_LIMIT_EXCEEDED", message: "Espera" }],
    [429, { error: "RATE_LIMIT_EXCEEDED", code: "UNKNOWN", message: "Espera" }],
    [429, { error: "RATE_LIMIT_EXCEEDED", status: 403, message: "Espera" }],
    [404, { ok: false, error: "NOT_FOUND", code: "NOT_FOUND", status: 403, message: "Error" }],
  ] as const)("un rechazo desconocido o contradictorio no libera la intención %#", (status, payload) => {
    expect(archiveOutcome({ ok: false, status }, payload).status).toBe("uncertain");
  });
  it("no acepta ok y HTTP contradictorios", () => {
    expect(archiveOutcome({ ok: true, status: 404 }, { ok: true, data }).status).toBe("uncertain");
    expect(archiveOutcome({ ok: true, status: 404 }, { ok: false, error: "NOT_FOUND", code: "NOT_FOUND", message: "Error" }).status).toBe("uncertain");
  });
  it("un código desconocido sin estado HTTP no se confunde con un rechazo conocido", () => {
    expect(archiveOutcome({ ok: false, status: undefined as unknown as number }, { ok: false, error: "UNKNOWN", code: "UNKNOWN", message: "Error" }).status).toBe("uncertain");
  });
});
