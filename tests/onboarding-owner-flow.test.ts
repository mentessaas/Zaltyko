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
    const parse = route.indexOf("bodySchema.safeParse");

    expect(auth).toBeGreaterThanOrEqual(0);
    expect(parse).toBeGreaterThan(auth);
    expect(route).toContain("userId: user.id");
    expect(route).toContain('request.headers.get("idempotency-key")');
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
    expect(form).not.toContain("locationCode");
    expect(form).not.toContain("defaultCurrency");
    expect(form).not.toContain("athlete");
    expect(form).not.toContain("dateOfBirth");
    expect(form).not.toContain("phone");
  });
});
