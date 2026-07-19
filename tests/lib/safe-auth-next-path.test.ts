import { describe, expect, it } from "vitest";

import { getSafeAuthNextPath } from "@/lib/auth/safe-next-path";

describe("safe auth next path", () => {
  it("acepta únicamente rutas internas absolutas", () => {
    expect(getSafeAuthNextPath("/invite/accept?token=abc")).toBe("/invite/accept?token=abc");
    expect(getSafeAuthNextPath("https://evil.example/phishing")).toBe("/auth/redirect");
    expect(getSafeAuthNextPath("//evil.example/phishing")).toBe("/auth/redirect");
    expect(getSafeAuthNextPath(null)).toBe("/auth/redirect");
  });
});
