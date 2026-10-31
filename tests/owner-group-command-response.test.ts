import { describe, expect, it } from "vitest";
import { groupCommandOutcome } from "@/components/owner-dashboard/owner-group-command-response";

const id = "30000000-0000-4000-8000-000000000001";
const groupId = "30000000-0000-4000-8000-000000000002";
const athleteId = "30000000-0000-4000-8000-000000000003";
const groupCreateBody = JSON.stringify({
  organizationId: id,
  locationId: groupId,
  programId: athleteId,
  name: "Grupo",
  capacity: null,
});
const groupContext = { kind: "group" as const, commandBody: groupCreateBody };
const context = { kind: "add" as const, groupId, athleteId };
const data = { id, groupId, athleteId, startsOn: "2026-10-22", status: "active", endsOn: null };
const reply = (status: number) => ({ ok: status >= 200 && status < 300, status });
const problem = (type: string, status: number) => ({ type: `https://zaltyko.com/problems/${type}`, status, title: "Solicitud rechazada", detail: "No se ha ejecutado esta solicitud." });

describe("acuse de comandos de grupos", () => {
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"])("un tipo ajeno %s conserva incertidumbre sin lanzar excepción", type => {
    expect(groupCommandOutcome(reply(409), problem(type, 409), context).status).toBe("uncertain");
  });
  it.each(["id", "groupId", "athleteId"] as const)("un UUID con salto de línea en %s no confirma el acuse", field => {
    const changed = { ...data, [field]: `${data[field]}\n` };
    const matchingContext = { ...context, ...(field === "groupId" ? { groupId: changed.groupId } : {}), ...(field === "athleteId" ? { athleteId: changed.athleteId } : {}) };
    expect(groupCommandOutcome(reply(201), { ok: true, data: changed }, matchingContext).status).toBe("uncertain");
  });
  it.each(["id", "locationId", "programId"] as const)("un UUID inválido en %s no permite confirmar un grupo", field => {
    const group = { id, name: "Grupo", locationId: groupId, programId: athleteId, capacity: null };
    expect(groupCommandOutcome(reply(201), { ok: true, data: { ...group, [field]: `${group[field]}\n` } }, groupContext).status).toBe("uncertain");
  });
  it.each([{ error: "ERROR" }, { code: "ERROR" }, { type: "https://zaltyko.com/problems/error" }, { status: 409 }])("un éxito contradictorio no libera el grupo: %j", fields => {
    expect(groupCommandOutcome(reply(201), { ok: true, data, ...fields }, context).status).toBe("uncertain");
  });
  it.each([{ error: "OTHER_ERROR" }, { code: "OTHER_ERROR" }])("un Problem mezclado con otro error conserva el grupo: %j", fields => {
    expect(groupCommandOutcome(reply(409), { ...problem("plan-over-capacity", 409), ...fields }, context).status).toBe("uncertain");
  });
  it("admite un acuse completo del grupo y gimnasta esperados", () => {
    expect(groupCommandOutcome(reply(201), { ok: true, data }, context).status).toBe("confirmed");
  });
  it("un replay puede mostrar un estado actual más reciente", () => {
    expect(groupCommandOutcome(reply(200), { ok: true, data: { ...data, status: "ended" } }, context).status).toBe("confirmed");
  });
  it.each([
    null, { id }, { ...data, groupId: id }, { ...data, athleteId: id },
    { ...data, startsOn: "2026-02-30" }, { ...data, status: ["active"] },
    { ...data, status: "unknown" }, { ...data, id: "not-a-uuid" },
  ])("no confirma un acuse incompleto o de otro recurso (%#)", incomplete => {
    expect(groupCommandOutcome(reply(201), { ok: true, data: incomplete }, context).status).toBe("uncertain");
  });
  it("no toma un estado de error ni ok falso por confirmación", () => {
    expect(groupCommandOutcome(reply(503), { ok: true, data }, context).status).toBe("uncertain");
    expect(groupCommandOutcome(reply(201), { ok: false, data }, context).status).toBe("uncertain");
  });
  it("la transición exige el id esperado y una fecha final válida o nula", () => {
    const transition = { kind: "transition" as const, groupId, membershipId: id };
    expect(groupCommandOutcome(reply(200), { ok: true, data }, transition).status).toBe("confirmed");
    expect(groupCommandOutcome(reply(200), { ok: true, data: { ...data, id: groupId } }, transition).status).toBe("uncertain");
    expect(groupCommandOutcome(reply(200), { ok: true, data: { ...data, endsOn: "2026-02-30" } }, transition).status).toBe("uncertain");
  });
  it("valida los campos del grupo creado antes de navegar", () => {
    const group = { id, name: "Grupo", locationId: groupId, programId: athleteId, capacity: null };
    expect(groupCommandOutcome(reply(201), { ok: true, data: group }, groupContext).status).toBe("confirmed");
    expect(groupCommandOutcome(reply(201), { ok: true, data: { ...group, capacity: -1 } }, groupContext).status).toBe("uncertain");
  });
  it.each([
    ["otra sede", "locationId", id],
    ["otro programa", "programId", groupId],
    ["otro nombre", "name", "Otro grupo"],
    ["otra capacidad", "capacity", 12],
  ] as const)("un acuse válido de %s no confirma una creación distinta al comando", (_label, field, value) => {
    const group = { id, name: "Grupo", locationId: groupId, programId: athleteId, capacity: null };
    const mismatched = { ...group, [field]: value };
    expect(groupCommandOutcome(reply(201), { ok: true, data: mismatched }, groupContext).status).toBe("uncertain");
  });
  it("reconoce una precondición inicial con envelope canónico", () => {
    expect(groupCommandOutcome(reply(409), problem("plan-over-capacity", 409), context).status).toBe("rejected");
  });
  it("no descarta un conflicto idempotente ni un error de proveedor no reconocido", () => {
    expect(groupCommandOutcome(reply(409), problem("idempotency-conflict", 409), context).status).toBe("uncertain");
    expect(groupCommandOutcome(reply(400), { detail: "Error" }, context).status).toBe("uncertain");
    expect(groupCommandOutcome(reply(400), problem("invalid-group-command", 409), context).status).toBe("uncertain");
  });
  it("un rechazo posterior no acredita que el primer intento no se guardara", () => {
    const retry = { ...context, previouslyUncertain: true };
    expect(groupCommandOutcome(reply(401), problem("authentication-required", 401), retry).status).toBe("uncertain");
    expect(groupCommandOutcome(reply(409), problem("plan-over-capacity", 409), retry).status).toBe("uncertain");
    expect(groupCommandOutcome(reply(429), { error: "RATE_LIMIT_EXCEEDED", message: "Espera" }, retry).status).toBe("uncertain");
    expect(groupCommandOutcome(reply(201), { ok: true, data }, retry).status).toBe("confirmed");
  });
  it("no libera un rechazo contradictorio con data u ok", () => {
    expect(groupCommandOutcome(reply(409), { ...problem("plan-over-capacity", 409), data }, context).status).toBe("uncertain");
    expect(groupCommandOutcome(reply(409), { ...problem("plan-over-capacity", 409), ok: true }, context).status).toBe("uncertain");
  });
  it("reconoce solo el envelope de rate limit inicial sin contradicciones", () => {
    expect(groupCommandOutcome(reply(429), { error: "RATE_LIMIT_EXCEEDED", message: "Espera" }, context).status).toBe("rejected");
    expect(groupCommandOutcome(reply(429), { error: "RATE_LIMIT_EXCEEDED", message: "Espera", code: "different" }, context).status).toBe("uncertain");
  });
});
