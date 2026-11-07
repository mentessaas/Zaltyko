import { describe, expect, it } from "vitest";
import { enrollmentCommandOutcome } from "@/components/owner-dashboard/owner-enrollment-command-response";

const data = { id: "10000000-0000-4000-8000-000000000004", status: "pending", version: 1, startsOn: "2026-10-22", pricePlanId: null };
const expectedCreateBody = JSON.stringify({ organizationId: "10000000-0000-4000-8000-000000000001", locationId: "10000000-0000-4000-8000-000000000002", athleteId: "10000000-0000-4000-8000-000000000005", classTemplateId: "10000000-0000-4000-8000-000000000003", startsOn: "2026-10-22", pricePlanId: null });
const expectedIdempotencyKey = "synthetic-idempotency-key";
const createContext = { expectedCreateBody, expectedIdempotencyKey };
const createdData = (overrides: Record<string, unknown> = {}) => ({ ...data, ...overrides, commandReceipt: { idempotencyKey: expectedIdempotencyKey, body: expectedCreateBody } });
describe("acuse de escritura de inscripción", () => {
  it.each([{ error: "OTHER_ERROR" }, { code: "OTHER_ERROR" }])("un Problem mezclado con otro error conserva la inscripción: %j", fields => {
    expect(enrollmentCommandOutcome({ ok: false, status: 409 }, { type: "https://zaltyko.com/problems/version-conflict", status: 409, title: "Conflicto", detail: "Revisa la ficha", ...fields }).status).toBe("uncertain");
  });
  it("confirma el acuse canónico de alta", () => {
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data: createdData() }, undefined, createContext).status).toBe("confirmed");
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data: createdData() }, undefined, { ...createContext, previouslyUncertain: true }).status).toBe("confirmed");
  });
  it.each([
    createdData({ startsOn: "2026-10-23" }),
    createdData({ pricePlanId: "10000000-0000-4000-8000-000000000006" }),
  ])("un acuse de alta con fecha o tarifa distinta conserva incertidumbre: %j", mismatched => {
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data: mismatched }, undefined, createContext).status).toBe("uncertain");
  });
  it("solo confirma pending inicialmente; replay incierto permite estado actual aunque cambie la tarifa", () => {
    const updated = createdData({ status: "active", version: 2, pricePlanId: "10000000-0000-4000-8000-000000000006" });
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data: updated }, undefined, createContext).status).toBe("uncertain");
    expect(enrollmentCommandOutcome({ ok: true, status: 200 }, { ok: true, data: updated }, undefined, { ...createContext, previouslyUncertain: true }).status).toBe("confirmed");
  });
  it.each([
    { idempotencyKey: "another-command-key", body: expectedCreateBody },
    { idempotencyKey: expectedIdempotencyKey, body: expectedCreateBody + " " },
  ])("un recibo divergente no confirma aunque el recurso actual sea válido: %j", commandReceipt => {
    const divergent = { ...createdData(), commandReceipt };
    expect(enrollmentCommandOutcome({ ok: true, status: 200 }, { ok: true, data: divergent }, undefined, { ...createContext, previouslyUncertain: true }).status).toBe("uncertain");
  });
  it("un replay puede devolver un estado posterior válido", () => {
    expect(enrollmentCommandOutcome({ ok: true, status: 200 }, { ok: true, data: { ...data, status: "completed", version: 9, endsOn: "2026-10-23" } }, data.id).status).toBe("confirmed");
  });
  it.each(["synthetic-enrollment", "", `${data.id}\n`])("no confirma identificadores inválidos: %j", id => {
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data: createdData({ id }) }, undefined, createContext).status).toBe("uncertain");
  });
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-10-22T00:00:00Z", "2026-10-22\n"])("conserva una fecha inicial inválida: %j", startsOn => {
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data: createdData({ startsOn }) }, undefined, createContext).status).toBe("uncertain");
  });
  it.each([undefined, "price", 1, {}])("un alta necesita la referencia de tarifa nullable válida: %j", pricePlanId => {
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data: createdData({ pricePlanId }) }, undefined, createContext).status).toBe("uncertain");
  });
  it.each([undefined, "2026-02-29", "", 1])("una transición necesita la fecha final nullable válida: %j", endsOn => {
    expect(enrollmentCommandOutcome({ ok: true, status: 200 }, { ok: true, data: { ...data, endsOn } }, data.id).status).toBe("uncertain");
  });
  it.each([{ error: "ERROR" }, { code: "ERROR" }, { type: "https://zaltyko.com/problems/error" }, { status: 409 }])("un éxito mezclado con un error no confirma: %j", fields => {
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data, ...fields }).status).toBe("uncertain");
  });
  it("acepta fechas reales bisiestas, tarifa UUID y fecha final null sin deducir políticas de acceso", () => {
    const leapBody = JSON.stringify({ organizationId: "10000000-0000-4000-8000-000000000001", locationId: "10000000-0000-4000-8000-000000000002", athleteId: "10000000-0000-4000-8000-000000000005", classTemplateId: "10000000-0000-4000-8000-000000000003", startsOn: "2028-02-29", pricePlanId: "10000000-0000-4000-8000-000000000006" });
    const leapDateContext = { expectedCreateBody: leapBody, expectedIdempotencyKey };
    const leapData = { ...data, startsOn: "2028-02-29", pricePlanId: "10000000-0000-4000-8000-000000000006", commandReceipt: { idempotencyKey: expectedIdempotencyKey, body: leapBody } };
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, { ok: true, data: leapData }, undefined, leapDateContext).status).toBe("confirmed");
    expect(enrollmentCommandOutcome({ ok: true, status: 200 }, { ok: true, data: { ...data, endsOn: null } }, data.id).status).toBe("confirmed");
  });
  it("no confirma una transición con id ajeno", () => {
    expect(enrollmentCommandOutcome({ ok: true, status: 200 }, { ok: true, data }, "other").status).toBe("uncertain");
  });
  it.each([null, {}, { data }, { ok: true, data: { id: "x" } }, { ok: false, data }, { ok: "true", data },
    { ok: true, data: { ...data, version: 0 } }, { ok: true, data: { ...data, version: "1" } },
    { ok: true, data: { ...data, status: "unknown" } }, { ok: true, data: { ...data, startsOn: "" } },
  ])("un acuse incompleto conserva la intención %j", payload => {
    expect(enrollmentCommandOutcome({ ok: true, status: 201 }, payload).status).toBe("uncertain");
  });
  it.each([
    [401, "authentication-required"], [400, "invalid-enrollment-command"], [400, "invalid-enrollment-transition"],
    [403, "forbidden"], [403, "location-scope-denied"], [404, "not-found"],
    [409, "version-conflict"], [409, "invalid-state-transition"], [409, "capacity-full"],
    [409, "plan-over-capacity"], [409, "duplicate-open-enrollment"], [409, "invalid-date-range"],
    [422, "invalid-date-range"], [409, "invalid-relation"], [422, "price-plan-not-available"],
    [409, "price-assignment-exists"], [409, "price-assignment-date-conflict"],
  ] as const)("reconoce el Problem canónico %s/%s", (status, type) => {
    expect(enrollmentCommandOutcome({ ok: false, status }, { type: `https://zaltyko.com/problems/${type}`, status, title: "Conflicto", detail: "Actualiza la ficha" })).toEqual({ status: "rejected", message: "Actualiza la ficha" });
    expect(enrollmentCommandOutcome({ ok: false, status }, { type: `https://zaltyko.com/problems/${type}`, status, title: "Conflicto", detail: "Actualiza la ficha" }, undefined, { previouslyUncertain: true }).status).toBe("uncertain");
  });
  it("reconoce rate limit sin reintentar automáticamente", () => {
    expect(enrollmentCommandOutcome({ ok: false, status: 429 }, { error: "RATE_LIMIT_EXCEEDED", message: "Espera" }).status).toBe("rejected");
    expect(enrollmentCommandOutcome({ ok: false, status: 429 }, { error: "RATE_LIMIT_EXCEEDED", message: "Espera" }, undefined, { previouslyUncertain: true }).status).toBe("uncertain");
  });
  it.each([408, 500, 503, 504])("conserva incertidumbre pese a un cuerpo Problem en %s", status => {
    expect(enrollmentCommandOutcome({ ok: false, status }, { type: "https://zaltyko.com/problems/error", status, title: "Error", detail: "No disponible" }).status).toBe("uncertain");
  });
  it.each([null, { status: 409, type: "other", title: "Error", detail: "Error" }, { status: 400, type: "https://zaltyko.com/problems/error", title: "Error", detail: "Error" }])("un rechazo ajeno o malformado no libera la intención %j", payload => {
    expect(enrollmentCommandOutcome({ ok: false, status: 409 }, payload).status).toBe("uncertain");
  });
  it.each([
    "idempotency-conflict", "new-error", "version-conflict?retry=1", "version-conflict#known", "version-conflict/extra", "__proto__",
  ])("un tipo desconocido o extendido conserva la intención %s", type => {
    expect(enrollmentCommandOutcome({ ok: false, status: 409 }, { status: 409, type: `https://zaltyko.com/problems/${type}`, title: "Error", detail: "Error" }).status).toBe("uncertain");
  });
  it.each([
    { status: 403 }, { type: "https://zaltyko.com/problems/plan-over-capacity", status: 403 },
    { title: " " }, { detail: " " }, { ok: true }, { data },
  ])("un Problem contradictorio conserva la intención %j", fields => {
    const payload = { status: 409, type: "https://zaltyko.com/problems/version-conflict", title: "Error", detail: "Error", ...fields };
    expect(enrollmentCommandOutcome({ ok: false, status: fields.status ?? 409 }, payload).status).toBe("uncertain");
  });
  it("no acepta un rate limit sin mensaje o mezclado con éxito", () => {
    expect(enrollmentCommandOutcome({ ok: false, status: 429 }, { error: "RATE_LIMIT_EXCEEDED" }).status).toBe("uncertain");
    expect(enrollmentCommandOutcome({ ok: false, status: 429 }, { ok: true, error: "RATE_LIMIT_EXCEEDED", message: "Espera" }).status).toBe("uncertain");
  });
  it.each([{ type: "https://zaltyko.com/problems/new-error" }, { status: 403 }, { code: "UNKNOWN" }])("un rate limit mezclado con otro error no libera la intención %j", fields => {
    expect(enrollmentCommandOutcome({ ok: false, status: 429 }, { error: "RATE_LIMIT_EXCEEDED", message: "Espera", ...fields }).status).toBe("uncertain");
  });
  it("no acepta ok y HTTP contradictorios", () => {
    expect(enrollmentCommandOutcome({ ok: true, status: 409 }, { ok: true, data }).status).toBe("uncertain");
    expect(enrollmentCommandOutcome({ ok: true, status: 409 }, { status: 409, type: "https://zaltyko.com/problems/version-conflict", title: "Error", detail: "Error" }).status).toBe("uncertain");
  });
});
