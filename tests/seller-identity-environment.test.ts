import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SellerIdentification } from "@/components/legal/SellerIdentification";
import {
  getCommercialLaunchProfile,
  getCommercialLaunchReadiness,
  isSaasCheckoutEnabled,
  isSaasCheckoutEnabledForMarket,
  readSellerIdentityFromEnvironment,
  SELLER_PROFESSIONAL_ADDRESS_ENV,
  SELLER_TAX_ID_ENV,
} from "@/lib/launch/commercial-launch-profile";
import { COMMERCIAL_MARKET_REGISTRY } from "@/modules/organizations/domain/commercial-market-capabilities";

// Valores sintéticos con formato válido; no son datos del vendedor.
const SYNTHETIC_TAX_ID = "12345678Z";
const SYNTHETIC_ADDRESS = "Calle Sintética 1, 2º B, 28001 Madrid (Madrid)";

const REPO = process.cwd();
const PROFILE_PATH = "src/lib/launch/commercial-launch-profile.ts";
const source = (path: string) => readFileSync(join(REPO, path), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function stubSellerEnvironment(taxId: string | undefined, address: string | undefined) {
  vi.stubEnv(SELLER_TAX_ID_ENV, taxId);
  vi.stubEnv(SELLER_PROFESSIONAL_ADDRESS_ENV, address);
}

beforeEach(() => stubSellerEnvironment(undefined, undefined));
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lectura de NIF y domicilio desde variables de entorno del servidor", () => {
  it("usa los nombres de variable acordados, sin prefijo público", () => {
    expect(SELLER_TAX_ID_ENV).toBe("ZALTYKO_SELLER_TAX_ID");
    expect(SELLER_PROFESSIONAL_ADDRESS_ENV).toBe("ZALTYKO_SELLER_PROFESSIONAL_ADDRESS");
  });

  it("lee y recorta los valores presentes", () => {
    stubSellerEnvironment(`  ${SYNTHETIC_TAX_ID}\n`, `  ${SYNTHETIC_ADDRESS}  `);
    expect(readSellerIdentityFromEnvironment()).toEqual({
      taxId: SYNTHETIC_TAX_ID,
      professionalAddress: SYNTHETIC_ADDRESS,
    });
    expect(getCommercialLaunchProfile()).toMatchObject({
      taxId: SYNTHETIC_TAX_ID,
      professionalAddress: SYNTHETIC_ADDRESS,
    });
  });

  it.each([
    ["ausentes", undefined],
    ["vacías", ""],
    ["solo espacios", "   "],
  ])("trata como null las variables %s", (_label, value) => {
    stubSellerEnvironment(value, value);
    expect(readSellerIdentityFromEnvironment()).toEqual({ taxId: null, professionalAddress: null });
    expect(getCommercialLaunchProfile()).toMatchObject({ taxId: null, professionalAddress: null });
  });

  it("acepta un entorno explícito y no lo mezcla con process.env", () => {
    stubSellerEnvironment(SYNTHETIC_TAX_ID, SYNTHETIC_ADDRESS);
    expect(getCommercialLaunchProfile({})).toMatchObject({ taxId: null, professionalAddress: null });
    expect(getCommercialLaunchProfile({ ZALTYKO_SELLER_TAX_ID: "X1234567L" }).taxId).toBe("X1234567L");
  });

  it("devuelve un perfil congelado que se evalúa en cada llamada", () => {
    const before = getCommercialLaunchProfile();
    stubSellerEnvironment(SYNTHETIC_TAX_ID, SYNTHETIC_ADDRESS);
    const after = getCommercialLaunchProfile();
    expect(Object.isFrozen(after)).toBe(true);
    expect(before.taxId).toBeNull();
    expect(after.taxId).toBe(SYNTHETIC_TAX_ID);
  });
});

describe("readiness según las variables del vendedor", () => {
  it("sin variables, sigue cerrada por NIF, domicilio y alta incompleta", () => {
    const { ready, missing } = getCommercialLaunchReadiness();
    expect(ready).toBe(false);
    expect(missing).toEqual(expect.arrayContaining(["seller_tax_id", "seller_address", "registration_incomplete"]));
    expect(isSaasCheckoutEnabled("live")).toBe(false);
    expect(isSaasCheckoutEnabled("test")).toBe(true);
  });

  it("con solo una variable, señala la que falta", () => {
    stubSellerEnvironment(SYNTHETIC_TAX_ID, undefined);
    let missing = getCommercialLaunchReadiness().missing;
    expect(missing).toContain("seller_address");
    expect(missing).toContain("registration_incomplete");
    expect(missing).not.toContain("seller_tax_id");

    stubSellerEnvironment(undefined, SYNTHETIC_ADDRESS);
    missing = getCommercialLaunchReadiness().missing;
    expect(missing).toContain("seller_tax_id");
    expect(missing).toContain("registration_incomplete");
    expect(missing).not.toContain("seller_address");
  });

  it("con ambas variables válidas, solo quedan las comprobaciones humanas pendientes", () => {
    stubSellerEnvironment(SYNTHETIC_TAX_ID, SYNTHETIC_ADDRESS);
    const { ready, missing } = getCommercialLaunchReadiness();
    expect(missing).toEqual([
      "support_mailbox",
      "checkout_tax",
      "legal_texts",
      "invoicing_integration",
      "live_release",
    ]);
    expect(ready).toBe(false);
    expect(isSaasCheckoutEnabled("live")).toBe(false);
  });

  it.each([
    [SELLER_TAX_ID_ENV, "12345678A", "seller_tax_id_format"],
    [SELLER_TAX_ID_ENV, "12345678z", "seller_tax_id_format"],
    [SELLER_TAX_ID_ENV, "12.345.678-Z", "seller_tax_id_format"],
    [SELLER_TAX_ID_ENV, `"${SYNTHETIC_TAX_ID}"`, "seller_tax_id_format"],
    [SELLER_PROFESSIONAL_ADDRESS_ENV, "Calle Sintética 1, Madrid", "seller_address_format"],
    [SELLER_PROFESSIONAL_ADDRESS_ENV, "Calle Sintética 1, 35001 Las Palmas", "seller_tax_territory_review"],
  ] as const)("rechaza %s=%s con %s", (name, value, code) => {
    stubSellerEnvironment(SYNTHETIC_TAX_ID, SYNTHETIC_ADDRESS);
    vi.stubEnv(name, value);
    expect(getCommercialLaunchReadiness().missing).toContain(code);
    expect(isSaasCheckoutEnabledForMarket("live", "ES")).toBe(false);
  });
});

describe("taxTreatmentReviewed solo cubre España", () => {
  const openSeller = {
    ...getCommercialLaunchProfile({
      ZALTYKO_SELLER_TAX_ID: SYNTHETIC_TAX_ID,
      ZALTYKO_SELLER_PROFESSIONAL_ADDRESS: SYNTHETIC_ADDRESS,
    }),
    supportMailboxVerified: true,
    checkoutTaxVerified: true,
    legalTextsApproved: true,
    invoicingIntegrationReady: true,
    liveReleaseApproved: true,
  };

  it("con el vendedor listo, Live solo se abre para academias de España", () => {
    expect(openSeller.taxTreatmentReviewed).toBe(true);
    expect(getCommercialLaunchReadiness(openSeller)).toEqual({ ready: true, missing: [] });
    expect(isSaasCheckoutEnabledForMarket("live", "ES", openSeller)).toBe(true);
    // UE (empresas o particulares), México y cualquier otro país siguen cerrados.
    for (const country of ["MX", "FR", "DE", "PT", "IT", "US", "ZZ", ""]) {
      expect(isSaasCheckoutEnabledForMarket("live", country, openSeller), country).toBe(false);
    }
  });

  it("el registro de mercados solo habilita España en Live (revisar la fiscalidad antes de ampliarlo)", () => {
    const liveMarkets = Object.values(COMMERCIAL_MARKET_REGISTRY)
      .filter((market) => market.liveSaasCheckoutEnabled)
      .map((market) => market.countryCode);
    expect(liveMarkets).toEqual(["ES"]);
  });
});

describe("identificación en páginas legales con datos del entorno", () => {
  it("publica NIF y domicilio cuando las variables son válidas", () => {
    stubSellerEnvironment(SYNTHETIC_TAX_ID, SYNTHETIC_ADDRESS);
    const html = text(renderToStaticMarkup(createElement(SellerIdentification)));
    expect(html).toContain(`NIF ${SYNTHETIC_TAX_ID}`);
    expect(html).toContain(`Domicilio profesional ${SYNTHETIC_ADDRESS}`);
    expect(html).toContain("Titular");
    expect(html).not.toContain("futuro titular");
    // Las demás comprobaciones siguen pendientes.
    expect(html).toContain("Información legal en preparación");
  });

  it("no publica un valor con formato inválido", () => {
    stubSellerEnvironment("12345678A", "Domicilio sintético");
    const html = text(renderToStaticMarkup(createElement(SellerIdentification)));
    expect(html).not.toContain("12345678A");
    expect(html).not.toContain("Domicilio sintético");
    expect(html).toContain("NIF Pendiente de completar");
    expect(html).toContain("Domicilio profesional Pendiente de completar");
  });
});

describe("el NIF y el domicilio no se escriben en el repositorio público", () => {
  // Forma de NIF (8 cifras + letra) o NIE (X/Y/Z + 7 cifras + letra).
  const NIF_SHAPE = /\b(?:\d{8}|[XYZ]\d{7})[A-Z]\b/u;
  // Código postal español (01000–52999).
  const POSTAL_CODE_SHAPE = /\b(?:0[1-9]|[1-4]\d|5[0-2])\d{3}\b/u;

  it("el perfil lee ambos datos de process.env y no asigna literales", () => {
    const profile = source(PROFILE_PATH);
    expect(profile).toContain("process.env.ZALTYKO_SELLER_TAX_ID");
    expect(profile).toContain("process.env.ZALTYKO_SELLER_PROFESSIONAL_ADDRESS");
    expect(profile).not.toMatch(/\b(?:taxId|professionalAddress)\s*:\s*["'`]/u);
    expect(profile).not.toMatch(/ELVIS:/u);
  });

  it.each([
    PROFILE_PATH,
    "src/components/legal/SellerIdentification.tsx",
  ])("%s no contiene NIF ni código postal literales", (path) => {
    const content = source(path);
    expect(content, "NIF/NIE literal").not.toMatch(NIF_SHAPE);
    expect(content, "código postal literal").not.toMatch(POSTAL_CODE_SHAPE);
  });

  it.each([
    "docs/deployment/spain-seller-activation-2026-10-26.md",
    ".env.example",
  ])("%s no contiene un NIF literal ni valores de las variables", (path) => {
    const content = source(path);
    expect(content).not.toMatch(NIF_SHAPE);
    if (path === ".env.example") {
      expect(content).toMatch(/^ZALTYKO_SELLER_TAX_ID=$/mu);
      expect(content).toMatch(/^ZALTYKO_SELLER_PROFESSIONAL_ADDRESS=$/mu);
    }
  });
});

describe("el perfil del vendedor solo se evalúa en servidor", () => {
  function collect(directory: string): string[] {
    return readdirSync(join(REPO, directory), { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collect(path);
      return /\.(ts|tsx)$/u.test(entry.name) ? [path] : [];
    });
  }
  const files = collect("src");
  const isClientModule = (content: string) => /^\s*["']use client["']/u.test(content);

  it("ningún módulo de cliente importa el perfil ni la identificación del prestador", () => {
    const offenders = files.filter((path) => {
      const content = source(path);
      return (
        isClientModule(content) &&
        /@\/lib\/launch\/commercial-launch-profile|@\/components\/legal\/SellerIdentification/u.test(content)
      );
    });
    expect(offenders).toEqual([]);
    expect(isClientModule(source("src/components/legal/SellerIdentification.tsx"))).toBe(false);
    expect(isClientModule(source(PROFILE_PATH))).toBe(false);
  });

  it("las variables nunca se exponen con prefijo NEXT_PUBLIC_", () => {
    for (const path of [...files, ".env.example"]) {
      expect(source(path), path).not.toMatch(/NEXT_PUBLIC_ZALTYKO_SELLER/u);
    }
  });
});
