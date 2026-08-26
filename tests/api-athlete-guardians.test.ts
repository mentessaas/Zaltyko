import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = (path: string) => readFileSync(new URL(`../src/app/api/${path}`, import.meta.url), "utf8");

describe("guardians API P0 contract", () => {
  it("expone POST y valida el body antes de mutar", () => {
    const source = route("athletes/[athleteId]/guardians/route.ts");
    expect(source).toMatch(/export const POST/);
    expect(source).toMatch(/safeParse|parse\(/);
    expect(source).toMatch(/apiError/);
  });

  it("expone PATCH y DELETE para el vínculo, no para un guardian global", () => {
    const source = route("athletes/[athleteId]/guardians/[linkId]/route.ts");
    expect(source).toMatch(/export const PATCH/);
    expect(source).toMatch(/export const DELETE/);
    expect(source).toMatch(/linkId/);
  });

  it("mantiene tenant y athleteId en el acceso a datos", () => {
    const source = route("athletes/[athleteId]/guardians/[linkId]/route.ts");
    expect(source).toMatch(/withTenant/);
    expect(source).toMatch(/tenantId/);
    expect(source).toMatch(/athleteId/);
  });
});
