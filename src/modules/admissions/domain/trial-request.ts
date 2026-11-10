import { z } from "zod";

/**
 * P2 #15 · Solicitud de prueba desde el enlace público de la academia.
 *
 * Es la única etapa del embudo que no existía en `zaltyko.*`: una petición de
 * una persona adulta que todavía no es gimnasta. La lista de espera y la
 * inscripción siguen viviendo en sus tablas canónicas; la solicitud solo
 * guarda los identificadores resultantes cuando se convierte.
 */

/** Fecha de la versión del texto de consentimiento mostrado en el formulario. */
export const TRIAL_REQUEST_PRIVACY_VERSION = "2026-11-10";

export const trialRequestStatuses = [
  "new",
  "contacted",
  "converted",
  "waitlisted",
  "declined",
] as const;
export type TrialRequestStatus = (typeof trialRequestStatuses)[number];

/** Estados que todavía piden una acción de la academia. */
export const openTrialRequestStatuses = ["new", "contacted"] as const satisfies readonly TrialRequestStatus[];
export const closedTrialRequestStatuses = ["converted", "waitlisted", "declined"] as const satisfies readonly TrialRequestStatus[];

export const trialRequestStatusLabels: Record<TrialRequestStatus, string> = {
  new: "Nueva",
  contacted: "Contactada",
  converted: "Pasada a inscripción",
  waitlisted: "En lista de espera",
  declined: "Descartada",
};

/** Cambios manuales de estado. La conversión tiene su propio comando. */
const manualTransitions: Record<TrialRequestStatus, readonly TrialRequestStatus[]> = {
  new: ["contacted", "declined"],
  contacted: ["declined"],
  declined: ["contacted"],
  converted: [],
  waitlisted: [],
};

export function canTransitionTrialRequest(
  from: TrialRequestStatus,
  to: TrialRequestStatus
): boolean {
  return manualTransitions[from].includes(to);
}

export function isOpenTrialRequest(status: TrialRequestStatus): boolean {
  return (openTrialRequestStatuses as readonly string[]).includes(status);
}

/** Token público del enlace: 128 bits aleatorios en hexadecimal. */
export const admissionLinkTokenSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{32}$/u);

const controlCharacters = /[\u0000-\u001f\u007f]/u;
const htmlLike = /[<>]/u;

function plainLine(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !controlCharacters.test(value) && !htmlLike.test(value), {
      message: "Utiliza texto sin símbolos especiales",
    })
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "));
}

const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .transform((value) => value.replace(/\s+/gu, " "))
  .refine((value) => value === "" || /^\+?[0-9 ().-]{6,40}$/u.test(value), {
    message: "Escribe un teléfono válido o déjalo vacío",
  })
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .transform((value) => value ?? null);

const optionalMessage = z
  .string()
  .trim()
  .max(500)
  .refine((value) => !htmlLike.test(value), { message: "Utiliza texto sin HTML" })
  .transform((value) => {
    const normalized = value.normalize("NFC").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, "");
    return normalized === "" ? null : normalized;
  })
  .nullable()
  .transform((value) => value ?? null);

export function maxTrialRequestBirthYear(now = new Date()): number {
  return now.getUTCFullYear();
}

/**
 * Formulario público. Solo pide lo imprescindible para que la academia
 * responda: persona adulta, contacto, nombre de pila de la gimnasta y, si se
 * quiere, su año de nacimiento para orientar el grupo. Nada de apellidos,
 * fecha completa, salud ni imágenes de menores.
 */
export const publicTrialRequestSchema = z
  .object({
    linkToken: admissionLinkTokenSchema,
    locationId: z
      .guid()
      .transform((value) => value.toLowerCase())
      .nullable(),
    submissionId: z.guid().transform((value) => value.toLowerCase()),
    contactName: plainLine(2, 100),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .email()
      .transform((value) => value.toLowerCase()),
    contactPhone: optionalPhone,
    athleteGivenName: plainLine(1, 60),
    athleteBirthYear: z
      .number()
      .int()
      .min(1940)
      .refine((year) => year <= maxTrialRequestBirthYear(), {
        message: "El año no puede ser futuro",
      })
      .nullable(),
    message: optionalMessage,
    privacyConsent: z.literal(true),
    /** Honeypot: un navegador real lo deja vacío. */
    website: z.string().max(200).nullable().optional(),
  })
  .strict();

export type PublicTrialRequestInput = z.input<typeof publicTrialRequestSchema>;
export type PublicTrialRequest = z.output<typeof publicTrialRequestSchema>;

export const ownerTrialRequestListQuerySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid().optional(),
    view: z.enum(["open", "closed"]).default("open"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const ownerTrialRequestStatusCommandSchema = z
  .object({
    organizationId: z.guid(),
    expectedRevision: z.number().int().positive(),
    status: z.enum(["contacted", "declined"]),
  })
  .strict();

const relationshipSchema = z.enum([
  "parent",
  "legal_guardian",
  "foster_guardian",
  "other",
]);

const ownerTrialRequestConvertBaseSchema = z
  .object({
    organizationId: z.guid(),
    expectedRevision: z.number().int().positive(),
    familyName: plainLine(1, 100),
    relationship: relationshipSchema,
    destination: z.enum(["enrollment", "waitlist"]),
    classTemplateId: z.guid().nullable(),
  })
  .strict();

/** Comando del servicio: la lista de espera está implementada y probada. */
export const ownerTrialRequestConvertCommandSchema = ownerTrialRequestConvertBaseSchema.superRefine((value, context) => {
  if (value.destination === "waitlist" && !value.classTemplateId) {
    context.addIssue({
      code: "custom",
      path: ["classTemplateId"],
      message: "Elige la clase de la lista de espera",
    });
  }
  if (value.destination === "enrollment" && value.classTemplateId) {
    context.addIssue({
      code: "custom",
      path: ["classTemplateId"],
      message: "La inscripción se completa en la bandeja de gimnastas",
    });
  }
});

export const TRIAL_REQUEST_WAITLIST_UNAVAILABLE =
  "La lista de espera todavía no está disponible en la bandeja";

/**
 * Comando de la ruta HTTP: rechaza la lista de espera hasta que exista una
 * vista de espera en /owner (hoy ninguna pantalla lee `waitlist_entries`).
 */
export const ownerTrialRequestConvertRouteSchema = ownerTrialRequestConvertBaseSchema.superRefine((value, context) => {
  if (value.destination === "waitlist") {
    context.addIssue({ code: "custom", path: ["destination"], message: TRIAL_REQUEST_WAITLIST_UNAVAILABLE });
    return;
  }
  if (value.classTemplateId) {
    context.addIssue({
      code: "custom",
      path: ["classTemplateId"],
      message: "La inscripción se completa en la bandeja de gimnastas",
    });
  }
});

export const ownerAdmissionLinkCommandSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid().nullable(),
    action: z.enum(["enable", "disable", "regenerate"]),
  })
  .strict();

export const ownerTrialRequestAnonymizeCommandSchema = z
  .object({
    organizationId: z.guid(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();

/** Texto que sustituye a los datos personales suprimidos. */
export const ANONYMIZED_CONTACT_NAME = "Datos eliminados";
export const ANONYMIZED_ATHLETE_NAME = "—";
export function anonymizedContactEmail(requestId: string): string {
  return `eliminado-${requestId.toLowerCase().slice(0, 8)}@anonimizado.invalid`;
}

export type OwnerTrialRequestConvertCommand = z.output<
  typeof ownerTrialRequestConvertCommandSchema
>;

/**
 * Claves de idempotencia de la conversión. Incluyen la revisión esperada: la
 * conversión es una sola transacción, así que un fallo no deja nada guardado
 * y un intento posterior con otra revisión nunca choca con uno anterior.
 */
export function trialRequestIntakeKey(requestId: string, revision: number): string {
  return `admission-request:${requestId.toLowerCase()}:r${revision}:athlete`;
}

export function trialRequestWaitlistKey(requestId: string, revision: number): string {
  return `admission-request:${requestId.toLowerCase()}:r${revision}:waitlist`;
}

export function trialRequestShareUrl(origin: string, token: string): string {
  return new URL(`/solicitar-prueba/${encodeURIComponent(token)}`, origin).toString();
}
