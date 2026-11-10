import { describe, expect, it } from "vitest";

import {
  canConvertTrialRequests,
  trialRequestLocationIds,
} from "@/modules/admissions/application/admission-requests";
import {
  TRIAL_REQUEST_PRIVACY_VERSION,
  canTransitionTrialRequest,
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

function valid(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
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

  it("deriva claves de idempotencia estables a partir de la solicitud", () => {
    expect(trialRequestIntakeKey(SUBMISSION.toUpperCase())).toBe(`admission-request:${SUBMISSION}:athlete`);
    expect(trialRequestWaitlistKey(SUBMISSION)).toBe(`admission-request:${SUBMISSION}:waitlist`);
    expect(trialRequestIntakeKey(SUBMISSION).length).toBeLessThanOrEqual(150);
  });

  it("construye el enlace público por academia y, si se pide, por sede", () => {
    expect(trialRequestShareUrl("https://zaltyko.com", ORG)).toBe(`https://zaltyko.com/solicitar-prueba/${ORG}`);
    expect(trialRequestShareUrl("https://zaltyko.com", ORG, SITE)).toBe(
      `https://zaltyko.com/solicitar-prueba/${ORG}?sede=${SITE}`
    );
  });
});

describe("alcance por sede y permiso de conversión", () => {
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
    expect(canConvertTrialRequests({ member: { id: "m", role: "owner", locationScopeMode: "all" } })).toBe(true);
    expect(canConvertTrialRequests({ member: { id: "m", role: "admin", locationScopeMode: "all" } })).toBe(true);
    expect(canConvertTrialRequests({ member: { id: "m", role: "owner", locationScopeMode: "selected" } })).toBe(false);
    expect(canConvertTrialRequests({ member: { id: "m", role: "manager", locationScopeMode: "all" } })).toBe(false);
    expect(canConvertTrialRequests({ member: { id: "m", role: "coach", locationScopeMode: "all" } })).toBe(false);
  });
});
