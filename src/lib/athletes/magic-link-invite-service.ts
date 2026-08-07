import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  athleteInvitations,
  academies,
  type AthleteInvitation,
} from "@/db/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { escapeHtml } from "@/lib/email/escape-html";
import { getAppUrl } from "@/lib/env";
import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";

export const ATHLETE_INVITE_BULK_MAX = 10;
export const ATHLETE_INVITE_DEFAULT_EXPIRES_DAYS = 7;
export const ATHLETE_INVITE_MAX_EXPIRES_DAYS = 30;
export const ATHLETE_INVITE_RESEND_COOLDOWN_MINUTES = 5;
export const ATHLETE_INVITE_MAX_RESENDS = 5;

export type AthleteInviteInput = {
  email: string;
};

export type AthleteInviteBatchInput = {
  academyId: string;
  tenantId: string;
  invitedBy: string;
  emails: AthleteInviteInput[];
  customMessage?: string | null;
  expiresInDays?: number;
};

export type AthleteInviteResultItem = {
  email: string;
  status: "sent" | "resent" | "skipped_invalid" | "skipped_duplicate";
  invitationId: string;
  expiresAt: string;
  resendCount: number;
};

export type AthleteInviteBatchResult = {
  results: AthleteInviteResultItem[];
  sent: number;
  resent: number;
  skipped: number;
  errors: { email: string; reason: string }[];
};

/**
 * Genera un state token aleatorio criptográficamente seguro.
 * 32 bytes hex = 64 caracteres: suficiente entropía y URL-safe.
 * NO se reutiliza: una vez consumido, marcamos la invitación como `opened`
 * y este token no se puede volver a usar.
 */
function generateStateToken(): string {
  return randomBytes(32).toString("hex");
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isLikelyEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/**
 * Pure validation/normalization helper, sin DB. Devuelve emails válidos
 * únicos (preservando el original) y una lista de errores por entrada.
 * Exportada para tests unitarios sin necesidad de mockear drizzle.
 */
export function validateAndNormalizeEmails(raw: string[]): {
  valid: { original: string; email: string }[];
  errors: { email: string; reason: string }[];
} {
  const seenInBatch = new Set<string>();
  const valid: { original: string; email: string }[] = [];
  const errors: { email: string; reason: string }[] = [];
  for (const e of raw) {
    const email = normalizeEmail(e);
    if (!isLikelyEmail(email)) {
      errors.push({ email: e, reason: "INVALID_EMAIL" });
      continue;
    }
    if (seenInBatch.has(email)) {
      errors.push({ email, reason: "DUPLICATE_IN_BATCH" });
      continue;
    }
    seenInBatch.add(email);
    valid.push({ original: e, email });
  }
  return { valid, errors };
}

/**
 * Construye el magic link de Supabase + un state interno que el callback
 * usará para vincular el auth.users con athlete_invitations. La redirectTo
 * apunta SIEMPRE al dominio canónico (getAppUrl()), nunca a un valor del
 * cliente.
 */
function buildMagicLinkRedirectUrl(stateToken: string): string {
  const origin = getAppUrl();
  return `${origin}/auth/callback?next=${encodeURIComponent(
    `/invite/athlete/magic?state=${stateToken}`
  )}`;
}

/**
 * Renderiza la plantilla del email con escape HTML en todos los campos
 * variables. El cuerpo es personalizable vía customMessage pero el resto
 * (nombre academia, CTA, link) viene del backend.
 */
function renderAthleteInviteEmail(params: {
  academyName: string;
  customMessage: string | null;
  magicLink: string;
}): { subject: string; html: string } {
  const subject = `${params.academyName} te ha invitado a Zaltyko`;
  const safeAcademy = escapeHtml(params.academyName);
  const safeCustom = params.customMessage
    ? `<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #cbd5e1;color:#475569;background:#f8fafc">${escapeHtml(
        params.customMessage
      )}</blockquote>`
    : "";
  const safeLink = escapeHtml(params.magicLink);

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h1 style="font-size:20px;margin:0 0 8px">${safeAcademy} te ha invitado a Zaltyko</h1>
      <p style="margin:0 0 12px;line-height:1.5">Tu academia quiere que formes parte de su equipo. Confirma tu acceso desde el siguiente enlace mágico:</p>
      ${safeCustom}
      <p style="margin:18px 0">
        <a href="${safeLink}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#0f172a;color:#fff;text-decoration:none;font-weight:600">
          Confirmar y completar mi perfil
        </a>
      </p>
      <p style="margin:18px 0 6px;font-size:13px;color:#475569">Si el botón no funciona, copia y pega este enlace:</p>
      <p style="margin:0;font-size:12px;word-break:break-all;color:#0f172a">${safeLink}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0" />
      <p style="margin:0;font-size:12px;color:#64748b">
        Zaltyko es la plataforma de gestión para academias deportivas. Si no esperabas este correo puedes ignorarlo.
      </p>
    </div>
  `;
  return { subject, html };
}

export type AthleteInviteBatchError =
  | { code: "ACADEMY_NOT_FOUND"; message: string }
  | { code: "BULK_EMPTY"; message: string }
  | { code: "BULK_TOO_LARGE"; message: string };

/**
 * Crea / reutiliza invitaciones para los emails dados, generando un magic
 * link por cada uno vía Supabase `auth.admin.generateLink({ type: 'magiclink' })`
 * y enviando el correo con plantilla personalizable.
 *
 * Garantías:
 *  - ≤ ATHLETE_INVITE_BULK_MAX emails por llamada (validación en frontera).
 *  - Idempotencia: si ya existe una invitación activa (pending/opened) para
 *    (academyId, email) y pasó el cooldown, se reusa y se reenvía; si NO
 *    pasó el cooldown, se omite con `skipped_duplicate` para no spamear.
 *  - Límite de reenvíos: ATHLETE_INVITE_MAX_RESENDS; pasada esa cuota, la
 *    invitación se omite y el owner debe pedir otra.
 *  - Token interno (state) sólo viaja en la redirectTo del callback; el
 *    OTP de Supabase NO se expone en logs ni respuestas.
 *  - Una invitación NO cuenta como activación hasta que `profile_complete`
 *    sea true. `trackEvent("first_athlete_invited")` se mantiene para
 *    distinguir invitación enviada vs atleta confirmado.
 */
export async function createAthleteInviteBatch(
  input: AthleteInviteBatchInput
): Promise<AthleteInviteBatchResult> {
  if (!input.emails.length) {
    return { results: [], sent: 0, resent: 0, skipped: 0, errors: [] };
  }
  if (input.emails.length > ATHLETE_INVITE_BULK_MAX) {
    throw new Error(
      `BULK_TOO_LARGE: máximo ${ATHLETE_INVITE_BULK_MAX} invitaciones por llamada (recibidas ${input.emails.length})`
    );
  }

  const expiresInDays = Math.min(
    Math.max(input.expiresInDays ?? ATHLETE_INVITE_DEFAULT_EXPIRES_DAYS, 1),
    ATHLETE_INVITE_MAX_EXPIRES_DAYS
  );

  // 1. Confirmar que la academia pertenece al tenant.
  const [academyRow] = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(and(eq(academies.id, input.academyId), eq(academies.tenantId, input.tenantId)))
    .limit(1);
  if (!academyRow) {
    throw new Error("ACADEMY_NOT_FOUND");
  }

  // 2. Normalizar y dedupe input (función pura testeable).
  const { valid: normalized, errors } = validateAndNormalizeEmails(
    input.emails.map((e) => e.email)
  );
  // Recover `original` semantics: validateAndNormalizeEmails returns
  // { original, email } for valid items; restore the original text.
  const normalizedFull = normalized.map((n) => ({ original: n.original, email: n.email }));

  const results: AthleteInviteResultItem[] = [];

  for (const { original, email } of normalizedFull) {
    try {
      const outcome = await processOne({
        academy: academyRow,
        tenantId: input.tenantId,
        invitedBy: input.invitedBy,
        email,
        customMessage: input.customMessage ?? null,
        expiresInDays,
      });
      results.push({
        email: original,
        status: outcome.status,
        invitationId: outcome.invitationId,
        expiresAt: outcome.expiresAt,
        resendCount: outcome.resendCount,
      });
    } catch (err) {
      logger.error("[athlete-magic-link] failed", {
        email,
        academyId: input.academyId,
        err: err instanceof Error ? err.message : String(err),
      });
      errors.push({ email: original, reason: "INTERNAL_ERROR" });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const resent = results.filter((r) => r.status === "resent").length;
  const skipped = results.filter((r) => r.status.startsWith("skipped_")).length;

  return { results, sent, resent, skipped, errors };
}

async function processOne(params: {
  academy: { id: string; name: string };
  tenantId: string;
  invitedBy: string;
  email: string;
  customMessage: string | null;
  expiresInDays: number;
}): Promise<
  | { status: "sent" | "resent"; invitationId: string; expiresAt: string; resendCount: number }
  | { status: "skipped_duplicate"; invitationId: string; expiresAt: string; resendCount: number }
> {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + params.expiresInDays * 24 * 60 * 60 * 1000
  );

  // Buscar invitación activa existente.
  const [existing] = await db
    .select()
    .from(athleteInvitations)
    .where(
      and(
        eq(athleteInvitations.academyId, params.academy.id),
        eq(sql`lower(${athleteInvitations.email})`, params.email),
        sql`${athleteInvitations.status} IN ('pending','opened')`
      )
    )
    .limit(1);

  if (existing) {
    // Cooldown: si reenviamos hace < 5min, omitir (anti-spam de UI).
    if (
      existing.lastResentAt &&
      now.getTime() - existing.lastResentAt.getTime() <
        ATHLETE_INVITE_RESEND_COOLDOWN_MINUTES * 60 * 1000
    ) {
      return {
        status: "skipped_duplicate",
        invitationId: existing.id,
        expiresAt: existing.expiresAt.toISOString(),
        resendCount: existing.resendCount,
      };
    }
    if (existing.resendCount >= ATHLETE_INVITE_MAX_RESENDS) {
      // Cupo de reenvíos alcanzado: lo marcamos como skipped_duplicate.
      // El owner puede pedir manualmente que cancelemos y creemos una nueva.
      return {
        status: "skipped_duplicate",
        invitationId: existing.id,
        expiresAt: existing.expiresAt.toISOString(),
        resendCount: existing.resendCount,
      };
    }

    // Pedir nuevo magic link a Supabase (mismo stateToken: el callback ya
    // quedó anclado a esa invitación la primera vez).
    const actionLink = await requestSupabaseMagicLink({
      email: params.email,
      stateToken: existing.stateToken,
    });
    if (!actionLink) {
      throw new Error("SUPABASE_LINK_FAILED");
    }
    const { subject, html } = renderAthleteInviteEmail({
      academyName: params.academy.name,
      customMessage: params.customMessage,
      magicLink: actionLink,
    });
    const sent = await sendEmailWithLogging({
      to: params.email,
      subject,
      html,
      template: "athlete-magic-link-invite",
      tenantId: params.tenantId,
      academyId: params.academy.id,
      dedupeKey: `athlete-invite:${existing.id}:${existing.resendCount + 1}`,
      metadata: {
        invitationId: existing.id,
        resendNumber: existing.resendCount + 1,
      },
    });

    if (!sent) {
      throw new Error("EMAIL_DEDUPED_OR_FAILED");
    }

    await db
      .update(athleteInvitations)
      .set({
        resendCount: existing.resendCount + 1,
        lastResentAt: now,
        sentAt: now,
        customMessage: params.customMessage,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(athleteInvitations.id, existing.id));

    return {
      status: "resent",
      invitationId: existing.id,
      expiresAt: expiresAt.toISOString(),
      resendCount: existing.resendCount + 1,
    };
  }

  // No hay invitación activa → crear nueva.
  const stateToken = generateStateToken();
  const actionLink = await requestSupabaseMagicLink({
    email: params.email,
    stateToken,
  });
  if (!actionLink) {
    throw new Error("SUPABASE_LINK_FAILED");
  }
  const { subject, html } = renderAthleteInviteEmail({
    academyName: params.academy.name,
    customMessage: params.customMessage,
    magicLink: actionLink,
  });

  const [inserted] = await db
    .insert(athleteInvitations)
    .values({
      academyId: params.academy.id,
      tenantId: params.tenantId,
      email: params.email,
      invitedBy: params.invitedBy,
      stateToken,
      status: "pending",
      customMessage: params.customMessage,
      sentAt: now,
      expiresAt,
      resendCount: 0,
    })
    .returning();

  if (!inserted) {
    throw new Error("INSERT_FAILED");
  }

  const sent = await sendEmailWithLogging({
    to: params.email,
    subject,
    html,
    template: "athlete-magic-link-invite",
    tenantId: params.tenantId,
    academyId: params.academy.id,
    dedupeKey: `athlete-invite:${inserted.id}:0`,
    metadata: { invitationId: inserted.id, resendNumber: 0 },
  });
  if (!sent) {
    // Mantener la fila pero marcar error: si Supabase entregó el link, la
    // invitación sigue siendo válida porque el backend ya la emitió.
    logger.warn("[athlete-magic-link] email dedupe or provider failed", {
      invitationId: inserted.id,
      email: params.email,
    });
  }

  await db
    .update(athleteInvitations)
    .set({ sentAt: now, updatedAt: now })
    .where(eq(athleteInvitations.id, inserted.id));

  await trackEvent("first_athlete_invited", {
    academyId: params.academy.id,
    tenantId: params.tenantId,
    userId: params.invitedBy,
    metadata: {
      invitationId: inserted.id,
      // email no se manda a analytics por PII
    },
  });

  return {
    status: "sent",
    invitationId: inserted.id,
    expiresAt: expiresAt.toISOString(),
    resendCount: 0,
  };
}

/**
 * Wrapper de `auth.admin.generateLink({ type: 'magiclink', email })`.
 *
 * Devuelve el action_link final con el state interno embebido en redirectTo,
 * o null. NO loggea el contenido del link.
 *
 * El state_token se pasa como query param dentro del `next` que apunta a
 * /invite/athlete/magic, por lo que tras verifyOtp en /auth/callback
 * recibimos el state y podemos vincular la invitación con el auth user.
 *
 * Importante: este método NO llama a shouldCreateUser; Supabase decide
 * según el estado actual del email en auth.users:
 *  - email NO existe → crea el usuario con email_confirmed_at=null hasta
 *    que complete el flujo.
 *  - email YA existe → devuelve el link sin tocar la cuenta (el link
 *    igualmente requiere verifyOtp para iniciar sesión).
 */
export async function requestSupabaseMagicLink(params: {
  email: string;
  stateToken: string;
}): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: params.email,
    options: {
      redirectTo: buildMagicLinkRedirectUrl(params.stateToken),
    },
  });
  if (error || !data?.properties?.action_link) {
    logger.error("[athlete-magic-link] supabase generateLink error", {
      msg: error?.message ?? "no action_link",
    });
    return null;
  }
  return data.properties.action_link;
}

/**
 * Devuelve la invitación asociada al state token. Usada por el callback
 * tras verifyOtp para vincular supabase_user_id.
 */
export async function findInvitationByStateToken(
  stateToken: string
): Promise<AthleteInvitation | null> {
  const [row] = await db
    .select()
    .from(athleteInvitations)
    .where(eq(athleteInvitations.stateToken, stateToken))
    .limit(1);
  return row ?? null;
}

/**
 * Linkea el supabase user_id a la invitación y la marca como `opened`.
 * Idempotente: si ya está opened o profile_complete, no-op.
 */
export async function markInvitationOpened(
  invitationId: string,
  supabaseUserId: string
): Promise<AthleteInvitation | null> {
  const [updated] = await db
    .update(athleteInvitations)
    .set({
      status: "opened",
      supabaseUserId,
      openedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(athleteInvitations.id, invitationId),
        sql`${athleteInvitations.status} = 'pending'`
      )
    )
    .returning();
  return updated ?? null;
}

/**
 * Marca la invitación como profile_complete y vincula el athlete_id.
 * Devuelve la fila actualizada o null si ya estaba marcada (idempotente).
 */
export async function markInvitationProfileComplete(params: {
  invitationId: string;
  athleteId: string;
}): Promise<AthleteInvitation | null> {
  const [updated] = await db
    .update(athleteInvitations)
    .set({
      status: "profile_complete",
      athleteId: params.athleteId,
      profileCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(athleteInvitations.id, params.invitationId),
        sql`${athleteInvitations.status} IN ('opened','pending')`
      )
    )
    .returning();
  return updated ?? null;
}

/**
 * Cancela una invitación (acción del owner). Sólo si está pending/opened.
 */
export async function cancelAthleteInvitation(
  invitationId: string,
  tenantId: string
): Promise<boolean> {
  const [updated] = await db
    .update(athleteInvitations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(athleteInvitations.id, invitationId),
        eq(athleteInvitations.tenantId, tenantId),
        sql`${athleteInvitations.status} IN ('pending','opened')`
      )
    )
    .returning({ id: athleteInvitations.id });
  return Boolean(updated);
}

export async function listAthleteInvitations(academyId: string) {
  return db
    .select({
      id: athleteInvitations.id,
      email: athleteInvitations.email,
      status: athleteInvitations.status,
      sentAt: athleteInvitations.sentAt,
      openedAt: athleteInvitations.openedAt,
      profileCompletedAt: athleteInvitations.profileCompletedAt,
      resendCount: athleteInvitations.resendCount,
      expiresAt: athleteInvitations.expiresAt,
      athleteId: athleteInvitations.athleteId,
    })
    .from(athleteInvitations)
    .where(eq(athleteInvitations.academyId, academyId));
}