import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("bootstrap owner canónico", () => {
  it("conserva el dashboard legacy con autorización propia por academia", () => {
    const onboarding = read("src/app/onboarding/owner/page.tsx");
    const dashboard = read("src/app/app/[academyId]/dashboard/page.tsx");
    const atAGlance = read(
      "src/app/app/[academyId]/dashboard/at-a-glance/page.tsx"
    );
    const analytics = read(
      "src/app/app/[academyId]/dashboard/analytics/page.tsx"
    );

    expect(onboarding).toContain('redirect("/owner/setup")');
    expect(dashboard).toContain("getLegacyOwnerAcademyAccess");
    expect(dashboard).toContain("getDashboardData(academyId)");
    expect(dashboard).toContain(
      "if (!access?.allowed || !access.academy) notFound()"
    );
    expect(dashboard).toContain('title: "Dashboard · Zaltyko"');
    expect(dashboard).not.toContain('redirect("/owner")');
    expect(atAGlance).toContain("getLegacyOwnerAcademyAccess");
    expect(atAGlance).toContain("getOwnerAttentionBundle");
    expect(analytics).toContain("getLegacyOwnerAcademyAccess");
  });

  it("autentica antes de validar y vincula el actor a la sesión", () => {
    const route = read("src/app/api/v1/organizations/bootstrap/route.ts");
    const auth = route.indexOf("await getCurrentUser(request)");
    const verifySubject = route.indexOf("authUser.id !== user.id");
    const parse = route.indexOf("bodySchema.safeParse");

    expect(auth).toBeGreaterThanOrEqual(0);
    expect(verifySubject).toBeGreaterThan(auth);
    expect(parse).toBeGreaterThan(auth);
    expect(parse).toBeGreaterThan(verifySubject);
    expect(route).toContain("userId: user.id");
    expect(route).toContain('request.headers.get("idempotency-key")');
    expect(route).toContain("bootstrapOrganizationRequestSchema");
    expect(route).toContain("await recordOwnerSignupConsent(authUser");
    expect(route).toContain("contractualAcceptanceSchema");
    expect(route).toContain(".strict()");
  });

  it("crea organización, sede y owner dentro de una transacción idempotente", () => {
    const service = read(
      "src/modules/organizations/application/bootstrap-organization.ts"
    );

    expect(service).toContain("db.transaction");
    expect(service).toContain("pg_advisory_xact_lock");
    expect(service).toContain("organizationBootstrapCommands");
    expect(service).toContain(".insert(organizations)");
    expect(service).toContain(".insert(locations)");
    expect(service).toContain(".insert(organizationMembers)");
    expect(service).toContain('role: "owner"');
    expect(service).toContain('locationScopeMode: "all"');
    expect(service).toContain("appendAuditEntry");
    expect(service).toContain("appendOutboxEvent");
    expect(service).toContain("defaultCurrency: input.defaultCurrency");
    expect(service).toContain(
      "resolveAdministrativeMarket(input.countryCode)"
    );
    expect(service).toContain("provisionGeneralIdentityProfiles(");
    expect(service).toContain(
      "zaltyko_domain_private.ensure_general_identity_sport_profile(text,text)"
    );
    expect(service).toContain("if (!capability || !capability.selfServe)");
    expect(service).toContain(
      "if (!capability.currencies.includes(defaultCurrency))"
    );
    expect(service).toContain(
      "if (!capability.timezones.includes(timezone))"
    );
    expect(service).toContain("assertValidTimezone(timezone)");
    expect(service).toContain("academyOfferingsSchema");
    expect(service).toContain("organizationSports");
    expect(service).toContain("complementary_activity");
    expect(service).not.toContain("@/db/schema");
  });

  it("mantiene el setup mínimo y sin datos personales de atletas", () => {
    const form = read("src/components/owner-dashboard/OwnerSetupForm.tsx");

    expect(form).toContain("Nombre de la academia");
    expect(form).toContain("Nombre de la primera sede");
    expect(form).toContain(
      "¿Cuál es la especialidad principal de tu academia?"
    );
    expect(form).toContain("Gimnasia artística");
    expect(form).toContain("Gimnasia rítmica");
    expect(form).toContain("Telas aéreas");
    expect(form).toContain("Aro aéreo");
    const allowedKeysMatch = form.match(
      /const allowedKeys = \[([\s\S]*?)\];/
    );
    expect(allowedKeysMatch).not.toBeNull();
    const allowedKeys = Array.from(
      (allowedKeysMatch?.[1] ?? "").matchAll(/"([^"]+)"/g),
      ([, key]) => key
    );
    expect(allowedKeys).toEqual([
      "organizationName",
      "locationName",
      "primaryDiscipline",
      "additionalDisciplines",
      "complementaryActivities",
      "customActivityName",
      "countryCode",
      "defaultCurrency",
      "timezone",
      "contractualAcceptance",
    ]);
    expect(form).toContain(
      "Object.keys(value).some((key) => !allowedKeys.includes(key))"
    );
    expect(form).toContain(
      'hasExactKeys(value.contractualAcceptance, ["accepted", "policyVersion"])'
    );
    expect(form).toContain(
      'hasExactKeys(parsed, ["version", "ownerUserId", "key", "serializedBody"])'
    );
    expect(form).toContain("parsed.ownerUserId !== ownerUserId");
    expect(form).toContain(
      "const market = resolveAdministrativeMarket(value.countryCode)"
    );
    expect(form).toContain('typeof value.countryCode !== "string"');
    expect(form).toContain(
      '(value.countryCode === "MX" || market.tier === "general")'
    );
    expect(form).toContain("!market.currencies.includes(value.defaultCurrency)");
    expect(form).toContain("!market.timezones.includes(value.timezone)");
    expect(form).toContain("defaultCurrency: resolvedCurrency");
    expect(form).toContain(
      "const resolvedCurrency = market.defaultCurrency ?? (currency || null)"
    );
    expect(form).toContain('formData.get("organizationName")');
    expect(form).toContain('formData.get("locationName")');
    expect(form).not.toContain("locationCode");
    expect(form).not.toContain("athlete");
    expect(form).not.toContain("dateOfBirth");
    expect(form).not.toContain("phone");
  });
});
