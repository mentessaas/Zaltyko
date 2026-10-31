import { describe, expect, it } from "vitest";
import { enrollmentCandidates, enrollmentLookupError, enrollmentPricePlans } from "@/components/owner-dashboard/owner-enrollment-lookups";

const scope = { organizationId: "synthetic-org", locationId: "synthetic-site" };
const plan = { id: "synthetic-price", name: "Tarifa sintética", amountCents: 3500, currency: "EUR", cadence: "monthly" };
const plans = (items: unknown) => ({ ok: true, data: { ...scope, items } });

describe("decodificación de consultas de inscripción", () => {
  it("acepta una lista vacía confirmada, no la confunde con un error", () => {
    expect(enrollmentCandidates({ ok: true, data: { items: [] } })).toEqual([]);
    expect(enrollmentPricePlans(plans([]), scope)).toEqual([]);
  });
  it("proyecta solo los datos de candidato esperados", () => {
    expect(enrollmentCandidates({ ok: true, data: { items: [{ id: "a", name: "Sintética", ignored: "extra" }] } })).toEqual([{ id: "a", name: "Sintética" }]);
  });
  it.each([null, {}, { ok: false, data: { items: [] } }, { ok: true, data: { items: null } }, { ok: true, data: { items: [{ id: "a", name: {} }] } }, { ok: true, data: { items: [{ id: "", name: "A" }] } }])("no inventa candidatos ante datos inválidos: %j", payload => {
    expect(enrollmentCandidates(payload)).toBeNull();
  });
  it("conserva importe y moneda recibidos sin recalcularlos", () => {
    expect(enrollmentPricePlans(plans([plan]), scope)).toEqual([plan]);
  });
  it.each([{ organizationId: "other", locationId: scope.locationId }, { organizationId: scope.organizationId, locationId: "other" }])("rechaza tarifas de otro alcance: %j", other => {
    expect(enrollmentPricePlans(plans([plan]), other)).toBeNull();
  });
  it.each([{ amountCents: "3500" }, { amountCents: -1 }, { amountCents: 3.5 }, { amountCents: NaN }, { amountCents: Number.MAX_SAFE_INTEGER + 1 }, { cadence: "annual" }, { currency: "" }])("rechaza una tarifa incompleta sin transformarla en cero: %j", change => {
    expect(enrollmentPricePlans(plans([{ ...plan, ...change }]), scope)).toBeNull();
  });
  it("no acepta tarifas de una respuesta fallida aunque contenga data", () => {
    expect(enrollmentPricePlans({ ...plans([plan]), ok: false }, scope)).toBeNull();
  });
  it("mantiene el detalle del contrato Problem o mensaje de API", () => {
    expect(enrollmentLookupError({ detail: "Selecciona sede y clase.", message: "otro" }, "fallback")).toBe("Selecciona sede y clase.");
    expect(enrollmentLookupError({ message: "Consulta limitada." }, "fallback")).toBe("Consulta limitada.");
  });
  it.each([null, { detail: {} }, { message: "" }])("usa un error de consulta, no de guardado, si no hay detalle: %j", payload => {
    expect(enrollmentLookupError(payload, "No se pudo consultar.")).toBe("No se pudo consultar.");
  });
});
