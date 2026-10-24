import { describe, expect, it } from "vitest";
import { formatPaymentDueDate } from "@/components/owner-dashboard/owner-payment-date";

describe("fecha de vencimiento del cargo", () => {
  it("usa la zona horaria de la sede, no la del navegador", () => {
    expect(
      formatPaymentDueDate("2026-10-21T21:59:59.999Z", "Europe/Madrid")
    ).toBe("21 oct 2026");
  });

  it("conserva el valor recibido si la fecha o la zona no son válidas", () => {
    expect(formatPaymentDueDate("fecha-inválida", "Europe/Madrid")).toBe(
      "fecha-inválida"
    );
    expect(
      formatPaymentDueDate("2026-10-21T21:59:59.999Z", "zona-inválida")
    ).toBe("2026-10-21T21:59:59.999Z");
  });
});
