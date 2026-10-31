import { describe, expect, it } from "vitest";

import { resolveMetricTarget } from "@/modules/health-score/domain/score-formulas";

describe("resolución de metas del Health Score por moneda", () => {
  it("prioriza la meta de moneda exacta aunque la genérica aparezca primero", () => {
    const generic = { metricKey: "collection_rate", currency: null, target: 0.8 };
    const euro = { metricKey: "collection_rate", currency: "EUR", target: 0.92 };

    expect(resolveMetricTarget([generic, euro], "collection_rate", "EUR")).toBe(euro);
  });

  it("usa la meta genérica solo cuando no existe una exacta", () => {
    const generic = { metricKey: "collection_rate", currency: null, target: 0.8 };

    expect(resolveMetricTarget([generic], "collection_rate", "EUR")).toBe(generic);
  });

  it("no usa una meta de otra moneda si no hay coincidencia ni meta genérica", () => {
    const usd = { metricKey: "collection_rate", currency: "USD", target: 0.8 };

    expect(resolveMetricTarget([usd], "collection_rate", "EUR")).toBeNull();
    expect(resolveMetricTarget([usd], "collection_rate", null)).toBeNull();
  });
});
