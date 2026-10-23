import { describe, expect, it, vi } from "vitest";
import {
  clearPendingGroupAthleteCreate,
  decodeGroupAthleteRecovery,
  decodePendingGroupAthleteCreate,
  persistPendingGroupAthleteCreate,
  type PendingGroupAthleteCreate,
} from "@/components/owner-dashboard/owner-pending-group-athlete";

const organizationId = "10000000-0000-4000-8000-000000000001";
const groupId = "10000000-0000-4000-8000-000000000002";
const athleteId = "10000000-0000-4000-8000-000000000003";
const membershipId = "10000000-0000-4000-8000-000000000004";
const intent: PendingGroupAthleteCreate = {
  version: 1,
  organizationId,
  groupId,
  kind: "create-athlete-and-membership",
  idempotencyKey: "owner-create-athlete:01234567",
};
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
  } as unknown as Storage;
}

describe("recuperación segura del alta de gimnasta", () => {
  it("persiste y lee solo organization, group, operation kind y key", () => {
    const storage = memoryStorage();
    expect(persistPendingGroupAthleteCreate(storage, "pending", intent)).toBe(true);
    const stored = storage.getItem("pending")!;
    expect(stored).not.toMatch(/givenName|familyName|nombre|apellidos|hash/i);
    expect(decodePendingGroupAthleteCreate(stored, organizationId, groupId)).toEqual(intent);
  });

  it("migra una clave previa sin conservar datos personales y rechaza metadatos incoherentes", () => {
    expect(decodePendingGroupAthleteCreate("old-key-01234567", organizationId, groupId)).toMatchObject({
      organizationId, groupId, idempotencyKey: "old-key-01234567",
    });
    expect(decodePendingGroupAthleteCreate(JSON.stringify({ ...intent, givenName: "Ada" }), organizationId, groupId)).toBe(false);
    expect(decodePendingGroupAthleteCreate(JSON.stringify(intent), organizationId, "10000000-0000-4000-8000-000000000099")).toBe(false);
  });

  it("rechaza metadatos sobredimensionados antes de analizarlos", () => {
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(decodePendingGroupAthleteCreate(`{${"x".repeat(1024)}`, organizationId, groupId)).toBe(false);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("solo limpia la misma clave tras confirmación y readback", () => {
    const storage = memoryStorage();
    persistPendingGroupAthleteCreate(storage, "pending", intent);
    expect(clearPendingGroupAthleteCreate(storage, "pending", { ...intent, idempotencyKey: "different-key" })).toBe(false);
    expect(clearPendingGroupAthleteCreate(storage, "pending", intent)).toBe(true);
  });

  it("no sobrescribe una operación pendiente distinta", () => {
    const storage = memoryStorage();
    storage.setItem("pending", JSON.stringify({ ...intent, idempotencyKey: "another-key-012345" }));
    expect(persistPendingGroupAthleteCreate(storage, "pending", intent)).toBe(false);
    expect(storage.getItem("pending")).toContain("another-key-012345");
  });

  it("falla cerrado si el almacenamiento no permite escribir o leer de vuelta", () => {
    const broken = {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
      removeItem: () => { throw new Error("storage unavailable"); },
    } as unknown as Storage;
    expect(persistPendingGroupAthleteCreate(broken, "pending", intent)).toBe(false);
    expect(clearPendingGroupAthleteCreate(broken, "pending", intent)).toBe(false);
  });

  it("acepta recibos completos ID-only o ausencia explícita y rechaza payloads extraños", () => {
    expect(decodeGroupAthleteRecovery({ ok: true, data: { status: "none" } })).toEqual({ status: "none" });
    expect(decodeGroupAthleteRecovery({ ok: true, data: { status: "complete", receipt: {
      id: membershipId, groupId, athleteId, startsOn: "2026-10-23", status: "active",
    } } })).toMatchObject({ status: "complete", receipt: { id: membershipId, groupId, athleteId } });
    expect(decodeGroupAthleteRecovery({ ok: true, data: { status: "complete", receipt: {
      id: membershipId, groupId, athleteId, startsOn: "2026-10-23", status: "active", athleteName: "Ada",
    } } })).toBeNull();
    expect(decodeGroupAthleteRecovery({ ok: true, data: { status: "partial" } })).toBeNull();
  });
});
