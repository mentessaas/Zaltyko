import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/landing/ClusterPainPointsSection.tsx", import.meta.url),
  "utf8",
);

describe("available modality messaging", () => {
  it("does not promise unvalidated automatic family collection in either locale", () => {
    expect(source).toContain("Cuotas y registro manual de pagos");
    expect(source).toContain("Fees and manual payment recording");
    expect(source).not.toContain("Cobros automatizados con Stripe");
    expect(source).not.toContain("Automated payments with Stripe");
  });
  it("offers an honest contact path when a modality is still coming soon", () => {
    expect(source).toContain('href="/contact?type=other"');
    expect(source).toContain("Cuéntanos qué necesitas");
    expect(source).toContain("Tell us what you need");
    expect(source).toContain("Help us prioritize this modality");
  });
});
