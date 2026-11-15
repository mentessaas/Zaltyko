import { describe, expect, it } from "vitest";

import { DEMO_UNAVAILABLE_PATH, demoHrefFor, isDemoPath, realPathForDemoPath } from "@/modules/demo/demo-routes";

describe("rutas de la demo", () => {
  it.each([
    ["/owner", "/demo"],
    ["/owner?organizationId=abc&locationId=def", "/demo"],
    ["/owner/classes?organizationId=abc", "/demo/clases"],
    ["/owner/attendance?sessionId=abc#hoy", "/demo/asistencia"],
    ["/owner/athletes?organizationId=abc", "/demo/gimnastas"],
    ["/owner/payments", "/demo/cuotas"],
    ["/owner/monthly-invoices?servicePeriod=2026-11", "/demo/cuotas"],
    ["/familia", "/demo/familia"],
    ["/familia/cuotas", "/demo/familia/cuotas"],
    ["/familia/gimnastas/de000000-0000-4000-8000-000000000300", "/demo/familia/gimnastas/de000000-0000-4000-8000-000000000300"],
  ])("%s lleva a %s", (real, demo) => {
    expect(demoHrefFor(real)).toBe(demo);
  });

  it("las secciones que la demo no incluye llevan a una página que lo explica", () => {
    for (const href of ["/owner/groups", "/owner/staff?organizationId=abc", "/owner/subscription", "/owner/setup"]) {
      expect(demoHrefFor(href)).toBe(DEMO_UNAVAILABLE_PATH);
    }
  });

  it("no toca los enlaces que no son del panel ni de la familia", () => {
    for (const href of ["/auth/register?role=owner", "/pricing", "/demo/clases", "https://example.com/owner", "mailto:a@b.c", "#x"]) {
      expect(demoHrefFor(href)).toBeNull();
    }
  });

  it("la navegación decide el apartado activo con la ruta real equivalente", () => {
    expect(realPathForDemoPath("/demo")).toBe("/owner");
    expect(realPathForDemoPath("/demo/clases")).toBe("/owner/classes");
    expect(realPathForDemoPath("/demo/asistencia")).toBe("/owner/attendance");
    expect(realPathForDemoPath("/demo/gimnastas")).toBe("/owner/athletes");
    expect(realPathForDemoPath("/demo/cuotas")).toBe("/owner/payments");
    expect(realPathForDemoPath("/pricing")).toBe("/pricing");
  });

  it("reconoce las rutas de la demo", () => {
    expect(isDemoPath("/demo")).toBe(true);
    expect(isDemoPath("/demo/familia/cuotas")).toBe(true);
    expect(isDemoPath("/demonio")).toBe(false);
    expect(isDemoPath("/owner")).toBe(false);
  });
});
