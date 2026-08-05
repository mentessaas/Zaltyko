/**
 * ZAL-159 [GTM-DEP.3] — Smoke test de la atribución del canal de registro.
 *
 * Verifica que `createAcademy` (el único camino TS que escribe `academies`
 * con UTMs first-touch) persiste `canal_registro` con el valor que devuelve
 * `derivar_canal(utm_source, utm_medium)` para cada combinación de la
 * taxonomía §4 (paid / social / email / organic / direct).
 *
 * El trigger PL/pgSQL en `drizzle/0008_academies_canal_registro.sql`
 * espeja la misma lógica: si esa migración se aplica a la DB, la columna
 * queda asegurada incluso para escrituras que no pasan por createAcademy
 * (seeds, admin directa). Aquí solo verificamos la ruta TS porque la DB
 * no está disponible en este test runner.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedInsert {
  table: unknown;
  payload: Record<string, unknown>;
}

let capturedInserts: CapturedInsert[];

vi.mock("@/db", () => ({
  db: {
    insert: (table: unknown) => ({
      values: (payload: Record<string, unknown>) => {
        capturedInserts.push({ table, payload });
        const chain: Record<string, unknown> = {};
        chain.onConflictDoNothing = () => Promise.resolve();
        chain.returning = () => Promise.resolve([]);
        return chain;
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  },
}));

vi.mock("@/lib/limits", () => ({
  assertUserAcademyLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sport-config/seed", () => ({
  activateAcademySportConfig: vi.fn().mockResolvedValue({
    configVersion: "test-v1",
    isGenericFallback: false,
  }),
}));

vi.mock("@/lib/onboarding", () => ({
  seedOnboardingForAcademy: vi.fn().mockResolvedValue(undefined),
  markWizardStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/event-logging", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

let createAcademy: typeof import("@/app/api/academies/academies.lib").createAcademy;

const findAcademyInsert = () => {
  const inserts = capturedInserts.filter(
    (entry) =>
      entry.table &&
      typeof entry.table === "object" &&
      (entry.table as { _name?: string })._name === "academies"
  );
  expect(inserts.length).toBeGreaterThan(0);
  return inserts[0]!;
};

beforeEach(async () => {
  capturedInserts = [];
  if (!createAcademy) {
    const lib = await import("@/app/api/academies/academies.lib");
    createAcademy = lib.createAcademy;
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createAcademy — derivación de canal_registro por bucket de UTM", () => {
  it.each<[string, string | undefined, string | undefined, string]>([
    // paid
    ["paid (google_ads)", "google_ads", "cpc", "paid"],
    ["paid (meta_ads)", "meta_ads", "paid_social", "paid"],
    ["paid (tiktok_ads)", "tiktok_ads", undefined, "paid"],
    ["paid via medium=cpc sin source", undefined, "cpc", "paid"],
    // social
    ["social (instagram)", "instagram", undefined, "social"],
    [
      "social (whatsapp — explícito, NO direct)",
      "whatsapp",
      undefined,
      "social",
    ],
    ["social (facebook)", "facebook", "social", "social"],
    ["social (linkedin)", "linkedin", undefined, "social"],
    // email
    ["email (resend_email)", "resend_email", undefined, "email"],
    // organic
    ["organic (google_organic)", "google_organic", undefined, "organic"],
    // google alias
    ["google + cpc → paid", "google", "cpc", "paid"],
    ["google + organic → organic", "google", "organic", "organic"],
    ["google + email → email", "google", "email", "email"],
    ["google + social → social", "google", "social", "social"],
    ["google sin medium → direct", "google", undefined, "direct"],
    // direct / invalid
    ["sin UTMs → direct", undefined, undefined, "direct"],
    ["medium solo 'email' → email", undefined, "email", "email"],
    ["medium solo 'social' → social", undefined, "social", "social"],
    [
      "source desconocido sin medium → direct",
      "spam_site",
      undefined,
      "direct",
    ],
    [
      "source desconocido + medium conocido → medium gana",
      "spam_site",
      "cpc",
      "paid",
    ],
    ["precedencia: instagram + cpc → paid", "instagram", "cpc", "paid"],
    ["precedencia: resend_email + cpc → paid", "resend_email", "cpc", "paid"],
    [
      "precedencia: google_organic + email → email",
      "google_organic",
      "email",
      "email",
    ],
  ])("%s", async (_label, source, medium, expected) => {
    const result = await createAcademy(
      {
        name: "Academia Test",
        academyType: "artistica",
        disciplineVariant: "artistic_female",
        countryCode: "ES",
        utm:
          source || medium
            ? {
                utm_source: source ?? null,
                utm_medium: medium ?? null,
              }
            : undefined,
      },
      {
        profile: {
          id: "profile-test",
          userId: "user-test",
          role: "owner",
          tenantId: "tenant-test",
        },
      }
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const insert = findAcademyInsert();
    expect(insert.payload.canalRegistro).toBe(expected);
    // El snapshot debe ser determinístico para el mismo input: el trigger
    // PL/pgSQL en migración 0008 espeja esta misma tabla de decisiones.
    expect(result.canalRegistro).toBe(expected);
  });
});

/**
 * ZAL-157 [GTM-DEP.1] — regresión P1 de ZAL-198: el snapshot first-touch se
 * decide sobre los CINCO parámetros. Antes `utmCapturedAt` se fijaba solo si
 * llegaba source o medium, así que un touch formado por campaign/term/content
 * se persistía sin marca temporal y quedaba indistinguible de un registro sin
 * atribución.
 */
describe("createAcademy — contrato completo de los cinco UTM", () => {
  const baseBody = {
    name: "Academia Test",
    academyType: "artistica" as const,
    disciplineVariant: "artistic_female" as const,
    countryCode: "ES",
  };

  const context = {
    profile: {
      id: "profile-test",
      userId: "user-test",
      role: "owner",
      tenantId: "tenant-test",
    },
  };

  it.each([["utm_campaign"], ["utm_term"], ["utm_content"]])(
    "marca utm_captured_at con un touch formado solo por %s",
    async (key) => {
      const result = await createAcademy(
        { ...baseBody, utm: { [key]: "zal_ago_awareness" } },
        context
      );

      expect("error" in result).toBe(false);
      const insert = findAcademyInsert();
      expect(insert.payload.utmCapturedAt).toBeInstanceOf(Date);
    }
  );

  it("persiste el snapshot completo de los cinco parámetros", async () => {
    await createAcademy(
      {
        ...baseBody,
        utm: {
          utm_source: "instagram",
          utm_medium: "social",
          utm_campaign: "zal_onboarding_ago_awareness",
          utm_term: "academia",
          utm_content: "hero_v1",
          utm_landing_path: "/es/trampolin/espana",
        },
      },
      context
    );

    const insert = findAcademyInsert();
    expect(insert.payload).toMatchObject({
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "zal_onboarding_ago_awareness",
      utmTerm: "academia",
      utmContent: "hero_v1",
      utmLandingPath: "/es/trampolin/espana",
    });
    expect(insert.payload.utmCapturedAt).toBeInstanceOf(Date);
  });

  it("no marca utm_captured_at cuando no llega ningún UTM", async () => {
    await createAcademy({ ...baseBody, utm: undefined }, context);
    expect(findAcademyInsert().payload.utmCapturedAt).toBeNull();
  });

  it("no marca utm_captured_at cuando solo llega el landing path", async () => {
    await createAcademy(
      { ...baseBody, utm: { utm_landing_path: "/precios" } },
      context
    );
    expect(findAcademyInsert().payload.utmCapturedAt).toBeNull();
  });
});
