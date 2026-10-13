import { describe, expect, it } from "vitest";

import {
  academyOfferingsSchema,
  defaultLocationCode,
  LAUNCH_MARKET_DEFAULTS,
} from "@/modules/organizations/domain/academy-offerings";

describe("oferta deportiva de academias", () => {
  it("admite una especialidad y actividades complementarias distintas", () => {
    expect(
      academyOfferingsSchema.parse({
        primaryDiscipline: "rhythmic",
        additionalDisciplines: ["artistic"],
        complementaryActivities: ["aerial_silks", "dance"],
        customActivityName: "  Acrobacia  ",
      })
    ).toEqual({
      primaryDiscipline: "rhythmic",
      additionalDisciplines: ["artistic"],
      complementaryActivities: ["aerial_silks", "dance"],
      customActivityName: "Acrobacia",
    });
  });

  it("rechaza repetir la especialidad principal o una actividad", () => {
    expect(
      academyOfferingsSchema.safeParse({
        primaryDiscipline: "artistic",
        additionalDisciplines: ["artistic"],
        complementaryActivities: [],
      }).success
    ).toBe(false);
    expect(
      academyOfferingsSchema.safeParse({
        primaryDiscipline: "rhythmic",
        additionalDisciplines: [],
        complementaryActivities: ["dance", "dance"],
      }).success
    ).toBe(false);
  });

  it("solo activa mercados con defaults revisados y simplifica el código de sede", () => {
    expect(LAUNCH_MARKET_DEFAULTS).toEqual({
      ES: { currency: "EUR", timezone: "Europe/Madrid" },
    });
    expect(defaultLocationCode("Sede Principal Ávila")).toBe(
      "sede-principal-avila"
    );
    expect(defaultLocationCode("東京")).toBe("sede-principal");
  });
});
