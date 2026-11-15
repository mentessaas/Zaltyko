import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PUBLIC_GROWTH_EVENT_NAMES, PublicGrowthEventSchema } from "@/lib/growth/contracts";
import { ESSENTIAL_PUBLIC_ROUTES } from "@/lib/launch/essential-routes";

const sandbox = readFileSync("src/components/demo/DemoSandbox.tsx", "utf8");

describe("medición de la demo", () => {
  it("las tres señales de la demo están en el contrato público de eventos", () => {
    for (const name of ["demo_viewed", "demo_action_blocked", "demo_signup_clicked"]) {
      expect(PUBLIC_GROWTH_EVENT_NAMES).toContain(name);
    }
  });

  it("DemoSandbox solo emite nombres del contrato, por el canal público que ya usa /pricing", () => {
    expect(sandbox).toContain('from "@/lib/growth/client"');
    const emitted = [...sandbox.matchAll(/eventName:\s*"([a-z_]+)"/g)].map((match) => match[1]);
    expect(emitted.sort()).toEqual(["demo_action_blocked", "demo_signup_clicked", "demo_viewed"]);
    for (const name of emitted) expect(PUBLIC_GROWTH_EVENT_NAMES).toContain(name);
  });

  it("el origen de la entrada sale de una lista cerrada, no de la URL tal cual", () => {
    expect(sandbox).toContain('new Set(["inicio", "precios"])');
    expect(sandbox).toContain('"directo"');
  });

  it("los eventos de la demo pasan el esquema público y no admiten datos personales", () => {
    const base = { eventId: crypto.randomUUID(), visitorId: crypto.randomUUID(), planCode: null, source: "public_demo" };
    expect(PublicGrowthEventSchema.safeParse({ ...base, eventName: "demo_viewed", properties: { origen: "inicio" } }).success).toBe(true);
    expect(
      PublicGrowthEventSchema.safeParse({ ...base, eventName: "demo_signup_clicked", properties: { colocacion: "banner", seccion: "clases" } }).success
    ).toBe(true);
    expect(PublicGrowthEventSchema.safeParse({ ...base, eventName: "demo_viewed", properties: { email: "a@b.c" } }).success).toBe(false);
  });

  it("el clic al registro se mide desde el banner, el aviso y el final del recorrido", () => {
    expect(readFileSync("src/components/demo/DemoBanner.tsx", "utf8")).toContain('data-demo-cta="banner"');
    expect(sandbox).toContain('data-demo-cta="aviso"');
    expect(readFileSync("src/components/demo/DemoStepper.tsx", "utf8")).toContain('data-demo-cta="final-recorrido"');
    expect(sandbox).toContain("demo_signup_clicked");
  });
});

describe("enlaces a la demo y SEO", () => {
  it("la home y los precios enlazan «Ver demo» con su origen", () => {
    const hero = readFileSync("src/app/(site)/mat/MatHero.tsx", "utf8");
    expect(hero).toContain('href="/demo?origen=inicio"');
    expect(hero).toMatch(/Ver demo\s*<\/Link>/);
    const pricing = readFileSync("src/app/(site)/pricing.tsx", "utf8");
    expect(pricing).toContain('href="/demo?origen=precios"');
    expect(pricing).toMatch(/Ver demo\s*<\/Link>/);
  });

  it("la demo va con noindex (conserva follow) y fuera del sitemap", () => {
    const layout = readFileSync("src/app/demo/layout.tsx", "utf8");
    expect(layout).toContain("robots: { index: false, follow: true }");
    expect(ESSENTIAL_PUBLIC_ROUTES).not.toContain("/demo");
    expect(ESSENTIAL_PUBLIC_ROUTES.some((route) => route.startsWith("/demo"))).toBe(false);
  });
});
