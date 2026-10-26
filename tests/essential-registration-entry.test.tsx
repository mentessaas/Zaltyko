import { beforeEach, describe, expect, it, vi } from "vitest";

const { consentPolicy } = vi.hoisted(() => ({ consentPolicy: vi.fn() }));
vi.mock("@/modules/organizations/application/owner-signup-consent", () => ({
  getOwnerSignupConsentPolicyVersion: consentPolicy,
}));
vi.mock("@/components/RegisterForm", () => ({ RegisterForm: () => null }));
vi.mock("@/lib/seo/site-url", () => ({ getPublicSiteUrl: () => "https://zaltyko.example" }));

import Register, { metadata } from "@/app/auth/register/page";

describe("essential public registration entry", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("offers academy setup without advertising provider or directory registration", async () => {
    consentPolicy.mockResolvedValue("qa-policy");
    const page = await Register();
    expect(page.props).toMatchObject({
      ownerEntry: true,
      ownerConsentPolicyVersion: "qa-policy",
      directoryDiscoveryEnabled: false,
      directoryClaimsEnabled: false,
    });
    expect(metadata.description).not.toMatch(/publicar|proveedor|marketplace/i);
  });

  it("keeps the owner consent gate closed when the policy cannot be read", async () => {
    consentPolicy.mockRejectedValue(new Error("policy unavailable"));
    const page = await Register();
    expect(page.props).toMatchObject({ ownerEntry: true, ownerConsentPolicyVersion: null });
  });
});
