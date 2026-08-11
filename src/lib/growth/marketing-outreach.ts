import { z } from "zod";

/**
 * Contratos publicos de outreach manual 1:1 auditado (ZAL-582 / ZAL-580).
 *
 * El espejo servidor vive en `src/app/api/admin/marketing/outreach/route.ts`;
 * mantener ambos sincronizados a mano hasta que el codegen Zod -> route
 * este disponible. Cualquier cambio aqui exige cambio en el route y en
 * `tests/marketing-outreach-reconciliation.test.ts`.
 */

export const MARKETING_OUTREACH_CHANNELS = [
  "instagram_dm",
  "whatsapp",
  "email",
  "phone",
  "other",
] as const;
export type MarketingOutreachChannel = (typeof MARKETING_OUTREACH_CHANNELS)[number];

export const MARKETING_OUTREACH_REPLY_KINDS = [
  "interested",
  "not_interested",
  "unsubscribe",
  "out_of_office",
  "other",
] as const;
export type MarketingOutreachReplyKind =
  (typeof MARKETING_OUTREACH_REPLY_KINDS)[number];

export const MARKETING_OUTREACH_MODALITIES = [
  "gymnastics_artistic",
  "gymnastics_rythmics",
] as const;
export type MarketingOutreachModality =
  (typeof MARKETING_OUTREACH_MODALITIES)[number];

export const MARKETING_OUTREACH_SOURCES = ["agent", "manual", "import", "test"] as const;
export type MarketingOutreachSource = (typeof MARKETING_OUTREACH_SOURCES)[number];

const isoCountryCode = /^[A-Z]{2}$/;
const isoConsentVersion = /^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const optionalTimestamp = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .optional();

const outreachCampaignIdSchema = z.string().min(1).max(120);
const academyFingerprintSchema = z.string().min(1).max(120);
const idempotencyKeySchema = z.string().min(8).max(200);

export const MarketingOutreachInputSchema = z
  .object({
    campaignId: outreachCampaignIdSchema,
    channel: z.enum(MARKETING_OUTREACH_CHANNELS),
    modality: z.enum(MARKETING_OUTREACH_MODALITIES).optional().nullable(),
    countryCode: z
      .string()
      .regex(isoCountryCode, "country_code debe ser ISO-3166 alpha-2")
      .optional()
      .nullable(),
    city: z.string().max(120).optional().nullable(),
    academyFingerprint: academyFingerprintSchema,
    academyId: z.string().uuid().optional().nullable(),
    attemptNumber: z.number().int().min(1).max(10).default(1),
    templateId: z.string().max(120).optional().nullable(),
    idempotencyKey: idempotencyKeySchema,
    sentAt: optionalTimestamp,
    replyAt: optionalTimestamp,
    replyKind: z.enum(MARKETING_OUTREACH_REPLY_KINDS).optional().nullable(),
    consentAt: optionalTimestamp,
    consentTextVersion: z
      .string()
      .regex(isoConsentVersion, "consent_text_version debe coincidir con vN-YYYY-MM-DD")
      .optional()
      .nullable(),
    demoSessionId: z.string().uuid().optional().nullable(),
    source: z.enum(MARKETING_OUTREACH_SOURCES).default("agent"),
    tenantId: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const sent = data.sentAt ? new Date(data.sentAt as string) : null;
    const reply = data.replyAt ? new Date(data.replyAt as string) : null;
    const consent = data.consentAt ? new Date(data.consentAt as string) : null;
    if (sent && reply && sent > reply) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sentAt debe ser <= replyAt",
        path: ["replyAt"],
      });
    }
    if (reply && consent && reply > consent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "replyAt debe ser <= consentAt",
        path: ["consentAt"],
      });
    }
    if (data.consentAt && !data.consentTextVersion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "consentTextVersion requerido cuando consentAt esta presente",
        path: ["consentTextVersion"],
      });
    }
    if (data.consentAt && !data.demoSessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "demoSessionId requerido cuando consentAt esta presente",
        path: ["demoSessionId"],
      });
    }
  });

export type MarketingOutreachInput = z.infer<typeof MarketingOutreachInputSchema>;

/**
 * Las siete denominaciones canónicas para reconciliar outreach
 * (alineadas con `Decisiones.md` 2026-08-11 ZAL-580). Cada clave del objeto
 * representa un contador SQL reproducible: el cockpit de Growth y el
 * reporte operativo de ZAL-586 se calculan a partir de estos conteos.
 */
export type MarketingOutreachDenominators = {
  attempts: number;
  replies: number;
  consented: number;
  demosHeld: number;
  firstValue: number;
  trialsStarted: number;
  paidConversions: number;
};

export const RECONCILIATION_DENOMINATOR_KEYS = [
  "attempts",
  "replies",
  "consented",
  "demosHeld",
  "firstValue",
  "trialsStarted",
  "paidConversions",
] as const satisfies ReadonlyArray<keyof MarketingOutreachDenominators>;

/**
 * Reconcilia los conteos SQL esperados a partir de un vector de filas
 * crudas (las que un SELECT sobre `marketing_outreach`/`growth_events`
 * devolveria en sandbox/local). Es puro: no toca la DB, no toca red,
 * no toca reloj. Las pruebas de reconciliación la consumen para fijar
 * los 7 escenarios.
 *
 * Reglas:
 * - attempts: filas con `sentAt` no nulo.
 * - replies: filas con `replyAt` no nulo.
 * - consented: filas con `consentAt` no nulo.
 * - demosHeld: filas con `demoSessionId` no nulo.
 * - firstValue: academies alcanzadas con al menos un `growthEvent` cuyo
 *   `eventName='academy_activated'` ocurre en o despues del `sentAt` mas
 *   temprano de esa academia.
 * - trialsStarted: idem con `eventName='trial_started'`.
 * - paidConversions: idem con `eventName='paid_conversion'`.
 */
export function reconcileMarketingOutreachDenominators<
  T extends {
    academyFingerprint: string;
    sentAt: Date | string | null;
    replyAt: Date | string | null;
    consentAt: Date | string | null;
    demoSessionId: string | null;
  },
  G extends {
    academyFingerprint: string;
    eventName: string;
    occurredAt: Date | string;
  },
>(rows: ReadonlyArray<T>, growthEvents: ReadonlyArray<G>): MarketingOutreachDenominators {
  const toMs = (value: Date | string | null): number | null => {
    if (value === null || value === undefined) return null;
    return value instanceof Date ? value.getTime() : new Date(value).getTime();
  };

  const earliestSendByAcademy = new Map<string, number>();
  for (const row of rows) {
    const sentMs = toMs(row.sentAt);
    if (sentMs === null) continue;
    const prev = earliestSendByAcademy.get(row.academyFingerprint);
    if (prev === undefined || sentMs < prev) {
      earliestSendByAcademy.set(row.academyFingerprint, sentMs);
    }
  }

  const matchedAcademiesByEvent = new Map<string, Set<string>>();
  for (const key of [
    "academy_activated",
    "trial_started",
    "paid_conversion",
  ] as const) {
    matchedAcademiesByEvent.set(key, new Set<string>());
  }

  for (const event of growthEvents) {
    const matchedSet = matchedAcademiesByEvent.get(event.eventName);
    if (!matchedSet) continue;
    const earliestMs = earliestSendByAcademy.get(event.academyFingerprint);
    if (earliestMs === undefined) continue;
    const eventMs = toMs(event.occurredAt);
    if (eventMs === null) continue;
    if (eventMs < earliestMs) continue;
    matchedSet.add(event.academyFingerprint);
  }

  let attempts = 0;
  let replies = 0;
  let consented = 0;
  let demosHeld = 0;
  for (const row of rows) {
    if (row.sentAt !== null && row.sentAt !== undefined) attempts += 1;
    if (row.replyAt !== null && row.replyAt !== undefined) replies += 1;
    if (row.consentAt !== null && row.consentAt !== undefined) consented += 1;
    if (row.demoSessionId !== null && row.demoSessionId !== undefined) {
      demosHeld += 1;
    }
  }

  return {
    attempts,
    replies,
    consented,
    demosHeld,
    firstValue: matchedAcademiesByEvent.get("academy_activated")!.size,
    trialsStarted: matchedAcademiesByEvent.get("trial_started")!.size,
    paidConversions: matchedAcademiesByEvent.get("paid_conversion")!.size,
  };
}

/**
 * Deduplicacion de idempotency_key: si dos INSERTs llegan con la misma
 * clave, el segundo no rompe nada y devuelve el mismo `id`. La prueba
 * `idempotent replay returns the same row` cubre el contrato.
 */
export function dedupeOutreachByIdempotencyKey<
  T extends { idempotencyKey: string; id: string },
>(incoming: T, existing: ReadonlyArray<T>): { row: T; deduped: boolean } {
  for (const row of existing) {
    if (row.idempotencyKey === incoming.idempotencyKey) {
      return { row, deduped: true };
    }
  }
  return { row: incoming, deduped: false };
}
