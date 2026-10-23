import { describe, expect, it } from "vitest";
import {
  clearStoredHealthTargetCommand,
  healthTargetCommandStorageKey,
  isCanonicalHealthTargetRejection,
  persistHealthTargetCommand,
  readStoredHealthTargetCommand,
  validHealthTargetReceipt,
  type HealthScoreTargets,
  type StoredHealthTargetCommand,
} from "@/components/owner-dashboard/owner-health-target-command";

const organizationA = "90000000-0000-4000-8000-000000000001";
const organizationB = "90000000-0000-4000-8000-000000000002";
const commandKey = "90000000-0000-4000-8000-000000000010";
const profileId = "90000000-0000-4000-8000-000000000011";

const targets: HealthScoreTargets = {
  class_fill_rate: 0.75,
  cohort_retention_rate: 0.8,
  churn_rate: 0.1,
  collection_rate: 0.95,
  attendance_coverage: 0.9,
};

function createCommand(
  organizationId = organizationA,
  commandTargets = targets,
  key = commandKey
): StoredHealthTargetCommand {
  return {
    organizationId,
    key,
    body: JSON.stringify({ organizationId, targets: commandTargets }),
    targets: commandTargets,
  };
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe("comando pendiente de metas del Health Score", () => {
  it("guarda y recupera el body exacto sin duplicar los targets", () => {
    const storage = createStorage();
    const command = createCommand();

    expect(persistHealthTargetCommand(storage, command)).toBe(true);
    expect(
      JSON.parse(storage.getItem(healthTargetCommandStorageKey(organizationA))!)
    ).toEqual({
      version: 1,
      organizationId: organizationA,
      key: commandKey,
      body: command.body,
    });
    expect(readStoredHealthTargetCommand(storage, organizationA)).toEqual({
      status: "pending",
      command,
    });
  });

  it("aísla el estado por academia y no permite borrar una orden distinta", () => {
    const storage = createStorage();
    const command = createCommand();

    expect(persistHealthTargetCommand(storage, command)).toBe(true);
    expect(readStoredHealthTargetCommand(storage, organizationB)).toEqual({
      status: "empty",
    });
    expect(
      clearStoredHealthTargetCommand(storage, {
        ...command,
        body: JSON.stringify({ organizationId: organizationA, targets: { ...targets, class_fill_rate: 0.5 } }),
      })
    ).toBe(false);
    expect(readStoredHealthTargetCommand(storage, organizationA)).toEqual({
      status: "pending",
      command,
    });
    expect(clearStoredHealthTargetCommand(storage, command)).toBe(true);
    expect(readStoredHealthTargetCommand(storage, organizationA)).toEqual({
      status: "empty",
    });
  });

  it("no sobrescribe una orden válida distinta que sigue pendiente", () => {
    const storage = createStorage();
    const original = createCommand();
    const different = createCommand(
      organizationA,
      { ...targets, class_fill_rate: 0.5 },
      "90000000-0000-4000-8000-000000000012"
    );

    expect(persistHealthTargetCommand(storage, original)).toBe(true);
    expect(persistHealthTargetCommand(storage, different)).toBe(false);
    expect(readStoredHealthTargetCommand(storage, organizationA)).toEqual({
      status: "pending",
      command: original,
    });
  });

  it.each(["{", JSON.stringify({
    version: 1,
    organizationId: organizationA,
    key: commandKey,
    body: JSON.stringify({ organizationId: organizationB, targets }),
  })])("rechaza estado malformado o de otra academia: %s", (raw) => {
    const storage = createStorage();
    storage.setItem(healthTargetCommandStorageKey(organizationA), raw);

    expect(readStoredHealthTargetCommand(storage, organizationA)).toEqual({
      status: "invalid",
    });
    expect(persistHealthTargetCommand(storage, createCommand())).toBe(false);
  });

  it("solo libera un rechazo canónico del primer envío", () => {
    const problem = {
      type: "https://zaltyko.com/problems/idempotency-conflict",
      title: "Conflicto de versión o estado",
      status: 409,
      detail: "La solicitud no se aplicó.",
    };

    expect(isCanonicalHealthTargetRejection(409, problem, false)).toBe(true);
    expect(isCanonicalHealthTargetRejection(409, problem, true)).toBe(false);
    expect(isCanonicalHealthTargetRejection(403, problem, false)).toBe(false);
    expect(
      isCanonicalHealthTargetRejection(409, { ...problem, detail: " " }, false)
    ).toBe(false);
  });

  it("acepta solo el recibo directo completo", () => {
    expect(
      validHealthTargetReceipt({ profileId, version: 2, replayed: true })
    ).toBe(true);
    expect(validHealthTargetReceipt({ version: 2, replayed: true })).toBe(false);
    expect(
      validHealthTargetReceipt({ profileId, version: 2, replayed: true, ok: true })
    ).toBe(false);
  });

  it("falla cerrado si el almacenamiento no está disponible", () => {
    let wrote = false;
    let removed = false;
    const storage = {
      getItem() {
        throw new Error("storage blocked");
      },
      setItem() {
        wrote = true;
      },
      removeItem() {
        removed = true;
      },
    };

    expect(readStoredHealthTargetCommand(storage, organizationA)).toEqual({
      status: "unavailable",
    });
    expect(persistHealthTargetCommand(storage, createCommand())).toBe(false);
    expect(
      clearStoredHealthTargetCommand(storage, createCommand())
    ).toBe(false);
    expect(wrote).toBe(false);
    expect(removed).toBe(false);
  });
});
