import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("owner onboarding clarity", () => {
  it("authenticates the owner before the separate academy bootstrap", () => {
    const legacyPage = readFileSync("src/app/onboarding/owner/page.tsx", "utf8");
    const setupPage = readFileSync("src/app/owner/setup/page.tsx", "utf8");
    const form = readFileSync("src/components/owner-dashboard/OwnerSetupForm.tsx", "utf8");

    expect(legacyPage).toContain('redirect("/owner/setup")');
    expect(setupPage).toContain("await supabase.auth.getUser()");
    expect(setupPage).toContain('redirect("/auth/login?next=/owner/setup")');
    expect(setupPage).toContain("<OwnerSetupForm />");
    expect(form).toContain("Nombre de la academia");
    expect(form).toContain("Nombre de la primera sede");
    expect(form).toContain("Crear espacio de dirección");
    expect(form).toContain('fetch("/api/v1/organizations/bootstrap"');
    expect(form).not.toContain("Crear cuenta");
    expect(form).not.toContain("OwnerOnboardingForm");
  });
});
