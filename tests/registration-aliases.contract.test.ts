import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("legacy registration aliases", () => {
  it.each(["signup", "registro", "register"])("redirects /%s to canonical registration", (route) => {
    const source = readFileSync(`src/app/${route}/page.tsx`, "utf8");
    expect(source).toContain("redirect(");
    expect(source).toContain("/auth/register");
  });

  it("preserves valid role attribution on aliases", () => {
    const source = readFileSync("src/app/signup/page.tsx", "utf8");
    expect(source).toContain("params.role");
    expect(source).toContain("auth/register?role=");
  });
});
