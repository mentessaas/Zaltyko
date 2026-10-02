import { describe, it, expect } from "vitest";
import {
  EntryDataSchema,
  ClaimSchema,
  QuerySchema,
  requiresReview,
  publicationError,
  entryPath,
  directoryAcademyIdentityMatches,
} from "@/lib/directory/contracts";
import {
  allowedSourceUrl,
  parseCandidates,
  structuredEvents,
} from "@/lib/directory/imports";
import { escapeIcs } from "@/lib/directory/calendar";
import { SubscriptionSchema, validToken } from "@/lib/directory/communications";
import {
  isSourceAuthorizationAttested,
  sourceAuthorizationProblem,
} from "@/lib/directory/source-authorization";
const data = {
  name: "Academia ficticia QA",
  countryCode: "pe",
  city: "Lima",
  sourceUrl: "https://example.org/academia",
  sourceName: "Fuente ficticia QA",
};
describe("Directorio: validación y aislamiento de contratos", () => {
  it("los campos opcionales vacíos no convierten una edición habitual en sensible", () => {
    const before = EntryDataSchema.parse(data);
    const after = EntryDataSchema.parse({
      ...data,
      description: "Descripción actualizada",
      website: null,
      address: null,
      region: null,
    });
    expect(requiresReview(before, after)).toBe(false);
    expect(
      requiresReview(before, {
        ...after,
        website: "https://example.org/otra-web",
      })
    ).toBe(true);
  });
  it("conserva la URL externa al activar un espacio operativo", () => {
    const listing = {
      id: "6f502f44-aa46-459f-afc5-fcaea07dfd69",
      kind: "academy" as const,
      slug: "academia-ejemplo",
    };
    expect(
      entryPath({
        ...listing,
        academyId: "00a04b20-bb07-45ed-baf8-efac179253a2",
      })
    ).toBe(entryPath(listing));
    expect(entryPath({ ...listing, academyId: listing.id })).toBe(
      `/academias/${listing.id}`
    );
  });
  it("solo activa una ficha con el nombre y sede ya aprobados", () => {
    const approved = {
      name: "Club Córdoba",
      countryCode: "ES",
      region: "Andalucía",
      city: "Córdoba",
    };
    expect(
      directoryAcademyIdentityMatches(approved, {
        name: " club cordoba ",
        countryCode: "es",
        region: "andalucia",
        city: "CORDOBA",
      })
    ).toBe(true);
    expect(
      directoryAcademyIdentityMatches(approved, {
        ...approved,
        name: "Otra academia",
      })
    ).toBe(false);
    expect(
      directoryAcademyIdentityMatches(approved, {
        ...approved,
        city: "Sevilla",
      })
    ).toBe(false);
    expect(
      directoryAcademyIdentityMatches(approved, {
        ...approved,
        region: "Madrid",
      })
    ).toBe(false);
    expect(
      directoryAcademyIdentityMatches(approved, {
        ...approved,
        countryCode: "PE",
      })
    ).toBe(false);
  });
  it("no rellena dirección ni contacto desconocidos", () => {
    const d = EntryDataSchema.parse(data);
    expect(d.countryCode).toBe("PE");
    expect(d.address).toBeUndefined();
    expect(d.contactEmail).toBeUndefined();
  });
  it("rechaza columnas del CRM y datos privados", () => {
    expect(
      EntryDataSchema.safeParse({
        ...data,
        lead_score: 95,
        contacto_personal: "persona",
      }).success
    ).toBe(false);
  });
  it.each([
    "javascript:alert(1)",
    "http://example.org",
    "https://user:password@example.org",
  ])("rechaza enlaces peligrosos %s", (sourceUrl) => {
    expect(EntryDataSchema.safeParse({ ...data, sourceUrl }).success).toBe(
      false
    );
  });
  it("rechaza HTML, fechas imposibles y horas sin zona", () => {
    expect(
      EntryDataSchema.safeParse({
        ...data,
        description: "<script>mal</script>",
      }).success
    ).toBe(false);
    expect(
      EntryDataSchema.safeParse({ ...data, startDate: "2026-02-31" }).success
    ).toBe(false);
    expect(
      EntryDataSchema.safeParse({ ...data, startTime: "14:00" }).success
    ).toBe(false);
  });
  it("separa cambios habituales de identidad", () => {
    const d = EntryDataSchema.parse(data);
    expect(requiresReview(d, { ...d, description: "Nueva descripción" })).toBe(
      false
    );
    expect(
      requiresReview(d, { ...d, contactEmail: "institucional@example.org" })
    ).toBe(true);
    expect(requiresReview(d, { ...d, name: "Otro nombre" })).toBe(true);
  });
  it("impide publicar eventos sin fecha u organizador", () => {
    expect(
      publicationError("event", EntryDataSchema.parse(data))
    ).not.toBeNull();
  });
  it("requiere evidencia y valida límites de consulta", () => {
    expect(
      ClaimSchema.safeParse({
        entryId: "mal",
        relationship: "yo",
        evidence: "sí",
      }).success
    ).toBe(false);
    expect(
      QuerySchema.safeParse({ kind: "academy", limit: 100000 }).success
    ).toBe(false);
  });
  it.each([
    "https://127.0.0.1",
    "https://rfegimnasia.es.evil.org",
    "http://rfegimnasia.es",
    "https://user:password@rfegimnasia.es",
    "https://rfegimnasia.es:8888",
  ])("bloquea fuente no permitida %s", (url) => {
    expect(() => allowedSourceUrl(url, "rfeg")).toThrow();
  });
  it("permite únicamente el dominio oficial del adaptador", () => {
    expect(
      allowedSourceUrl(
        "https://rfegimnasia.es/competiciones-nacionales/",
        "rfeg"
      ).hostname
    ).toBe("rfegimnasia.es");
  });
  it("exige condiciones HTTPS, referencia escrita y confirmación registrada", () => {
    const documented = {
      termsUrl: "https://federation.example/terms",
      authorization: "Permiso escrito: expediente LEG-2026-14",
    };
    expect(sourceAuthorizationProblem(documented)).toBeNull();
    expect(
      sourceAuthorizationProblem({ ...documented, termsUrl: null })
    ).toMatch(/condiciones/);
    expect(
      sourceAuthorizationProblem({
        ...documented,
        termsUrl: "http://example.org/terms",
      })
    ).toMatch(/HTTPS/);
    expect(
      sourceAuthorizationProblem({
        ...documented,
        authorization: "página pública",
      })
    ).toMatch(/autorización escrita/);
    expect(
      isSourceAuthorizationAttested({
        ...documented,
        authorizationAttested: false,
      })
    ).toBe(false);
    expect(
      isSourceAuthorizationAttested({
        ...documented,
        authorizationAttested: true,
      })
    ).toBe(true);
  });
  it("CSV usa exclusivamente una selección de campos públicos", () => {
    const result = parseCandidates(
      "externalId,kind,name,countryCode,city,sourceUrl,sourceName,lead_score\nclub,academy,Club ficticio,PE,Lima,https://example.org,Fuente,90",
      "csv"
    );
    expect(JSON.stringify(result)).not.toContain("lead_score");
  });
  it("calendario sin datos estructurados no inventa eventos", () => {
    expect(
      structuredEvents("<p>Calendario próximamente</p>", {
        url: "https://example.org",
        name: "Fuente",
        country_code: "ES",
      })
    ).toEqual([]);
  });
  it("evita inyección de líneas ICS", () => {
    expect(escapeIcs("Evento\nATTENDEE:evil@example.org; a,b")).toBe(
      "Evento\\nATTENDEE:evil@example.org\\; a\\,b"
    );
  });
  it("requiere consentimiento separado, expreso y versionado", () => {
    const base = {
      email: "persona@example.org",
      purpose: "kit",
      source: "kit",
      version: "directory-2026-09-30",
    };
    expect(SubscriptionSchema.safeParse(base).success).toBe(false);
    expect(
      SubscriptionSchema.safeParse({ ...base, consent: true }).success
    ).toBe(true);
    expect(
      SubscriptionSchema.safeParse({
        ...base,
        consent: true,
        version: "desconocida",
      }).success
    ).toBe(false);
  });
  it("no acepta tokens truncados ni otro propósito", () => {
    expect(validToken("bad", "a".repeat(64))).toBe(false);
    expect(validToken("a".repeat(64), "b".repeat(64))).toBe(false);
  });
});
