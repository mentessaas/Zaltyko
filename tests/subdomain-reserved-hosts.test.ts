import { describe, expect, it } from "vitest";

import {
  RESERVED_PLATFORM_SUBDOMAINS,
  extractAcademySlugFromHost,
  isZaltykoSubdomain,
} from "@/lib/subdomains/rewrite";

describe("subdominios reservados de la plataforma", () => {
  it("staging.zaltyko.com no se trata como academia", () => {
    expect(extractAcademySlugFromHost("staging.zaltyko.com")).toBeNull();
    expect(isZaltykoSubdomain("staging.zaltyko.com")).toBe(false);
  });

  it.each([...RESERVED_PLATFORM_SUBDOMAINS])("%s.zaltyko.com queda reservado", (name) => {
    expect(extractAcademySlugFromHost(`${name}.zaltyko.com`)).toBeNull();
  });

  it("una academia normal sigue resolviéndose", () => {
    expect(extractAcademySlugFromHost("akros-madrid.zaltyko.com")).toBe("akros-madrid");
  });
});
