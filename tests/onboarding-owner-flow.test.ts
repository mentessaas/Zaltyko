import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ZAL-137 — contrato del flujo owner", () => {
  it("mantiene claim con revalidación y ownership de la academia", () => {
    const page = read("src/app/onboarding/owner/page.tsx");
    const claimRoute = read("src/app/api/onboarding/owner/claim/route.ts");
    const claimCard = read("src/components/onboarding/OwnerClaimCard.tsx");

    expect(page).toContain("findClaimableAcademyByEmail");
    expect(page).toContain("<OwnerClaimCard");
    expect(claimRoute).toContain('"CLAIM_EMAIL_MISMATCH"');
    expect(claimRoute).toContain("pg_advisory_xact_lock");
    expect(claimRoute).toContain(".set({ ownerId: profileId })");
    expect(claimRoute).toContain("academy.tenantId");
    expect(claimCard).toContain("payload?.message ?? payload?.error");
  });

  it("permite omitir la plantilla y deja un handoff retomable", () => {
    const form = read("src/components/onboarding/OwnerOnboardingForm.tsx");
    const ownerRoute = read("src/app/api/onboarding/owner/route.ts");

    expect(form).toContain("Plantilla inicial de clases (opcional)");
    expect(form).toContain("podrás retomar tu primera clase desde el dashboard");
    expect(form).toContain("owner-onboarding-classes-skipped");
    expect(ownerRoute).toContain("if (selectedStarterGroups.length === 0) continue;");
    expect(ownerRoute).toContain("redirectUrl: `/app/${setup.result.id}/dashboard`");
  });

  it("conserva el siguiente paso en el workspace moderno y el CTA de invite", () => {
    const checklist = read("src/components/dashboard/OnboardingChecklist.tsx");
    const dashboard = read("src/components/dashboard/DashboardPage.tsx");

    expect(checklist).toContain("invite_first_coach");
    expect(checklist).toContain("/coaches");
    expect(dashboard).toContain("DashboardOnboardingPanel");
    expect(dashboard).toContain("/groups");
    expect(dashboard).toContain("/coaches");
    expect(existsSync(join(root, "src/app/app/[academyId]/groups/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "src/app/app/[academyId]/classes/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "src/app/app/[academyId]/coaches/page.tsx"))).toBe(true);
  });
});
