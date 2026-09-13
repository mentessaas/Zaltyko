import { describe, expect, it } from "vitest";

import { isSuperAdminPath } from "@/lib/navigation/active";

describe("navigation path matching", () => {
  it("recognizes super-admin paths only on the intended route segment", () => {
    expect(isSuperAdminPath("/super-admin")).toBe(true);
    expect(isSuperAdminPath("/super-admin/dashboard/")).toBe(true);
    expect(isSuperAdminPath("/super-administ")).toBe(false);
    expect(isSuperAdminPath("/app/super-admin/dashboard")).toBe(false);
    expect(isSuperAdminPath(null)).toBe(false);
  });
});
