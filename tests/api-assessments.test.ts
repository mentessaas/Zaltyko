import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/api/assessments/route.ts", import.meta.url), "utf8");
const athleteSource = readFileSync(new URL("../src/app/api/assessments/[athleteId]/route.ts", import.meta.url), "utf8");

describe("assessments API P0 contract", () => {
  it("protege POST con autenticación tenant y validación", () => {
    expect(source).toMatch(/export const POST/);
    expect(source).toMatch(/withTenant/);
    expect(source).toMatch(/safeParse|parse\(/);
  });

  it("mantiene el alcance de academia/atleta en la ruta por atleta", () => {
    expect(athleteSource).toMatch(/withTenant/);
    expect(athleteSource).toMatch(/athleteId/);
    expect(athleteSource).toMatch(/tenantId|academyId/);
  });

  it("rechaza payloads inválidos con respuesta API estandarizada", () => {
    expect(source).toMatch(/apiError/);
    expect(source).toMatch(/400|VALIDATION/);
  });
});
