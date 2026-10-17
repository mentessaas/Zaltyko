import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUserHome: vi.fn(),
  ensureGlobalProfile: vi.fn(),
  findCanonicalOwnerEntry: vi.fn(),
}));

vi.mock("@/lib/auth/resolve-user-home", () => ({
  resolveUserHome: mocks.resolveUserHome,
}));
vi.mock("@/lib/auth/ensure-global-profile", () => ({
  ensureGlobalProfile: mocks.ensureGlobalProfile,
  isOpenRegistrationRole: (value: unknown) =>
    ["owner", "coach", "parent", "athlete", "provider"].includes(String(value)),
}));
vi.mock(
  "@/modules/organizations/application/resolve-canonical-owner-entry",
  () => ({
    findCanonicalOwnerEntry: mocks.findCanonicalOwnerEntry,
  })
);

import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  user_metadata: {},
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureGlobalProfile.mockResolvedValue({ id: "profile-1" });
  mocks.findCanonicalOwnerEntry.mockResolvedValue(null);
});

describe("continuidad de entrada Owner", () => {
  it("prioriza la membresía legacy verificada antes de consultar el modelo canónico", async () => {
    mocks.resolveUserHome.mockResolvedValue({
      destination: "academy_workspace",
      redirectUrl: "/app/legacy-academy/dashboard",
      reason: "legacy-owner-membership",
      profileRole: "owner",
      membershipRole: "owner",
      activeAcademyId: "legacy-academy",
    });

    const result = await resolveUserEntry(user, "owner");

    expect(result.redirectUrl).toBe("/app/legacy-academy/dashboard");
    expect(mocks.findCanonicalOwnerEntry).not.toHaveBeenCalled();
    expect(mocks.ensureGlobalProfile).not.toHaveBeenCalled();
  });

  it("preserva la entrada super-admin confiable ante metadata de alta Owner", async () => {
    const superAdmin = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.test",
      user_metadata: { initial_role: "owner" },
    } as never;
    const home = {
      destination: "super_admin",
      redirectUrl: "/super-admin",
      reason: "super-admin",
      profileRole: "super_admin",
    };
    mocks.resolveUserHome.mockResolvedValue(home);

    await expect(resolveUserEntry(superAdmin, "owner")).resolves.toBe(home);
    expect(mocks.findCanonicalOwnerEntry).not.toHaveBeenCalled();
    expect(mocks.ensureGlobalProfile).not.toHaveBeenCalled();
  });

  it("envía un Owner nuevo a setup si no existe membresía legacy ni canónica", async () => {
    const order: string[] = [];
    mocks.resolveUserHome.mockImplementation(async () => {
      order.push("legacy");
      return {
        destination: "owner_setup",
        redirectUrl: "/owner/setup",
        reason: "missing-profile",
      };
    });
    mocks.findCanonicalOwnerEntry.mockImplementation(async () => {
      order.push("canonical");
      return null;
    });

    const result = await resolveUserEntry(user, "owner");

    expect(order).toEqual(["legacy", "canonical"]);
    expect(result.redirectUrl).toBe("/owner/setup");
  });

  it("reconoce una cuenta canónica existente mediante su membresía de base de datos", async () => {
    mocks.resolveUserHome.mockResolvedValue({
      destination: "owner_setup",
      redirectUrl: "/owner/setup",
      reason: "missing-profile",
    });
    mocks.findCanonicalOwnerEntry.mockResolvedValue({
      organizationId: "canonical-org",
      role: "admin",
    });

    const result = await resolveUserEntry(user, "coach");

    expect(result).toMatchObject({
      destination: "academy_workspace",
      redirectUrl: "/owner?organizationId=canonical-org",
      profileRole: "admin",
      reason: "canonical-owner-membership",
    });
  });

  it("no deja que metadata parent oculte una membresía Owner canónica existente", async () => {
    mocks.resolveUserHome.mockResolvedValue({
      destination: "owner_setup",
      redirectUrl: "/owner/setup",
      reason: "missing-profile",
    });
    mocks.findCanonicalOwnerEntry.mockResolvedValue({
      organizationId: "canonical-org",
      role: "owner",
    });

    const result = await resolveUserEntry(user, "parent");

    expect(result.redirectUrl).toBe("/owner?organizationId=canonical-org");
    expect(mocks.ensureGlobalProfile).not.toHaveBeenCalled();
  });

  it("solo trata como ausencia el schema canónico que no existe", async () => {
    mocks.resolveUserHome.mockResolvedValue({
      destination: "owner_setup",
      redirectUrl: "/owner/setup",
      reason: "missing-profile",
    });
    mocks.findCanonicalOwnerEntry.mockRejectedValue({
      code: "42P01",
      table: "organization_members",
      message: 'relation "zaltyko.organization_members" does not exist',
    });

    await expect(resolveUserEntry(user, "owner")).resolves.toMatchObject({
      destination: "owner_setup",
      redirectUrl: "/owner/setup",
    });

    mocks.findCanonicalOwnerEntry.mockRejectedValueOnce(
      new Error("connection reset")
    );
    await expect(resolveUserEntry(user, "owner")).rejects.toThrow(
      "connection reset"
    );

    mocks.findCanonicalOwnerEntry.mockRejectedValueOnce({
      code: "42P01",
      table: "profiles",
      message: 'relation "public.profiles" does not exist',
    });
    await expect(resolveUserEntry(user, "owner")).rejects.toMatchObject({
      code: "42P01",
      table: "profiles",
    });
  });
});
