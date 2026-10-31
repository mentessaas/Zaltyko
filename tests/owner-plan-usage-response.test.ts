import { describe, expect, it } from "vitest";
import { decodeOwnerUsage } from "@/components/owner-dashboard/owner-plan-usage-response";

const usage = {
  readOnly: true, planCode: "free",
  resources: [
    { resource: "athletes", current: 31, limit: 30, excess: 1 },
    { resource: "groups", current: 4, limit: 3, excess: 1 },
    { resource: "classes", current: 11, limit: 10, excess: 1 },
  ],
  items: [{ id: "synthetic-item", name: "Ficha sintética" }], next: null,
};
const payload = (data: unknown = usage) => ({ ok: true, data });
describe("respuesta de uso validada sin resolver derechos en el cliente", () => {
  it("conserva exactamente el readOnly, límites y exceso del servidor cuando son coherentes", () => {
    expect(decodeOwnerUsage(payload())).toEqual(usage);
  });
  it("admite cero, sin límite y página vacía confirmados", () => {
    const data = { ...usage, readOnly: false, items: [], resources: usage.resources.map(item => ({ ...item, current: 0, limit: null, excess: 0 })) };
    expect(decodeOwnerUsage(payload(data))).toEqual(data);
  });
  it("proyecta solo campos usados, sin mutar el payload", () => {
    const original = payload({ ...usage, extra: "not rendered", items: [{ ...usage.items[0], private: "not rendered" }] });
    const before = JSON.stringify(original);
    expect(decodeOwnerUsage(original)).toEqual(usage);
    expect(JSON.stringify(original)).toBe(before);
  });
  it.each([null, {}, [], { ok: false, data: usage }, { ok: "true", data: usage }, { ok: true, data: null }])("rechaza envoltorio inválido %j", input => {
    expect(decodeOwnerUsage(input)).toBeNull();
  });
  it.each([
    { readOnly: "false" }, { planCode: " " }, { planCode: {} },
    { resources: [] }, { resources: usage.resources.slice(0, 2) },
    { resources: [usage.resources[0], usage.resources[0], usage.resources[2]] },
    { items: null }, { items: [{ id: "x", name: {} }] }, { items: [{ id: "", name: "A" }] },
    { items: [usage.items[0], usage.items[0]] }, { next: "" }, { next: 1 }, { next: undefined },
  ])("rechaza datos incompletos en vez de mostrarlos como uso confirmado %j", override => {
    expect(decodeOwnerUsage(payload({ ...usage, ...override }))).toBeNull();
  });
  it.each([
    { current: -1 }, { current: 0.5 }, { current: "31" }, { current: NaN },
    { current: Infinity }, { current: Number.MAX_SAFE_INTEGER + 1 },
    { limit: -1 }, { limit: "30" }, { excess: -1 }, { excess: {} }, { resource: "unknown" },
  ])("rechaza valores de recurso no renderizables %j", override => {
    expect(decodeOwnerUsage(payload({ ...usage, resources: [{ ...usage.resources[0], ...override }, ...usage.resources.slice(1)] }))).toBeNull();
  });
  it.each([
    { readOnly: false },
    { resources: usage.resources.map(item => ({ ...item, current: item.limit ?? 0, excess: 0 })) },
    { resources: usage.resources.map(item => ({ ...item, excess: 7 })) },
    { resources: usage.resources.map(item => ({ ...item, limit: null, excess: 1 })) },
  ])("rechaza contradicciones entre uso, exceso y solo lectura %j", override => {
    expect(decodeOwnerUsage(payload({ ...usage, ...override }))).toBeNull();
  });
  it("conserva el cursor del servidor sin inventar paginación", () => {
    expect(decodeOwnerUsage(payload({ ...usage, next: "synthetic-next" }))?.next).toBe("synthetic-next");
  });
});
