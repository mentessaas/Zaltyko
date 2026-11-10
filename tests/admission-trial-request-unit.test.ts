import { describe, expect, it } from "vitest";

import {
  canManageTrialRequests,
  newAdmissionLinkToken,
  trialRequestLocationIds,
} from "@/modules/admissions/application/admission-requests";
import {
  TRIAL_REQUEST_PRIVACY_VERSION,
  anonymizedContactEmail,
  canTransitionTrialRequest,
  ownerAdmissionLinkCommandSchema,
  ownerTrialRequestAnonymizeCommandSchema,
  ownerTrialRequestConvertCommandSchema,
  ownerTrialRequestStatusCommandSchema,
  publicTrialRequestSchema,
  trialRequestIntakeKey,
  trialRequestShareUrl,
  trialRequestWaitlistKey,
} from "@/modules/admissions/domain/trial-request";

const ORG = "a0000000-0000-4000-8000-000000000001";
const SITE = "a0000000-0000-4000-8000-000000000011";
const OTHER_SITE = "a0000000-0000-4000-8000-000000000012";
const SUBMISSION = "a0000000-0000-4000-8000-0000000000aa";
const TOKEN = "0123456789abcdef0123456789abcdef";

function valid(overrides: Record<string, unknown> = {}) {
  return {
    linkToken: TOKEN,
    locationId: SITE,
    submissionId: SUBMISSION,
    contactName: "  Ana   Pérez ",
    contactEmail: "Ana@Example.INVALID",
    contactPhone: null,
    athleteGivenName: "Lúa",
    athleteBirthYear: null,
    message: null,
    privacyConsent: true,
    ...overrides,
  };
}

describe("formulario público de solicitud de prueba", () => {
  it("acepta null en los campos opcionales y normaliza nombre y email", () => {
    const parsed = publicTrialRequestSchema.parse(valid());
    expect(parsed).toMatchObject({
      contactName: "Ana Pérez",
      contactEmail: "ana@example.invalid",
      contactPhone: null,
      athleteBirthYear: null,
      message: null,
      locationId: SITE,
    });
  });

  it("convierte cadenas vacías opcionales en null", () => {
    const parsed = publicTrialRequestSchema.parse(valid({ contactPhone: "", message: "   " }));
    expect(parsed.contactPhone).toBeNull();
    expect(parsed.message).toBeNull();
  });

  it("exige el consentimiento de privacidad", () => {
    expect(publicTrialRequestSchema.safeParse(valid({ privacyConsent: false })).success).toBe(false);
    const { privacyConsent: _omitted, ...withoutConsent } = valid();
    expect(publicTrialRequestSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it("no admite datos de menores fuera de lo imprescindible", () => {
    for (const extra of [
      { athleteFamilyName: "Pérez" },
      { athleteDateOfBirth: "2017-05-04" },
      { health: "asma" },
    ]) {
      expect(publicTrialRequestSchema.safeParse(valid(extra)).success).toBe(false);
    }
  });

  it("rechaza años de nacimiento futuros, HTML y teléfonos inválidos", () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    expect(publicTrialRequestSchema.safeParse(valid({ athleteBirthYear: nextYear })).success).toBe(false);
    expect(publicTrialRequestSchema.safeParse(valid({ athleteGivenName: "<b>Lúa</b>" })).success).toBe(false);
    expect(publicTrialRequestSchema.safeParse(valid({ message: "<script>" })).success).toBe(false);
    expect(publicTrialRequestSchema.safeParse(valid({ contactPhone: "llámame" })).success).toBe(false);
    expect(publicTrialRequestSchema.safeParse(valid({ contactPhone: "+34 600 000 000" })).success).toBe(true);
    expect(publicTrialRequestSchema.safeParse(valid({ message: "x".repeat(501) })).success).toBe(false);
  });

  it("solo acepta tokens de enlace de 128 bits en hexadecimal", () => {
    expect(publicTrialRequestSchema.parse(valid({ linkToken: TOKEN.toUpperCase() })).linkToken).toBe(TOKEN);
    for (const linkToken of ["", "abc", `${TOKEN}0`, "g".repeat(32), ORG]) {
      expect(publicTrialRequestSchema.safeParse(valid({ linkToken })).success).toBe(false);
    }
    expect(publicTrialRequestSchema.safeParse(valid({ organizationId: ORG })).success).toBe(false);
  });

  it("genera tokens nuevos de 32 caracteres hexadecimales distintos", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => newAdmissionLinkToken()));
    expect(tokens.size).toBe(20);
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("fija la versión del texto de consentimiento", () => {
    expect(TRIAL_REQUEST_PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("estados y comandos de la bandeja", () => {
  it("solo permite los cambios manuales previstos", () => {
    expect(canTransitionTrialRequest("new", "contacted")).toBe(true);
    expect(canTransitionTrialRequest("new", "declined")).toBe(true);
    expect(canTransitionTrialRequest("contacted", "declined")).toBe(true);
    expect(canTransitionTrialRequest("declined", "contacted")).toBe(true);
    expect(canTransitionTrialRequest("contacted", "contacted")).toBe(false);
    expect(canTransitionTrialRequest("converted", "declined")).toBe(false);
    expect(canTransitionTrialRequest("waitlisted", "contacted")).toBe(false);
  });

  it("el cambio manual no permite cerrar como convertida", () => {
    expect(
      ownerTrialRequestStatusCommandSchema.safeParse({ organizationId: ORG, expectedRevision: 1, status: "converted" }).success
    ).toBe(false);
  });

  it("la lista de espera exige clase y la inscripción no la admite", () => {
    const base = { organizationId: ORG, expectedRevision: 1, familyName: "Pérez", relationship: "parent" };
    expect(ownerTrialRequestConvertCommandSchema.safeParse({ ...base, destination: "waitlist", classTemplateId: null }).success).toBe(false);
    expect(ownerTrialRequestConvertCommandSchema.safeParse({ ...base, destination: "enrollment", classTemplateId: SITE }).success).toBe(false);
    expect(ownerTrialRequestConvertCommandSchema.safeParse({ ...base, destination: "enrollment", classTemplateId: null }).success).toBe(true);
    expect(ownerTrialRequestConvertCommandSchema.safeParse({ ...base, destination: "waitlist", classTemplateId: SITE }).success).toBe(true);
  });

  it("deriva claves de idempotencia de la solicitud y su revisión", () => {
    expect(trialRequestIntakeKey(SUBMISSION.toUpperCase(), 1)).toBe(`admission-request:${SUBMISSION}:r1:athlete`);
    expect(trialRequestWaitlistKey(SUBMISSION, 2)).toBe(`admission-request:${SUBMISSION}:r2:waitlist`);
    expect(trialRequestIntakeKey(SUBMISSION, 1)).not.toBe(trialRequestIntakeKey(SUBMISSION, 2));
    expect(trialRequestIntakeKey(SUBMISSION, 10_000).length).toBeLessThanOrEqual(150);
  });

  it("construye el enlace público con el token, sin el id de la academia", () => {
    expect(trialRequestShareUrl("https://zaltyko.com", TOKEN)).toBe(`https://zaltyko.com/solicitar-prueba/${TOKEN}`);
  });

  it("valida los comandos de enlace y de supresión", () => {
    expect(ownerAdmissionLinkCommandSchema.safeParse({ organizationId: ORG, locationId: null, action: "enable" }).success).toBe(true);
    expect(ownerAdmissionLinkCommandSchema.safeParse({ organizationId: ORG, locationId: SITE, action: "regenerate" }).success).toBe(true);
    expect(ownerAdmissionLinkCommandSchema.safeParse({ organizationId: ORG, action: "enable" }).success).toBe(false);
    expect(ownerAdmissionLinkCommandSchema.safeParse({ organizationId: ORG, locationId: null, action: "delete" }).success).toBe(false);
    expect(ownerTrialRequestAnonymizeCommandSchema.safeParse({ organizationId: ORG, expectedRevision: 2 }).success).toBe(true);
    expect(anonymizedContactEmail(SUBMISSION)).toMatch(/^eliminado-[0-9a-f]{8}@anonimizado\.invalid$/);
  });
});

describe("alcance por sede y permiso de gestión", () => {
  const scope = { locations: [{ id: SITE, name: "Sede 1" }] };

  it("limita las sedes a las autorizadas", () => {
    expect(trialRequestLocationIds(scope)).toEqual([SITE]);
    expect(trialRequestLocationIds(scope, SITE.toUpperCase())).toEqual([SITE]);
    let failure: unknown = null;
    try {
      trialRequestLocationIds(scope, OTHER_SITE);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
  });

  it("solo la dirección o administración con todas las sedes convierte", () => {
    expect(canManageTrialRequests({ member: { id: "m", role: "owner", locationScopeMode: "all" } })).toBe(true);
    expect(canManageTrialRequests({ member: { id: "m", role: "admin", locationScopeMode: "all" } })).toBe(true);
    expect(canManageTrialRequests({ member: { id: "m", role: "owner", locationScopeMode: "selected" } })).toBe(false);
    expect(canManageTrialRequests({ member: { id: "m", role: "manager", locationScopeMode: "all" } })).toBe(false);
    expect(canManageTrialRequests({ member: { id: "m", role: "coach", locationScopeMode: "all" } })).toBe(false);
  });
});
