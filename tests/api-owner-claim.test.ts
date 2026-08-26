import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/api/onboarding/owner/claim/route.ts", import.meta.url), "utf8");

describe("owner claim API P0 contract", () => {
  it("expone POST autenticado y valida la solicitud", () => {
    expect(source).toMatch(/export (const POST|async function POST)/);
    expect(source).toMatch(/requireAuth|withAuthenticated|session|user/);
    expect(source).toMatch(/safeParse|parse\(/);
  });

  it("revalida email y devuelve error de mismatch", () => {
    expect(source).toMatch(/CLAIM_EMAIL_MISMATCH/);
    expect(source).toMatch(/email/i);
    expect(source).toMatch(/403/);
  });

  it("serializa el claim y evita duplicar membership", () => {
    expect(source).toMatch(/advisory|transaction|withTransaction/i);
    expect(source).toMatch(/onConflictDoNothing/);
    expect(source).toMatch(/membership/i);
  });
});
