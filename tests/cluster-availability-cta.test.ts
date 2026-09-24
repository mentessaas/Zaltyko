import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/landing/ClusterPainPointsSection.tsx", import.meta.url),
  "utf8",
);

describe("available modality messaging", () => {
  it("offers an honest contact path when a modality is still coming soon", () => {
    expect(source).toContain('href="/contact?type=other"');
    expect(source).toContain("Cuéntanos qué necesitas");
    expect(source).toContain("Tell us what you need");
    expect(source).toContain("Help us prioritize this modality");
  });
});
