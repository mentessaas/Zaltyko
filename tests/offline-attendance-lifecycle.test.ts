import { describe, expect, it } from "vitest";

import { clearForSignOut, expireOfflineData, pendingBeforeSignOut } from "@/lib/offline-attendance/lifecycle";
import { recordMark } from "@/lib/offline-attendance/queue";
import { saveSnapshot } from "@/lib/offline-attendance/snapshot";
import { createMemoryStore } from "@/lib/offline-attendance/store";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const ACADEMY = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";

async function seed() {
  const store = createMemoryStore();
  await saveSnapshot(store, {
    academyId: ACADEMY,
    userId: USER,
    date: "2026-11-14",
    generatedAt: "2026-11-14T10:00:00.000Z",
    sessions: [],
  });
  const base = { academyId: ACADEMY, sessionId: SESSION, status: "present" as const, now: new Date("2026-11-14T11:00:00.000Z") };
  await recordMark(store, { ...base, userId: USER, athleteId: "a1" });
  await recordMark(store, { ...base, userId: USER, athleteId: "a2" });
  await recordMark(store, { ...base, userId: OTHER, athleteId: "a1" });
  return store;
}

describe("cierre de sesión: qué se borra y qué se conserva", () => {
  it("sesión caducada (keepQueue): borra las listas y conserva las marcas de todas", async () => {
    const store = await seed();
    const left = await clearForSignOut(store, { userId: USER, keepQueue: true });
    expect(await store.listSnapshots()).toHaveLength(0);
    expect(left).toBe(3);
    expect(await pendingBeforeSignOut(store, USER)).toBe(2);
  });

  it("cierre desde el botón sin pendientes: borra las marcas de esa usuaria pero no las de otra", async () => {
    const store = await seed();
    const left = await clearForSignOut(store, { userId: USER, keepQueue: false });
    expect(left).toBe(1);
    const rest = await store.listQueued();
    expect(rest.every((m) => m.userId === OTHER)).toBe(true);
  });

  it("sin usuaria conocida no borra marcas aunque no se pida conservarlas", async () => {
    const store = await seed();
    expect(await clearForSignOut(store, { userId: null, keepQueue: false })).toBe(3);
  });

  it("cuenta solo las marcas pendientes de la usuaria que cierra sesión", async () => {
    const store = await seed();
    expect(await pendingBeforeSignOut(store, OTHER)).toBe(1);
    expect(await pendingBeforeSignOut(store, "nadie")).toBe(0);
  });
});

describe("caducidad al arrancar", () => {
  it("borra listas de más de 36 h y marcas de más de 7 días sin abrir Pasar lista", async () => {
    const store = await seed();
    const result = await expireOfflineData(store, new Date("2026-11-23T12:00:00.000Z"));
    expect(result).toEqual({ snapshots: 1, marks: 3 });
    expect(await store.listSnapshots()).toHaveLength(0);
    expect(await store.listQueued()).toHaveLength(0);
  });

  it("no borra nada reciente", async () => {
    const store = await seed();
    const result = await expireOfflineData(store, new Date("2026-11-14T12:00:00.000Z"));
    expect(result).toEqual({ snapshots: 0, marks: 0 });
  });
});
