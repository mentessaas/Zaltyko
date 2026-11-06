import { describe, expect, it } from "vitest";
import { formatSaasAccessDate, resourceCapacityLabel, saasPaymentNotice } from "@/components/owner-dashboard/owner-saas-presentation";

describe("presentación SaaS sin decidir derechos", () => {
  it.each([null, undefined, "", "not-a-date"])("no inventa fecha para %s", value => {
    expect(formatSaasAccessDate(value)).toBeNull();
  });
  it("incluye hora y zona explícita en verano", () => {
    const label = formatSaasAccessDate("2026-10-22T19:01:00Z");
    expect(label).toContain("22 de octubre de 2026");
    expect(label).toContain("21:01");
    expect(label).toContain("hora de Madrid");
  });
  it("respeta el cambio de horario y no fija un desfase UTC", () => {
    expect(formatSaasAccessDate("2026-10-26T19:01:00Z")).toContain("20:01");
    expect(formatSaasAccessDate("2026-10-22T21:01:00+02:00")).toContain("21:01");
  });
  it("no presenta el primer impago como cancelación terminal", () => {
    expect(saasPaymentNotice("past_due")).toContain("no confirma por sí solo la cancelación");
    expect(saasPaymentNotice("past_due")).toContain("acceso efectivo");
    expect(saasPaymentNotice("past_due")).not.toContain("renovación");
  });
  it("no resuelve unpaid iniciando otra contratación", () => {
    expect(saasPaymentNotice("unpaid")).toContain("no repitas una contratación");
  });
  it.each(["active", "canceled", "trialing", "unknown"])("no inventa impago para %s", status => {
    expect(saasPaymentNotice(status)).toBeNull();
  });
  it("distingue límite alcanzado de excedente", () => {
    expect(resourceCapacityLabel(30, 30, 0)).toBe("Límite alcanzado");
    expect(resourceCapacityLabel(31, 30, 1)).toBe("Excedente: 1");
    expect(resourceCapacityLabel(29, 30, 0)).toBeNull();
  });
  it("no trata un límite explícito ilimitado como lleno", () => {
    expect(resourceCapacityLabel(999, null, 0)).toBeNull();
    expect(resourceCapacityLabel(0, 0, 0)).toBe("Límite alcanzado");
  });
});
