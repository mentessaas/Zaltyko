import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("owner onboarding clarity", () => {
  it("authenticates the owner before the separate academy bootstrap", () => {
    const legacyPage = readFileSync(
      "src/app/onboarding/owner/page.tsx",
      "utf8"
    );
    const setupPage = readFileSync("src/app/owner/setup/page.tsx", "utf8");
    const form = readFileSync(
      "src/components/owner-dashboard/OwnerSetupForm.tsx",
      "utf8"
    );
    const marketRegistry = readFileSync(
      "src/modules/organizations/domain/administrative-market-capabilities.ts",
      "utf8"
    );

    expect(legacyPage).toContain('redirect("/owner/setup")');
    expect(setupPage).toContain("await supabase.auth.getUser()");
    expect(setupPage).toContain(
      'if (authError || !user) redirect("/auth/login?next=/owner/setup")'
    );
    expect(setupPage).toContain('redirect("/auth/login?next=/owner/setup")');
    expect(setupPage).toContain(
      "<OwnerSetupForm contractualConsent={contractualConsent} ownerUserId={user.id} />"
    );
    expect(setupPage).toContain("getOwnerContractualConsentRequirement(user)");
    expect(setupPage).toContain("contractualConsent = null");
    expect(setupPage).toContain(
      'inArray(organizationMembers.role, ["owner", "admin", "manager"])'
    );
    expect(setupPage).toContain("Crea tu academia");
    expect(setupPage).toContain("Indica el nombre, la sede y las actividades.");
    expect(setupPage).toContain("gimnastas, clases y cuotas.");
    expect(form).toContain("Nombre de la academia");
    expect(form).toContain("Nombre de la primera sede");
    expect(form).toContain("Crear espacio de dirección");
    expect(form).toContain("if (!contractualConsent)");
    expect(form).toContain(
      "contractualConsent.requiresAcceptance && !consentAccepted"
    );
    expect(form).toContain('fetch("/api/v1/organizations/bootstrap"');
    expect(form).not.toContain("Crear cuenta");
    expect(form).not.toContain("OwnerOnboardingForm");

    expect(marketRegistry).toContain("ADMINISTRATIVE_MARKET_REGISTRY");
    expect(marketRegistry).toContain('countryCode: "ES"');
    expect(marketRegistry).toContain('countryCode: "MX"');
    expect(form).toContain("Object.values(ADMINISTRATIVE_MARKET_REGISTRY)");
    expect(form).toContain("selectedMarket?.timezones.map((zone) => (");
  });
});
