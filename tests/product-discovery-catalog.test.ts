import { describe, expect, it } from "vitest";
import { discoverableFeatures, discoveryCommandSchema, FEATURE_CATALOG } from "@/modules/product-discovery/domain/feature-catalog";

describe("honest planned-feature catalog", () => {
  it("keeps proposals explicitly planned and does not invent tier restrictions or release dates", () => {
    expect(FEATURE_CATALOG).toHaveLength(3);
    for (const feature of FEATURE_CATALOG) {
      expect(feature.status).toBe("planned");
      expect(feature.statusLabel).toBe("En preparación");
      expect(feature.summary).toMatch(/todavía no/i);
      expect(feature).not.toHaveProperty("planCode");
      expect(feature).not.toHaveProperty("releaseDate");
      expect(feature).not.toHaveProperty("operationalUrl");
    }
  });
  it("shows only relevant proposals and none to an unsupported role", () => {
    expect(discoverableFeatures("owner")).toHaveLength(3);
    expect(discoverableFeatures("manager").map(item => item.id)).toEqual(["club-events", "sport-progression"]);
    expect(discoverableFeatures("family")).toEqual([]);
  });
  it("distinguishes organizing from attending without collecting free text", () => {
    expect(discoveryCommandSchema.safeParse({ featureId: "club-events", action: "interest", intent: "organize" }).success).toBe(true);
    expect(discoveryCommandSchema.safeParse({ featureId: "club-events", action: "interest", intent: "participate" }).success).toBe(true);
    expect(discoveryCommandSchema.safeParse({ featureId: "club-events", action: "interest", intent: "a child's private details" }).success).toBe(false);
    expect(discoveryCommandSchema.safeParse({ featureId: "club-events", action: "open", pilot: true }).success).toBe(false);
  });
});
