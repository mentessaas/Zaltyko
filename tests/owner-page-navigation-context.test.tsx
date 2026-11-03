import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ classes: vi.fn(), enrollments: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: {
    getUser: async () => ({ data: { user: { id: "synthetic-user" } } }),
  } }),
}));
vi.mock("@/modules/scheduling/application/class-management-service", () => ({
  getOwnerClassesPageData: mocks.classes,
}));
vi.mock("@/modules/enrollments/application/enrollment-query-service", () => ({
  getOwnerEnrollmentsPageData: mocks.enrollments,
}));

import OwnerClassesPage from "@/app/owner/classes/page";
import OwnerEnrollmentsPage from "@/app/owner/enrollments/page";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";

const organizationId = "81000000-0000-4000-8000-000000000001";
const locationA = "81000000-0000-4000-8000-000000000002";
const locationB = "81000000-0000-4000-8000-000000000003";

beforeEach(() => vi.resetAllMocks());

for (const [label, page, service] of [
  ["Clases", OwnerClassesPage, mocks.classes],
  ["Inscripciones", OwnerEnrollmentsPage, mocks.enrollments],
] as const) {
  describe(`${label}: contexto autorizado de navegación`, () => {
    it.each([
      { name: "agregado Owner", role: "owner", mode: "all", requested: undefined, expected: null },
      { name: "agregado Admin", role: "admin", mode: "all", requested: undefined, expected: null },
      { name: "sede explícita Owner", role: "owner", mode: "all", requested: locationB, expected: locationB },
      { name: "manager limitado sin query", role: "manager", mode: "selected", requested: undefined, expected: locationA },
      { name: "sede autorizada Manager", role: "manager", mode: "selected", requested: locationB, expected: locationB },
      { name: "admin limitado sin query", role: "admin", mode: "selected", requested: undefined, expected: locationA },
    ])("conserva $name sin tomar el default de creación como filtro agregado", async ({ role, mode, requested, expected }) => {
      const bundle = {
        organization: { id: organizationId },
        member: { role, locationScopeMode: mode },
        selectedLocationId: requested ?? locationA,
      };
      service.mockResolvedValue(bundle);
      const result = await page({ searchParams: Promise.resolve({
        organizationId,
        ...(requested ? { locationId: requested } : {}),
      }) });

      expect(result.type).toBe(OwnerWorkspacePageShell);
      expect(result.props.member).toEqual(bundle.member);
      expect(result.props.organizationId).toBe(organizationId);
      expect(result.props.locationId).toBe(expected);
      expect(service).toHaveBeenCalledWith(expect.objectContaining({
        userId: "synthetic-user", organizationId, locationId: requested,
      }));
      // Navigation must not change the form's existing, authorized default.
      expect(result.props.children.props.bundle.selectedLocationId).toBe(bundle.selectedLocationId);
      if (label === "Clases") {
        expect(result.props.children.props.navigationLocationId).toBe(expected);
      }
    });
  });
}
