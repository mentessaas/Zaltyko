import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public academy schedule contract", () => {
  it("never exposes soft-deleted classes in either public data path", () => {
    const source = readFileSync("src/app/actions/public/get-public-academy.ts", "utf8");

    expect(source).toContain("isNull(classes.deletedAt)");
    expect(source).toContain('.is("deleted_at", null)');
  });

  it("keeps the public academy fallback compatible with ISO country codes", () => {
    const source = readFileSync("src/app/actions/public/get-public-academies.ts", "utf8");

    expect(source).toContain('query.or(\`country_code.eq.\${normalizedCountryCode},country.ilike.*\${safeCountry}*\`)');
    expect(source).toContain('replace(/[%,_*(),]/g, " ")');
  });
});
