// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearOwnerStaffCommand,
  makeOwnerStaffCommand,
  markOwnerStaffCommandAttempted,
  ownerStaffCommandStorageKey,
  persistOwnerStaffCommand,
  readOwnerStaffCommand,
  withOwnerStaffCommandLock,
} from "@/components/owner-dashboard/owner-staff-command-journal";

const ORGANIZATION_ID = "80000000-0000-4000-8000-000000000001";
const STAFF_PROFILE_ID = "80000000-0000-4000-8000-000000000002";
const VERSION = `v1_${"a".repeat(64)}`;

const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
});

describe("journal de operaciones Owner Staff", () => {
  it("recupera el cuerpo y la clave exactos y marca el intento sin cambiar la solicitud", () => {
    const command = makeOwnerStaffCommand({
      operation: "create",
      organizationId: ORGANIZATION_ID,
      givenName: "Ada",
      familyName: "Lovelace",
      preferredName: null,
    }, "staff-create-key-0001");

    expect(persistOwnerStaffCommand(window.localStorage, command)).toBe(true);
    const restored = readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID);
    expect(restored).toEqual({ kind: "pending", command });

    const attempted = markOwnerStaffCommandAttempted(window.localStorage, command);
    expect(attempted).toEqual({ ...command, attempted: true });
    expect(attempted?.body).toBe(command.body);
    expect(attempted?.idempotencyKey).toBe(command.idempotencyKey);
    expect(attempted?.endpoint).toBe(command.endpoint);
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID)).toEqual({ kind: "pending", command: attempted });
  });

  it("no sustituye un comando pendiente por otro y solo borra el comando exacto", () => {
    const first = makeOwnerStaffCommand({
      operation: "archive",
      organizationId: ORGANIZATION_ID,
      staffProfileId: STAFF_PROFILE_ID,
      version: VERSION,
    }, "staff-archive-key-0001");
    const replacement = makeOwnerStaffCommand({
      operation: "reactivate",
      organizationId: ORGANIZATION_ID,
      staffProfileId: STAFF_PROFILE_ID,
      version: VERSION,
    }, "staff-reactivate-key-0001");
    expect(persistOwnerStaffCommand(window.localStorage, first)).toBe(true);
    expect(persistOwnerStaffCommand(window.localStorage, replacement)).toBe(false);
    expect(clearOwnerStaffCommand(window.localStorage, replacement)).toBe(false);

    const attempted = markOwnerStaffCommandAttempted(window.localStorage, first);
    expect(attempted).not.toBeNull();
    expect(clearOwnerStaffCommand(window.localStorage, attempted!)).toBe(true);
    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID)).toEqual({ kind: "none" });
  });

  it("rechaza un cuerpo cuya academia no coincide con la del comando", () => {
    const command = makeOwnerStaffCommand({
      operation: "update",
      organizationId: ORGANIZATION_ID,
      staffProfileId: STAFF_PROFILE_ID,
      givenName: "Ada",
      familyName: "Lovelace",
      preferredName: null,
      version: VERSION,
    }, "staff-update-key-0001");
    window.localStorage.setItem(ownerStaffCommandStorageKey(ORGANIZATION_ID), JSON.stringify({
      ...command,
      body: JSON.stringify({ organizationId: STAFF_PROFILE_ID, givenName: "Ada", familyName: "Lovelace", preferredName: null, version: VERSION }),
    }));

    expect(readOwnerStaffCommand(window.localStorage, ORGANIZATION_ID)).toEqual({ kind: "invalid" });
  });

  it("reserva un lock exclusivo inmediato y no encola otra pestaña", async () => {
    const request = vi.fn(async (_name: string, options: { mode: string; ifAvailable: boolean }, callback: (lock: object | null) => Promise<unknown>) => {
      expect(options).toEqual({ mode: "exclusive", ifAvailable: true });
      return callback(null);
    });
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    const operation = vi.fn(async () => "sent");

    await expect(withOwnerStaffCommandLock(ORGANIZATION_ID, operation)).resolves.toEqual({ status: "busy" });
    expect(request).toHaveBeenCalledWith(`zaltyko:owner-staff-command-lock:v1:${ORGANIZATION_ID}`, { mode: "exclusive", ifAvailable: true }, expect.any(Function));
    expect(operation).not.toHaveBeenCalled();
  });

  it("falla de forma cerrada si Web Locks no está disponible", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const operation = vi.fn(async () => "sent");

    await expect(withOwnerStaffCommandLock(ORGANIZATION_ID, operation)).resolves.toEqual({ status: "unsupported" });
    expect(operation).not.toHaveBeenCalled();
  });
});
