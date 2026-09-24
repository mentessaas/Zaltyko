import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("owner onboarding clarity", () => {
  it("separates account creation from academy creation", () => {
    const page = readFileSync("src/app/onboarding/owner/page.tsx", "utf8");
    const form = readFileSync("src/components/onboarding/OwnerOnboardingForm.tsx", "utf8");

    expect(page).toContain('data-testid="owner-onboarding-progress"');
    expect(page).toContain("1. Cuenta personal");
    expect(page).toContain("2. Tu academia");
    expect(form).toContain("Tu cuenta personal ya está creada");
    expect(form).toContain("Crear mi academia y entrar");
  });
});
