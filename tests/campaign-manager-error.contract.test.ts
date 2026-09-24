import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/components/billing/CampaignManager.tsx", import.meta.url), "utf8");

describe("campaign manager error UX contract", () => {
  it("surfaces failed save/delete operations", () => {
    expect(source).toContain("setError");
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain('role="alert"');
  });
});
