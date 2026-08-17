/**
 * ZAL-138 [D-006 v0] — Magic links Supabase para primeras atletas.
 *
 * Responsabilidades de este módulo:
 *  1. `inviteFirstAthletes()` — bulk invite con dedup, idempotencia y
 *     validación de límites (máx 10 emails).
 *  2. `acceptInvitationByEmail()` — cuando la atleta hace clic en el magic
 *     link, marcamos `magic_link_opened_at` y creamos el stub de atleta
 *     vinculado al `auth.users` recién autenticado.
 *  3. `completeAthleteProfile()` — cierra el flujo D-006 v0 gate 1: setea
 *     `profile_completed_at` cuando la atleta envía nombre + datos básicos.
 *
 * Decisiones explícitas:
 *  - La fuente del KPI TTFAA son las columnas `athletes.magic_link_opened_at`
 *    y `athletes.profile_completed_at` (no la tabla `athlete_invitations`).
 *  - NO expone tokens al cliente; el cliente solo ve su propio email como
 *    identificador una vez autenticado por magic link.
 *  - El aislamiento por tenant se mantiene porque el caller siempre pasa
 *    `tenantId + academyId` resueltos por `withTenant`; la app conecta como
 *    `postgres` con `BYPASSRLS` (ver CLAUDE.md → Security).
 *  - El índice único parcial `athlete_invitations_active_unique` hace que el
 *    reintento (mismo email + academia, mientras el estado esté vivo) sea
 *    un upsert: no se duplica la invitación.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athleteInvitations,
  academies,
  athletes,
} from "@/db/schema";
import type { DatabaseClient } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";

// ============================================================
// Límites y constantes (ZAL-138, D-006 v0)
// ============================================================

/** Máximo de invitaciones que un owner puede enviar en un solo POST. */
export const MAX_BULK_INVITES = 10;

/** Tiempo de vida del magic link. */
export const INVITATION_TTL_HOURS = 72;

/** Estados de la invitación (deben matchear CHECK en SQL si se añade). */
export const INVITATION_STATUS = {
  pending: "pending",
  sent: "sent",
  opened: "opened",
  completed: "completed",
  expired: "expired",
  revoked: "revoked",
} as const;

export type InvitationStatus =
  (typeof INVITATION_STATUS)[keyof typeof INVITATION_STATUS];

/** Estados que cuentan como "activos" para el índice único parcial. */
export const ACTIVE_STATUSES: InvitationStatus[] = [
  INVITATION_STATUS.pending,
  INVITATION_STATUS.sent,
  INVITATION_STATUS.opened,
];

// ============================================================
// Schemas Zod — validación en la frontera
// ============================================================

export const InviteFirstAthletesBodySchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().email())
    .min(1, "Debes enviar al menos un email")
    .max(
      MAX_BULK_INVITES,
      `Máximo ${MAX_BULK_INVITES} invitaciones por envío`
    ),
  template: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/i, "El nombre de plantilla solo permite letras, números y guion bajo")
    .optional(),
  customMessage: z.string().trim().max(500).optional(),
});

export type InviteFirstAthletesInput = z.infer<
  typeof InviteFirstAthletesBodySchema
>;

export const CompleteAthleteProfileBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha debe ser YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  level: z.string().trim().max(60).optional().or(z.literal("")),
});

export type CompleteAthleteProfileInput = z.infer<
  typeof CompleteAthleteProfileBodySchema
>;

// ============================================================
// Tipos públicos
// ============================================================

export interface InviteFirstAthletesResult {
  sent: Array<{
    email: string;
    invitationId: string;
    alreadySent: boolean;
    magicLinkSentAt: Date | null;
  }>;
  rejected: Array<{
    email: string;
    reason: string;
  }>;
}

export interface AcceptInvitationResult {
  invitationId: string;
  athleteId: string;
  status: InvitationStatus;
  alreadyOpened: boolean;
}

export interface CompleteProfileResult {
  athleteId: string;
  invitationId: string;
  status: InvitationStatus;
  profileCompletedAt: Date;
}

// ============================================================
// Dependencias inyectables (para tests + caller real)
// ============================================================

export interface SupabaseMagicLinkGenerator {
  /** Devuelve el action_link y un token opaco para tracking. */
  generateMagicLink(params: {
    email: string;
    redirectTo: string;
  }): Promise<{ actionLink: string; token: string }>;
}

export interface SupabaseMagicLinkResolver {
  /**
   * Dado un usuario autenticado por magic link, devuelve su id + email.
   * Se usa en `acceptInvitationByEmail` para emparejar la sesión con la
   * invitación pendiente y crear el athlete stub con el userId correcto.
   */
  getCurrentUser(): Promise<{ id: string; email: string } | null>;
}

/**
 * Default: usa Supabase admin para generar magic links. La función `generateLink`
 * con type='magiclink' crea el usuario si no existe y devuelve un action_link
 * que, al abrirlo, verifica el token y deja la sesión iniciada en el navegador.
 *
 * El redirectTo es a nuestro endpoint `/api/athlete-invitations/accept`, que
 * marca `magic_link_opened_at` y crea el stub de atleta.
 */
export function defaultSupabaseMagicLinkGenerator(): SupabaseMagicLinkGenerator {
  return {
    async generateMagicLink({ email, redirectTo }) {
      // Importación tardía para evitar cargar supabase admin en arranque
      // del cliente (módulos server-only). Ver CLAUDE.md → Security.
      const { getSupabaseAdminClient } = await import("@/lib/supabase/admin");
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (error || !data) {
        throw new Error(
          error?.message ?? "Supabase no devolvió magic link"
        );
      }
      const actionLink = data.properties?.action_link;
      // `token_hash` viene en propiedades o se deriva; algunas versiones de
      // supabase-js lo exponen vía `data.properties.email_otp` o como campo
      // separado. Guardamos el email_otp como token opaco de tracking.
      const token =
        (data.properties as { email_otp?: string } | undefined)?.email_otp ??
        actionLink ??
        crypto.randomUUID();
      if (!actionLink) {
        throw new Error("Supabase no devolvió action_link");
      }
      return { actionLink, token };
    },
  };
}

export function defaultSupabaseMagicLinkResolver(): SupabaseMagicLinkResolver {
  return {
    async getCurrentUser() {
      const { cookies } = await import("next/headers");
      const { createClient } = await import("@/lib/supabase/server");
      const cookieStore = await cookies();
      const supabase = await createClient(cookieStore);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return null;
      return { id: user.id, email: user.email };
    },
  };
}

// ============================================================
// Helpers de normalización
// ============================================================

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function buildRedirectUrl(origin: string): string {
  // El callback público que marca magic_link_opened_at. El athlete todavía no
  // tiene sesión en nuestro backend cuando hace clic; Supabase verifica el
  // token y deja cookie antes de redirigir.
  return `${origin.replace(/\/$/, "")}/api/athlete-invitations/accept`;
}

// ============================================================
// inviteFirstAthletes
// ============================================================

export interface InviteFirstAthletesOptions {
  tenantId: string;
  academyId: string;
  invitedBy: string;
  origin: string;
  generator?: SupabaseMagicLinkGenerator;
  tx?: DatabaseClient;
}

/**
 * Envía magic links a una lista de emails. Reglas:
 *  - Dedup por email normalizado dentro del mismo batch (sin case-sensitive).
 *  - Idempotente: si ya existe invitación activa para (academyId, email)
 *    → reutiliza la fila, regenera el magic link, incrementa `attempt_count`.
 *  - NO toca `athletes` aquí: el athlete row se crea al hacer clic.
 *  - Lanza 4xx-equivalent via rejected[]; no aborta el batch.
 */
export async function inviteFirstAthletes(
  input: InviteFirstAthletesInput,
  options: InviteFirstAthletesOptions
): Promise<InviteFirstAthletesResult> {
  const generator =
    options.generator ?? defaultSupabaseMagicLinkGenerator();
  const exec = options.tx ?? db;

  // Dedup intra-batch.
  const seen = new Set<string>();
  const uniqueEmails: string[] = [];
  for (const raw of input.emails) {
    const email = normalizeEmail(raw);
    if (seen.has(email)) continue;
    seen.add(email);
    uniqueEmails.push(email);
  }

  if (uniqueEmails.length === 0) {
    return { sent: [], rejected: [] };
  }

  const expiresAt = new Date(
    Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000
  );
  const redirectTo = buildRedirectUrl(options.origin);

  // Verificar que la academia existe y pertenece al tenant. Defensa explícita
  // porque el caller ya pasó por withTenant, pero el helper es reutilizable.
  const [academy] = await exec
    .select({ id: academies.id, tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, options.academyId))
    .limit(1);

  if (!academy || academy.tenantId !== options.tenantId) {
    return {
      sent: [],
      rejected: uniqueEmails.map((email) => ({
        email,
        reason: "ACADEMY_NOT_FOUND",
      })),
    };
  }

  const result: InviteFirstAthletesResult = { sent: [], rejected: [] };

  for (const email of uniqueEmails) {
    try {
      // Buscar invitación activa existente (pending/sent/opened).
      const [existing] = await exec
        .select({
          id: athleteInvitations.id,
          status: athleteInvitations.status,
          attemptCount: athleteInvitations.attemptCount,
          magicLinkSentAt: athleteInvitations.magicLinkSentAt,
          athleteId: athleteInvitations.athleteId,
        })
        .from(athleteInvitations)
        .where(
          and(
            eq(athleteInvitations.academyId, options.academyId),
            eq(athleteInvitations.emailNormalized, email),
            sql`${athleteInvitations.status} = ANY(${ACTIVE_STATUSES})`
          )
        )
        .limit(1);

      // Si ya completó (perfil lleno), no re-enviar. El owner puede revocar
      // y volver a invitar si quiere resetear.
      if (
        existing &&
        existing.status === INVITATION_STATUS.completed
      ) {
        result.rejected.push({
          email,
          reason: "ALREADY_CONFIRMED",
        });
        continue;
      }

      // Generar magic link (Supabase). Esto crea el auth.users si no existe.
      const { token } = await generator.generateMagicLink({
        email,
        redirectTo,
      });

      const sentAt = new Date();

      if (existing) {
        // Reintento: actualizamos fila existente (no duplicamos).
        await exec
          .update(athleteInvitations)
          .set({
            magicLinkToken: token,
            magicLinkSentAt: sentAt,
            attemptCount: (existing.attemptCount ?? 0) + 1,
            lastError: null,
            updatedAt: sentAt,
            template: input.template ?? "first_athlete_v1",
            customMessage: input.customMessage ?? null,
          })
          .where(eq(athleteInvitations.id, existing.id));

        result.sent.push({
          email,
          invitationId: existing.id,
          alreadySent: true,
          magicLinkSentAt: sentAt,
        });
        continue;
      }

      // Nueva invitación: insert directo. El índice único parcial puede
      // chocar si otra request creó la misma invitación en paralelo → ese
      // caso lo cubrimos re-leyendo.
      const inserted = await exec
        .insert(athleteInvitations)
        .values({
          tenantId: options.tenantId,
          academyId: options.academyId,
          email,
          emailNormalized: email,
          status: INVITATION_STATUS.sent,
          template: input.template ?? "first_athlete_v1",
          customMessage: input.customMessage ?? null,
          magicLinkToken: token,
          magicLinkSentAt: sentAt,
          invitedBy: options.invitedBy,
          attemptCount: 1,
          expiresAt,
        })
        .onConflictDoNothing({
          target: [
            athleteInvitations.academyId,
            athleteInvitations.emailNormalized,
          ],
        })
        .returning({
          id: athleteInvitations.id,
        });

      if (inserted.length === 0) {
        // Conflicto por carrera: otro request creó la misma invitación
        // entre nuestro SELECT y nuestro INSERT. Tratamos como reintento.
        const [raced] = await exec
          .select({
            id: athleteInvitations.id,
            attemptCount: athleteInvitations.attemptCount,
          })
          .from(athleteInvitations)
          .where(
            and(
              eq(athleteInvitations.academyId, options.academyId),
              eq(athleteInvitations.emailNormalized, email),
              sql`${athleteInvitations.status} = ANY(${ACTIVE_STATUSES})`
            )
          )
          .limit(1);

        if (!raced) {
          // No debería pasar, pero si ocurre lo tratamos como rechazo.
          result.rejected.push({
            email,
            reason: "INVITATION_RACE_LOST",
          });
          continue;
        }

        await exec
          .update(athleteInvitations)
          .set({
            magicLinkToken: token,
            magicLinkSentAt: sentAt,
            attemptCount: (raced.attemptCount ?? 0) + 1,
            lastError: null,
            updatedAt: sentAt,
          })
          .where(eq(athleteInvitations.id, raced.id));

        result.sent.push({
          email,
          invitationId: raced.id,
          alreadySent: true,
          magicLinkSentAt: sentAt,
        });
        continue;
      }

      result.sent.push({
        email,
        invitationId: inserted[0].id,
        alreadySent: false,
        magicLinkSentAt: sentAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      logger.error("inviteFirstAthletes: fallo generando magic link", error, {
        academyId: options.academyId,
        email,
      });
      // Persistimos el error en la fila para que el owner lo vea al listar.
      try {
        await exec
          .update(athleteInvitations)
          .set({ lastError: message, updatedAt: new Date() })
          .where(
            and(
              eq(athleteInvitations.academyId, options.academyId),
              eq(athleteInvitations.emailNormalized, email)
            )
          );
      } catch {
        // Best-effort: si falla el log, no abortamos el batch.
      }
      result.rejected.push({ email, reason: "MAGIC_LINK_FAILED" });
    }
  }

  return result;
}

// ============================================================
// acceptInvitationByEmail — callback cuando la atleta abre el magic link
// ============================================================

export interface AcceptInvitationOptions {
  resolver?: SupabaseMagicLinkResolver;
  tx?: DatabaseClient;
}

/**
 * Marca la invitación como `opened` y crea el stub de atleta si no existe.
 *
 * Idempotente: si la invitación ya está `opened` o `completed`, devuelve
 * `alreadyOpened: true` sin duplicar trabajo.
 *
 * Devuelve `null` si el email del usuario actual no tiene invitación pendiente
 * (caller debería redirigir a "link expirado" en ese caso).
 */
export async function acceptInvitationByEmail(
  options: AcceptInvitationOptions = {}
): Promise<AcceptInvitationResult | null> {
  const resolver =
    options.resolver ?? defaultSupabaseMagicLinkResolver();
  const exec = options.tx ?? db;

  const user = await resolver.getCurrentUser();
  if (!user) return null;

  const normalized = normalizeEmail(user.email);
  const userId = user.id;

  // Buscamos la invitación activa más reciente para este email.
  // Restringimos a invitations donde el atleta aún no completó perfil
  // (porque una vez completado, ya no es "first athlete pending").
  const [invitation] = await exec
    .select({
      id: athleteInvitations.id,
      academyId: athleteInvitations.academyId,
      tenantId: athleteInvitations.tenantId,
      status: athleteInvitations.status,
      athleteId: athleteInvitations.athleteId,
      expiresAt: athleteInvitations.expiresAt,
      magicLinkOpenedAt: athleteInvitations.magicLinkOpenedAt,
    })
    .from(athleteInvitations)
    .where(
      and(
        eq(athleteInvitations.emailNormalized, normalized),
        sql`${athleteInvitations.status} IN ('sent', 'opened')`
      )
    )
    .orderBy(asc(athleteInvitations.createdAt))
    .limit(1);

  if (!invitation) return null;

  // Expirada: la marcamos como expired y devolvemos null.
  if (invitation.expiresAt.getTime() < Date.now()) {
    await exec
      .update(athleteInvitations)
      .set({
        status: INVITATION_STATUS.expired,
        updatedAt: new Date(),
      })
      .where(eq(athleteInvitations.id, invitation.id));
    return null;
  }

  const now = new Date();
  const alreadyOpened = invitation.status === INVITATION_STATUS.opened;

  if (!alreadyOpened) {
    await exec
      .update(athleteInvitations)
      .set({
        status: INVITATION_STATUS.opened,
        magicLinkOpenedAt: now,
        updatedAt: now,
      })
      .where(eq(athleteInvitations.id, invitation.id));
  }

  // Si todavía no hay athlete row, creamos el stub. Vinculamos por userId
  // — Supabase ya creó el auth.users cuando envió el magic link.
  let athleteId = invitation.athleteId ?? null;

  if (!athleteId) {
    // Insert con onConflictDoNothing para idempotencia (alguien pudo crear
    // el athlete stub entre el SELECT y el INSERT en una carrera). El userId
    // viene de la sesión Supabase actual (la atleta ya abrió el magic link).
    const inserted = await exec
      .insert(athletes)
      .values({
        tenantId: invitation.tenantId,
        academyId: invitation.academyId,
        userId,
        name: normalized.split("@")[0] ?? "Atleta", // placeholder; lo corrige completeAthleteProfile
        status: "active",
        inviteEmail: normalized,
        magicLinkOpenedAt: now,
      })
      .onConflictDoNothing({ target: athletes.userId })
      .returning({ id: athletes.id });

    athleteId = inserted[0]?.id ?? null;

    if (!athleteId) {
      // Carrera perdida: re-leemos.
      const [existing] = await exec
        .select({ id: athletes.id })
        .from(athletes)
        .where(eq(athletes.userId, userId))
        .limit(1);
      athleteId = existing?.id ?? null;
    }

    if (athleteId) {
      await exec
        .update(athleteInvitations)
        .set({ athleteId, updatedAt: now })
        .where(eq(athleteInvitations.id, invitation.id));
    }
  } else {
    // Ya existe athlete row: asegurar que magicLinkOpenedAt queda seteado
    // (por si el flujo se invocó dos veces o se reinstaló).
    await exec
      .update(athletes)
      .set({ magicLinkOpenedAt: now })
      .where(eq(athletes.id, athleteId));
  }

  if (!athleteId) {
    logger.warn("acceptInvitationByEmail: no se pudo resolver athleteId", {
      invitationId: invitation.id,
      email: normalized,
    });
    return null;
  }

  return {
    invitationId: invitation.id,
    athleteId,
    status: INVITATION_STATUS.opened,
    alreadyOpened,
  };
}

// ============================================================
// completeAthleteProfile — cierra D-006 v0 gate 1
// ============================================================

export interface CompleteProfileOptions {
  tx?: DatabaseClient;
}

/**
 * Cierra el flujo D-006 v0 gate 1: setea `profile_completed_at` en athlete
 * y marca la invitación como `completed`.
 *
 * Idempotente: si ya está completed, devuelve el estado existente.
 *
 * Devuelve error-equivalent via { ok: false } en casos de token inválido
 * o atleta que no pertenece al tenant/academia de la invitación.
 */
export async function completeAthleteProfile(
  invitationId: string,
  tenantId: string,
  input: CompleteAthleteProfileInput,
  options: CompleteProfileOptions = {}
): Promise<
  | { ok: true; data: CompleteProfileResult }
  | { ok: false; code: "INVITATION_NOT_FOUND" | "TENANT_MISMATCH" | "ATHLETE_NOT_FOUND" }
> {
  const exec = options.tx ?? db;

  const [invitation] = await exec
    .select({
      id: athleteInvitations.id,
      tenantId: athleteInvitations.tenantId,
      academyId: athleteInvitations.academyId,
      athleteId: athleteInvitations.athleteId,
      status: athleteInvitations.status,
    })
    .from(athleteInvitations)
    .where(eq(athleteInvitations.id, invitationId))
    .limit(1);

  if (!invitation) {
    return { ok: false, code: "INVITATION_NOT_FOUND" };
  }
  if (invitation.tenantId !== tenantId) {
    return { ok: false, code: "TENANT_MISMATCH" };
  }
  if (!invitation.athleteId) {
    return { ok: false, code: "ATHLETE_NOT_FOUND" };
  }

  const now = new Date();
  const dob = input.dob && input.dob.length > 0 ? input.dob : null;
  const level = input.level && input.level.length > 0 ? input.level : null;

  await exec
    .update(athletes)
    .set({
      name: input.name,
      ...(dob ? { dob } : {}),
      ...(level ? { level } : {}),
      profileCompletedAt: now,
    })
    .where(eq(athletes.id, invitation.athleteId));

  await exec
    .update(athleteInvitations)
    .set({
      status: INVITATION_STATUS.completed,
      profileCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(athleteInvitations.id, invitation.id));

  return {
    ok: true,
    data: {
      athleteId: invitation.athleteId,
      invitationId: invitation.id,
      status: INVITATION_STATUS.completed,
      profileCompletedAt: now,
    },
  };
}

// ============================================================
// listInvitations — para el owner
// ============================================================

export async function listInvitationsForAcademy(
  academyId: string,
  tenantId: string,
  tx: DatabaseClient = db
): Promise<
  Array<{
    id: string;
    email: string;
    status: InvitationStatus;
    template: string;
    magicLinkSentAt: Date | null;
    magicLinkOpenedAt: Date | null;
    profileCompletedAt: Date | null;
    attemptCount: number;
    lastError: string | null;
    athleteId: string | null;
    expiresAt: Date;
    createdAt: Date | null;
  }>
> {
  // `status` es text en DB; la capa de aplicación lo restringe a los 6
  // valores de INVITATION_STATUS. Cast explícito para que TypeScript lo
  // refleje sin perder la inferencia de las otras columnas.
  const rows = await tx
    .select({
      id: athleteInvitations.id,
      email: athleteInvitations.email,
      status: athleteInvitations.status,
      template: athleteInvitations.template,
      magicLinkSentAt: athleteInvitations.magicLinkSentAt,
      magicLinkOpenedAt: athleteInvitations.magicLinkOpenedAt,
      profileCompletedAt: athleteInvitations.profileCompletedAt,
      attemptCount: athleteInvitations.attemptCount,
      lastError: athleteInvitations.lastError,
      athleteId: athleteInvitations.athleteId,
      expiresAt: athleteInvitations.expiresAt,
      createdAt: athleteInvitations.createdAt,
    })
    .from(athleteInvitations)
    .where(
      and(
        eq(athleteInvitations.academyId, academyId),
        eq(athleteInvitations.tenantId, tenantId)
      )
    )
    .orderBy(asc(athleteInvitations.createdAt));
  return rows.map((r) => ({
    ...r,
    status: r.status as InvitationStatus,
  }));
}
