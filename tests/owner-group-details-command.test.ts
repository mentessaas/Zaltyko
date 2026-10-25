import { describe, expect, it } from "vitest";

import {
  clearPendingOwnerGroupDetailsUpdate,
  ownerGroupDetailsStorageKey,
  persistPendingOwnerGroupDetailsUpdate,
  readPendingOwnerGroupDetailsUpdate,
  type PendingOwnerGroupDetailsUpdate,
} from "@/components/owner-dashboard/owner-group-details-command";

const organizationId = "10000000-0000-4000-8000-000000000001";
const groupId = "20000000-0000-4000-8000-000000000002";
const command: PendingOwnerGroupDetailsUpdate = {
  version: 1,
  organizationId,
  groupId,
  idempotencyKey: "owner-group-update:synthetic-command-01",
  body: JSON.stringify({
    organizationId,
    expectedUpdatedAt: "2026-10-25T09:00:00.123456Z",
    name: "Grupo sintético",
    capacity: null,
  }),
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("pending Owner group details command", () => {
  it("persists, reads, and clears only the exact same request", () => {
    const storage = memoryStorage();
    expect(readPendingOwnerGroupDetailsUpdate(storage, organizationId)).toEqual({
      status: "none",
    });
    expect(persistPendingOwnerGroupDetailsUpdate(storage, command)).toBe(true);
    expect(readPendingOwnerGroupDetailsUpdate(storage, organizationId)).toEqual({
      status: "pending",
      command,
    });

    const changed = { ...command, body: JSON.stringify({
      organizationId,
      expectedUpdatedAt: "2026-10-25T09:00:00.123456Z",
      name: "Otro grupo",
      capacity: null,
    }) };
    expect(persistPendingOwnerGroupDetailsUpdate(storage, changed)).toBe(false);
    expect(clearPendingOwnerGroupDetailsUpdate(storage, changed)).toBe(false);
    expect(clearPendingOwnerGroupDetailsUpdate(storage, command)).toBe(true);
    expect(readPendingOwnerGroupDetailsUpdate(storage, organizationId)).toEqual({
      status: "none",
    });
  });

  it("does not accept malformed or cross-organization replay data", () => {
    const storage = memoryStorage();
    storage.setItem(ownerGroupDetailsStorageKey(organizationId), "not-json");
    expect(readPendingOwnerGroupDetailsUpdate(storage, organizationId)).toEqual({
      status: "invalid",
    });
    expect(persistPendingOwnerGroupDetailsUpdate(storage, command)).toBe(false);

    storage.removeItem(ownerGroupDetailsStorageKey(organizationId));
    const crossTenant = {
      ...command,
      body: JSON.stringify({
        organizationId: "90000000-0000-4000-8000-000000000009",
        expectedUpdatedAt: "2026-10-25T09:00:00.123456Z",
        name: "Grupo sintético",
        capacity: null,
      }),
    };
    expect(persistPendingOwnerGroupDetailsUpdate(storage, crossTenant)).toBe(false);
    expect(storage.getItem(ownerGroupDetailsStorageKey(organizationId))).toBeNull();
  });

  it("fails closed when session storage cannot be read or written", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
      removeItem: () => {
        throw new Error("storage unavailable");
      },
    };
    expect(readPendingOwnerGroupDetailsUpdate(unavailable, organizationId)).toEqual({
      status: "unavailable",
    });
    expect(persistPendingOwnerGroupDetailsUpdate(unavailable, command)).toBe(false);
  });
});
