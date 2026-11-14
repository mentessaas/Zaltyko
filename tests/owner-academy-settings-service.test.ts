import { describe, expect, it } from "vitest";

import {
  academyNameSchema,
  locationLimitMessage,
  locationTimezoneOptions,
  nextLocationCode,
} from "@/modules/organizations/application/owner-academy-settings";

describe("ajustes de la academia: piezas puras", () => {
  it("normaliza espacios y rechaza nombres cortos o con control", () => {
    expect(academyNameSchema.parse("  Club   Gimnasia ")).toBe("Club Gimnasia");
    expect(academyNameSchema.safeParse("a").success).toBe(false);
    expect(academyNameSchema.safeParse("Club\u0000").success).toBe(false);
    for (const hidden of ["\u200b", "\u200f", "\u202e", "\u2066", "\u2069", "\ufeff"]) {
      expect(academyNameSchema.safeParse(`Club${hidden}Uno`).success, hidden).toBe(false);
    }
  });

  it("asigna el primer código libre sin pasar de 32 caracteres", () => {
    expect(nextLocationCode("norte", new Set())).toBe("norte");
    expect(nextLocationCode("norte", new Set(["norte"]))).toBe("norte-2");
    expect(nextLocationCode("norte", new Set(["norte", "norte-2"]))).toBe("norte-3");
    const long = "a".repeat(32);
    const next = nextLocationCode(long, new Set([long]));
    expect(next.length).toBeLessThanOrEqual(32);
    expect(next.endsWith("-2")).toBe(true);
  });

  it("ofrece las zonas del país con la de la academia primero", () => {
    expect(locationTimezoneOptions("ES", "Atlantic/Canary")).toEqual(["Atlantic/Canary", "Europe/Madrid"]);
  });

  it("explica el límite de una sola sede y remite a Network", () => {
    expect(locationLimitMessage(1)).toContain("Network");
  });
});
