import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const getConsentRequirement = vi.hoisted(() => vi.fn());
const dbLimit = vi.hoisted(() => vi.fn());
const findLegacyAcademyMemberships = vi.hoisted(() => vi.fn());
const resolveUserHome = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: dbLimit }),
      }),
    }),
  },
}));

vi.mock("@/db/zaltyko-schema", () => ({
  organizationMembers: {
    id: "organization_members.id",
    userId: "organization_members.user_id",
    status: "organization_members.status",
    role: "organization_members.role",
  },
}));

vi.mock("@/lib/auth/legacy-academy-access", () => ({
  findLegacyAcademyMemberships,
}));

vi.mock("@/lib/auth/resolve-user-home", () => ({ resolveUserHome }));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/modules/organizations/application/owner-signup-consent", () => ({
  getOwnerContractualConsentRequirement: getConsentRequirement,
}));

import { OwnerSetupForm } from "@/components/owner-dashboard/OwnerSetupForm";
import OwnerSetupPage from "@/app/owner/setup/page";

function findSetupForm(page: ReactElement) {
  const section = page.props.children as ReactElement;
  const children = section.props.children as ReactElement[];
  return children.find(
    (child) => isValidElement(child) && child.type === OwnerSetupForm
  ) as ReactElement | undefined;
}

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({
    data: { user: { id: "synthetic-user", user_metadata: {} } },
    error: null,
  });
  getConsentRequirement.mockReset();
  dbLimit.mockReset().mockResolvedValue([]);
  findLegacyAcademyMemberships.mockReset().mockResolvedValue([]);
  resolveUserHome.mockReset();
});

describe("lectura de aceptación contractual antes del setup Owner", () => {
  it("pasa al formulario el requisito leído con el usuario autenticado verificado", async () => {
    const requirement = {
      policyVersion: "v2-2026-10-14",
      requiresAcceptance: true,
      reason: "existing_account",
    } as const;
    getConsentRequirement.mockResolvedValue(requirement);

    const page = await OwnerSetupPage();
    const form = findSetupForm(page);

    expect(getUser).toHaveBeenCalledOnce();
    expect(getConsentRequirement).toHaveBeenCalledWith({
      id: "synthetic-user",
      user_metadata: {},
    });
    expect(form?.props.contractualConsent).toEqual(requirement);
  });

  it("falla cerrada si la lectura de política o consentimiento falla", async () => {
    getConsentRequirement.mockRejectedValue(new Error("store unavailable"));

    const page = await OwnerSetupPage();
    const form = findSetupForm(page);

    expect(form?.props.contractualConsent).toBeNull();
  });

  it("no consulta consentimiento ni muestra setup sin usuario Auth verificado", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "auth unavailable" },
    });

    await expect(OwnerSetupPage()).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login?next=/owner/setup"
    );
    expect(getConsentRequirement).not.toHaveBeenCalled();
  });

  it("redirige al dashboard legacy antes de consultar organizaciones canónicas", async () => {
    findLegacyAcademyMemberships.mockResolvedValue([
      { academyId: "legacy-academy-1", membershipRole: "owner" },
    ]);
    resolveUserHome.mockResolvedValue({
      destination: "academy_workspace",
      redirectUrl: "/app/legacy-academy-1/dashboard",
    });

    await expect(OwnerSetupPage()).rejects.toThrow(
      "NEXT_REDIRECT:/app/legacy-academy-1/dashboard"
    );
    expect(dbLimit).not.toHaveBeenCalled();
    expect(getConsentRequirement).not.toHaveBeenCalled();
  });

  it("no muestra el formulario si existe una academia legacy sin acceso activo", async () => {
    findLegacyAcademyMemberships.mockResolvedValue([
      { academyId: "legacy-academy-suspended", membershipRole: "owner" },
    ]);
    resolveUserHome.mockResolvedValue({ destination: "owner_setup" });

    const page = await OwnerSetupPage();

    expect(findSetupForm(page)).toBeUndefined();
    expect(dbLimit).not.toHaveBeenCalled();
    expect(getConsentRequirement).not.toHaveBeenCalled();
  });

  it("solo trata la relación canónica ausente como cuenta nueva", async () => {
    dbLimit.mockRejectedValue({
      code: "42P01",
      table: "organization_members",
      message: 'relation "zaltyko.organization_members" does not exist',
    });
    getConsentRequirement.mockResolvedValue(null);

    const page = await OwnerSetupPage();

    expect(findSetupForm(page)).toBeDefined();
  });

  it("no oculta errores genéricos de lectura canónica como ausencia", async () => {
    dbLimit.mockRejectedValue(new Error("connection reset"));

    await expect(OwnerSetupPage()).rejects.toThrow("connection reset");
    expect(getConsentRequirement).not.toHaveBeenCalled();
  });
});
