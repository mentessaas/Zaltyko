import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEMO_STEPS, demoSectionOf } from "@/modules/demo/demo-steps";

describe("sección de la demo para la medición", () => {
  it("cada paso del recorrido se clasifica con su propia clave", () => {
    for (const step of DEMO_STEPS) expect(demoSectionOf(step.href)).toBe(step.key);
    expect(demoSectionOf("/demo")).toBe("resumen");
    expect(demoSectionOf("/demo/familia/cuotas")).toBe("familia");
    expect(demoSectionOf("/demo/familia/gimnastas/de000000-0000-4000-8000-000000000300")).toBe("familia");
  });

  it("lo que no es un paso es «otra»: nunca una ruta ni un valor libre", () => {
    for (const path of ["/demo/mas", "/demo/lo-que-sea", "/demo/clases-secretas", "/pricing", "/", ""]) {
      expect(demoSectionOf(path)).toBe("otra");
    }
  });

  it("DemoSandbox no mide la ruta tal cual", () => {
    const source = readFileSync("src/components/demo/DemoSandbox.tsx", "utf8");
    expect(source).toContain("demoSectionOf(pathname)");
    expect(source).not.toMatch(/pathname\.split/);
  });
});
