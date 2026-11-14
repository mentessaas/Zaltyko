import { z } from "zod";

/**
 * Familias: alta en el portal por invitación y avisos de sesión.
 *
 * Contrato puro (sin base de datos): esquemas de entrada, estados que ve la
 * academia, textos de avisos y de correos. Los servicios de
 * application/ repiten cada comprobación dentro de su transacción.
 */

/** Bandera exacta, apagada por defecto. */
export const FAMILY_ACCESS_FLAG = "ZALTYKO_FAMILY_ACCESS_ENABLED";

export function isFamilyAccessFlagOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[FAMILY_ACCESS_FLAG] === "true";
}

/** Caducidad del enlace de invitación. */
export const FAMILY_INVITATION_TTL_DAYS = 7;
/** Tiempo mínimo entre dos envíos del mismo enlace (reenviar). */
export const FAMILY_INVITATION_RESEND_COOLDOWN_MINUTES = 10;
/** Máximo de invitaciones de una invitación masiva. */
export const FAMILY_BULK_INVITATION_LIMIT = 200;
/** Máximo de familias destinatarias de un aviso. */
export const FAMILY_NOTICE_RECIPIENT_LIMIT = 500;

export const familyUuidSchema = z.guid();
export const familyTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
export const familyIdempotencyKeySchema = z.string().trim().min(8).max(180);

const ownerScope = {
  organizationId: familyUuidSchema,
  locationId: familyUuidSchema,
};

export const familyAccessCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...ownerScope, action: z.literal("invite"), guardianId: familyUuidSchema, grantViewAthletes: z.boolean() }).strict(),
  z.object({ ...ownerScope, action: z.literal("invite_all"), grantViewAthletes: z.boolean() }).strict(),
  z.object({ ...ownerScope, action: z.literal("resend"), invitationId: familyUuidSchema, revision: z.number().int().positive() }).strict(),
  z.object({ ...ownerScope, action: z.literal("revoke"), invitationId: familyUuidSchema, revision: z.number().int().positive() }).strict(),
  z.object({ ...ownerScope, action: z.literal("remove_access"), guardianId: familyUuidSchema }).strict(),
]);
export type FamilyAccessCommand = z.infer<typeof familyAccessCommandSchema>;

const noticeTitleSchema = z.string().trim().min(1).max(140).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const noticeBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => !/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value));

export const manualNoticeCommandSchema = z
  .object({
    ...ownerScope,
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("class"), classTemplateId: familyUuidSchema }).strict(),
      z.object({ kind: z.literal("group"), groupId: familyUuidSchema }).strict(),
    ]),
    title: noticeTitleSchema,
    body: noticeBodySchema,
  })
  .strict();
export type ManualNoticeCommand = z.infer<typeof manualNoticeCommandSchema>;

const reasonSchema = z
  .string()
  .trim()
  .max(300)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));

export const sessionChangeCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...ownerScope, action: z.literal("cancel"), reason: reasonSchema.nullable() }).strict(),
  z
    .object({
      ...ownerScope,
      action: z.literal("reschedule"),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      reason: reasonSchema.nullable(),
    })
    .strict()
    .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
      path: ["endsAt"],
      message: "La hora de fin debe ser posterior a la de inicio.",
    })
    .refine((value) => Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 12 * 60 * 60 * 1000, {
      path: ["endsAt"],
      message: "Una sesión no puede durar más de 12 horas.",
    }),
]);
export type SessionChangeCommand = z.infer<typeof sessionChangeCommandSchema>;

export const familyPreferencesSchema = z
  .object({
    organizationId: familyUuidSchema,
    emailSessionChanges: z.boolean(),
    emailManualNotices: z.boolean(),
  })
  .strict();
export type FamilyPreferencesInput = z.infer<typeof familyPreferencesSchema>;

export const markNoticesReadSchema = z
  .object({ noticeIds: z.array(familyUuidSchema).min(1).max(50) })
  .strict();

// ---------------------------------------------------------------------------
// Estados que ve la academia
// ---------------------------------------------------------------------------

export type GuardianPortalStatus =
  | "linked"
  | "pending"
  | "expired"
  | "revoked"
  | "removed"
  | "not_invited";

export const GUARDIAN_PORTAL_STATUS_LABELS: Record<GuardianPortalStatus, string> = {
  linked: "Con acceso",
  pending: "Invitación pendiente",
  expired: "Invitación caducada",
  revoked: "Invitación revocada",
  removed: "Acceso retirado",
  not_invited: "Sin invitar",
};

export type LatestInvitationFacts = {
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
} | null;

/**
 * Estado del acceso de un tutor. La cuenta vinculada manda: si el tutor tiene
 * cuenta, tiene acceso aunque la invitación sea antigua. Sin cuenta, el estado
 * sale de la última invitación.
 */
export function guardianPortalStatus(input: {
  hasLinkedAccount: boolean;
  latestInvitation: LatestInvitationFacts;
  now: Date;
}): GuardianPortalStatus {
  if (input.hasLinkedAccount) return "linked";
  const latest = input.latestInvitation;
  if (!latest) return "not_invited";
  if (latest.status === "accepted") return "removed";
  if (latest.status === "revoked") return "revoked";
  return new Date(latest.expiresAt).getTime() <= input.now.getTime() ? "expired" : "pending";
}

/** Acciones que la academia puede pedir en cada estado. */
export function guardianPortalActions(status: GuardianPortalStatus, hasEmail: boolean) {
  return {
    invite: hasEmail && ["not_invited", "revoked", "removed"].includes(status),
    resend: hasEmail && ["pending", "expired"].includes(status),
    revoke: ["pending", "expired"].includes(status),
    removeAccess: status === "linked",
  };
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

export type FamilyNoticeKind = "session_cancelled" | "session_rescheduled" | "session_substitution" | "manual";

export const FAMILY_NOTICE_KIND_LABELS: Record<FamilyNoticeKind, string> = {
  session_cancelled: "Sesión cancelada",
  session_rescheduled: "Cambio de horario",
  session_substitution: "Cambio de entrenadora",
  manual: "Aviso de la academia",
};

export function formatSessionWhen(startsAt: Date, endsAt: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone }).format(startsAt);
  const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  return `${day}, de ${time.format(startsAt)} a ${time.format(endsAt)}`;
}

/**
 * Texto del aviso de una sesión. No nombra a ninguna gimnasta ni a ninguna
 * entrenadora, ni copia el motivo interno de una sustitución: el aviso llega a
 * varias familias a la vez.
 */
export function sessionNoticeText(input: {
  kind: Exclude<FamilyNoticeKind, "manual">;
  className: string;
  locationName: string;
  timeZone: string;
  startsAt: Date;
  endsAt: Date;
  newStartsAt?: Date;
  newEndsAt?: Date;
  reason?: string | null;
}): { title: string; body: string } {
  const when = formatSessionWhen(input.startsAt, input.endsAt, input.timeZone);
  const place = `${input.className} (${input.locationName})`;
  const reason = input.reason?.trim() ? `\nMotivo: ${input.reason.trim()}` : "";
  if (input.kind === "session_cancelled") {
    return { title: `Sesión cancelada: ${input.className}`.slice(0, 140), body: `Se cancela la sesión de ${place} del ${when}.${reason}` };
  }
  if (input.kind === "session_rescheduled") {
    if (!input.newStartsAt || !input.newEndsAt) throw new Error("A rescheduled notice needs the new times");
    const next = formatSessionWhen(input.newStartsAt, input.newEndsAt, input.timeZone);
    return {
      title: `Cambio de horario: ${input.className}`.slice(0, 140),
      body: `La sesión de ${place} del ${when} pasa al ${next}.${reason}`,
    };
  }
  return {
    title: `Cambio de entrenadora: ${input.className}`.slice(0, 140),
    body: `La sesión de ${place} del ${when} la dará otra persona del equipo de la academia.`,
  };
}

// ---------------------------------------------------------------------------
// Correos
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join("");
}

export function familyInvitationUrl(baseUrl: string, token: string): string {
  // El token va en el fragmento: no llega al servidor, a los registros ni al Referer.
  return `${baseUrl.replace(/\/+$/u, "")}/familia/aceptar#token=${token}`;
}

/** Correo de invitación. No incluye nombres de gimnastas ni datos de la familia. */
export function familyInvitationEmail(input: { academyName: string; url: string; expiresAt: Date }) {
  const expires = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(input.expiresAt);
  const subject = `${input.academyName} te invita a su portal de familias`.slice(0, 160);
  const text = [
    `${input.academyName} te invita al portal de familias de Zaltyko, donde podrás consultar el horario, la asistencia y los avisos de tus gimnastas.`,
    `Abre este enlace con la cuenta de este mismo correo (puedes crearla en el momento): ${input.url}`,
    `El enlace sirve una sola vez y caduca el ${expires}. Si no esperabas este correo, ignóralo: sin aceptar no se comparte ningún dato.`,
  ].join("\n\n");
  const html = `${paragraphs(text.split("\n\n")[0]!)}<p style="margin:0 0 12px"><a href="${escapeHtml(input.url)}">Aceptar la invitación</a></p>${paragraphs(text.split("\n\n")[2]!)}`;
  return { subject, text, html };
}

/**
 * Correo de aviso. El asunto queda en el registro de envíos: en los avisos de
 * sesión lleva el título (clase y tipo de cambio, sin nombres); en los avisos
 * manuales, un asunto genérico, porque el título lo escribe la academia.
 */
export function familyNoticeEmail(input: { academyName: string; kind: FamilyNoticeKind; title: string; body: string; portalUrl: string }) {
  const subject = (input.kind === "manual" ? `${input.academyName}: tienes un aviso nuevo` : `${input.academyName}: ${input.title}`).slice(0, 160);
  const heading = input.kind === "manual" ? `<p style="margin:0 0 12px"><strong>${escapeHtml(input.title)}</strong></p>` : "";
  const footer = "Puedes desactivar estos correos en Avisos, dentro del portal de familias.";
  const text = `${input.kind === "manual" ? `${input.title}\n\n` : ""}${input.body}\n\nVer el aviso en el portal: ${input.portalUrl}\n\n${footer}`;
  const html = `${heading}${paragraphs(input.body)}<p style="margin:0 0 12px"><a href="${escapeHtml(input.portalUrl)}">Ver el aviso en el portal</a></p><p style="margin:0;color:#5b6475;font-size:13px">${escapeHtml(footer)}</p>`;
  return { subject, text, html };
}

/** Preferencia que decide el correo de un aviso. El aviso del portal se guarda siempre. */
export function noticeEmailAllowed(kind: FamilyNoticeKind, preferences: { emailSessionChanges: boolean; emailManualNotices: boolean }): boolean {
  return kind === "manual" ? preferences.emailManualNotices : preferences.emailSessionChanges;
}

// ---------------------------------------------------------------------------
// Hora local de la sede
// ---------------------------------------------------------------------------

function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return asUtc - instant;
}

/**
 * Instante UTC de una fecha y hora de pared en la zona de la sede
 * («2026-11-20», «18:30», «Europe/Madrid»). Dos pasadas para acertar en los
 * cambios de horario. Devuelve null si la entrada no es válida.
 */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const clock = /^(\d{2}):(\d{2})$/u.exec(time);
  if (!day || !clock) return null;
  const [year, month, dayOfMonth, hour, minute] = [day[1], day[2], day[3], clock[1], clock[2]].map(Number) as [number, number, number, number, number];
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31 || hour > 23 || minute > 59) return null;
  const wall = Date.UTC(year, month - 1, dayOfMonth, hour, minute);
  try {
    let instant = wall - zoneOffsetMs(wall, timeZone);
    instant = wall - zoneOffsetMs(instant, timeZone);
    return new Date(instant);
  } catch {
    return null;
  }
}

/** Fecha («2026-11-20») y hora («18:30») de pared de un instante en la zona de la sede. */
export function utcToZonedWallTime(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}
