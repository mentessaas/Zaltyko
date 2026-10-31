// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearOwnerAthleteCommand,
  prepareOwnerAthleteCommand,
} from "@/components/athletes/owner-athlete-pending-command";

const academyId = "30000000-0000-4000-8000-000000000001";
const athleteA = "30000000-0000-4000-8000-000000000002";
const athleteB = "30000000-0000-4000-8000-000000000003";

beforeEach(() => {
  window.sessionStorage.clear();
  let sequence = 0;
  vi.stubGlobal("crypto", {
    randomUUID: () => `40000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("comandos pendientes de archivo/restauración de gimnastas", () => {
  it("reutiliza cuerpo y clave tras un resultado incierto, incluso si cambia el orden de selección", () => {
    const first = prepareOwnerAthleteCommand({
      academyId,
      action: "bulk-archive",
      athleteIds: [athleteB, athleteA],
    });
    const retry = prepareOwnerAthleteCommand({
      academyId,
      action: "bulk-archive",
      athleteIds: [athleteA, athleteB],
    });

    expect(first.status).toBe("ready");
    expect(retry.status).toBe("ready");
    if (first.status !== "ready" || retry.status !== "ready") return;
    expect(retry.command).toEqual(first.command);
    expect(JSON.parse(first.command.serializedBody).athleteIds).toEqual([athleteA, athleteB]);
  });

  it("bloquea una nueva selección mientras otra operación tiene resultado incierto", () => {
    const pending = prepareOwnerAthleteCommand({
      academyId,
      action: "bulk-archive",
      athleteIds: [athleteA],
    });
    expect(pending.status).toBe("ready");

    expect(prepareOwnerAthleteCommand({
      academyId,
      action: "bulk-archive",
      athleteIds: [athleteB],
    })).toEqual({ status: "pending-conflict" });
  });

  it("solo permite una operación nueva después de limpiar el recibo confirmado", () => {
    const first = prepareOwnerAthleteCommand({
      academyId,
      action: "restore",
      athleteIds: [athleteA],
    });
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;

    expect(clearOwnerAthleteCommand(first.command)).toBe(true);
    const next = prepareOwnerAthleteCommand({
      academyId,
      action: "restore",
      athleteIds: [athleteA],
    });
    expect(next.status).toBe("ready");
    if (next.status !== "ready") return;
    expect(next.command.idempotencyKey).not.toBe(first.command.idempotencyKey);
  });

  it("no envía operaciones si sessionStorage no puede guardar el comando", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    expect(prepareOwnerAthleteCommand({
      academyId,
      action: "bulk-archive",
      athleteIds: [athleteA],
    })).toEqual({ status: "unavailable" });
  });

  it("rechaza IDs inválidos antes de crear una intención", () => {
    expect(prepareOwnerAthleteCommand({
      academyId: "not-a-uuid",
      action: "restore",
      athleteIds: [athleteA],
    })).toEqual({ status: "invalid" });
    expect(window.sessionStorage.length).toBe(0);
  });
});
