import { describe, expect, it } from "vitest";

import { getRegistrationContinuationPath } from "@/lib/auth/registration-paths";

describe("registration role continuation", () => {
  it.each([
    ["owner", "/onboarding/owner"],
    ["coach", "/onboarding/coach"],
    ["parent", "/onboarding/parent"],
    ["athlete", "/onboarding/athlete"],
    ["provider", "/dashboard/marketplace/mis-productos"],
  ] as const)("routes %s to %s", (role, expectedPath) => {
    expect(getRegistrationContinuationPath(role)).toBe(expectedPath);
  });
});
