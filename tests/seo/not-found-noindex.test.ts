import { describe, expect, it } from "vitest";
import * as rootNotFound from "@/app/not-found";
import * as dashboardNotFound from "@/app/dashboard/not-found";
import * as academyNotFound from "@/app/app/[academyId]/not-found";

// 404 pages deben ser noindex/nofollow y nunca aparecer en SERP. Estos tests
// verifican que cada not-found.tsx expone el metadata con robots noindex
// consistente, replicando el patron del middleware de academias no-indexables.
describe("404 pages robots contract", () => {
  it("root /not-found.tsx emite robots noindex + nocache", () => {
    const meta = rootNotFound.metadata;
    expect(meta).toBeDefined();
    expect(meta.robots).toMatchObject({
      index: false,
      follow: false,
      nocache: true,
    });
  });

  it("root /not-found.tsx bloquea googleBot con noarchive + max-snippet:-1", () => {
    const meta = rootNotFound.metadata!;
    const googleBot = (meta.robots as { googleBot?: Record<string, unknown> })
      .googleBot;
    expect(googleBot).toMatchObject({
      index: false,
      follow: false,
      noarchive: true,
      "max-snippet": -1,
    });
  });

  it("/dashboard/not-found.tsx emite robots noindex + nocache", () => {
    const meta = dashboardNotFound.metadata;
    expect(meta).toBeDefined();
    expect(meta.robots).toMatchObject({
      index: false,
      follow: false,
      nocache: true,
    });
  });

  it("/app/[academyId]/not-found.tsx emite robots noindex + nocache", () => {
    const meta = academyNotFound.metadata;
    expect(meta).toBeDefined();
    expect(meta.robots).toMatchObject({
      index: false,
      follow: false,
      nocache: true,
    });
  });

  it("ningun 404 emite index=true (no se cuela un falso positivo)", () => {
    const all = [rootNotFound.metadata, dashboardNotFound.metadata, academyNotFound.metadata];
    for (const m of all) {
      expect(m).toBeDefined();
      const robots = m!.robots as { index?: boolean };
      expect(robots.index).toBe(false);
    }
  });
});
