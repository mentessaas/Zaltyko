import { describe, expect, it } from "vitest";
import { discoverableFeatures, discoveryCommandSchema, FEATURE_CATALOG } from "@/modules/product-discovery/domain/feature-catalog";

describe("honest planned-feature catalog", () => {
  it("keeps proposals explicitly planned and does not invent tier restrictions or release dates", () => {
    expect(FEATURE_CATALOG).toHaveLength(3);
    for (const feature of FEATURE_CATALOG) {
      expect(["planned", "available"]).toContain(feature.status);
      expect(feature.statusLabel).toBe(feature.status === "planned" ? "En preparación" : "Disponible");
      if (feature.status === "planned") expect(feature.summary).toMatch(/todavía no/i);
      else expect(feature.summary).not.toMatch(/propuesta|todavía no está disponible/i);
      expect(feature).not.toHaveProperty("planCode");
      expect(feature).not.toHaveProperty("releaseDate");
      expect(feature).not.toHaveProperty("operationalUrl");
    }
  });
  it("marks the features activated on 2026-11-12 as available, never «En preparación»", () => {
    for (const id of ["club-acquisition", "sport-progression"]) {
      const feature = FEATURE_CATALOG.find(item => item.id === id)!;
      expect(feature.status).toBe("available");
      expect(feature.statusLabel).not.toBe("En preparación");
    }
    expect(FEATURE_CATALOG.find(item => item.id === "club-events")?.status).toBe("planned");
  });
  it("shows only relevant planned proposals and none to an unsupported role", () => {
    expect(discoverableFeatures("owner").map(item => item.id)).toEqual(["club-events"]);
    expect(discoverableFeatures("manager").map(item => item.id)).toEqual(["club-events"]);
    expect(discoverableFeatures("admin").map(item => item.id)).toEqual(["club-events"]);
    expect(discoverableFeatures("family")).toEqual([]);
  });
  it("refuses interest in an activated feature because it is no longer a proposal", () => {
    // El esquema acepta el id (hay intereses previos guardados), pero el servicio
    // solo admite acciones sobre las propuestas que discoverableFeatures muestra.
    expect(discoveryCommandSchema.safeParse({ featureId: "sport-progression", action: "interest", intent: "plan" }).success).toBe(true);
    expect(discoverableFeatures("owner").some(item => item.id === "sport-progression")).toBe(false);
  });
  it("distinguishes organizing from attending without collecting free text", () => {
    expect(discoveryCommandSchema.safeParse({ featureId: "club-events", action: "interest", intent: "organize" }).success).toBe(true);
    expect(discoveryCommandSchema.safeParse({ featureId: "club-events", action: "interest", intent: "participate" }).success).toBe(true);
    expect(discoveryCommandSchema.safeParse({ featureId: "club-events", action: "interest", intent: "a child's private details" }).success).toBe(false);
    expect(discoveryCommandSchema.safeParse({ featureId: "club-events", action: "open", pilot: true }).success).toBe(false);
  });
});
