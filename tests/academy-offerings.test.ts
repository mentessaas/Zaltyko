import { describe, expect, it } from "vitest";

import {
  academyOfferingsSchema,
  defaultLocationCode,
} from "@/modules/organizations/domain/academy-offerings";
import {
  ADMINISTRATIVE_MARKET_REGISTRY,
  getAdministrativeMarketCapability,
} from "@/modules/organizations/domain/administrative-market-capabilities";

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

  it("declara capacidades administrativas distintas por mercado y simplifica el código de sede", () => {
    expect(ADMINISTRATIVE_MARKET_REGISTRY.ES).toMatchObject({
      countryCode: "ES",
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Madrid",
      timezoneRequired: false,
      timezones: ["Europe/Madrid", "Atlantic/Canary"],
      sportCoverage: { mode: "discipline_identity" },
    });
    expect(ADMINISTRATIVE_MARKET_REGISTRY.MX).toMatchObject({
      countryCode: "MX",
      defaultCurrency: "MXN",
      defaultTimezone: null,
      timezoneRequired: true,
      timezones: expect.arrayContaining([
        "America/Mexico_City",
        "America/Tijuana",
        "America/Ciudad_Juarez",
      ]),
      sportCoverage: { mode: "general_identity_only" },
    });
    expect(getAdministrativeMarketCapability("FR")).toBeNull();
    expect(getAdministrativeMarketCapability("toString")).toBeNull();
    expect(getAdministrativeMarketCapability("__proto__")).toBeNull();
    expect(defaultLocationCode("Sede Principal Ávila")).toBe(
      "sede-principal-avila"
    );
    expect(defaultLocationCode("東京")).toBe("sede-principal");
  });
});
