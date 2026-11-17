/**
 * Cobro automático de cuotas (Fase 3): envío del aviso a la familia cuando
 * falla el primer cobro de una cuota (D3, decisión de Elvis del 17-11-2026).
 *
 * El aviso ya está en el outbox (lo escribe applyOutcome en la misma
 * transacción que el fallo del intento 1, una sola vez por intento). Aquí, al
 * terminar el proceso diario y fuera de cualquier transacción con Stripe:
 * 1. se leen los avisos de los últimos días sin resultado;
 * 2. se comprueba que siguen valiendo (academia activa, cuota abierta y
 *    ningún intento posterior);
 * 3. se decide si se puede prometer el reintento: solo con el cobro
 *    automático encendido (sin la bandera los reintentos no salen) y con su
 *    fecha todavía por llegar; si la fecha ya llegó pero el reintento aún
 *    puede salir, sin fecha («pronto»); si ya no puede salir, sin promesa;
 * 4. se envía el correo a la persona que paga, por el mismo emisor y con el
 *    mismo destinatario que los recordatorios de pago, con una clave de
 *    envío por intento (un segundo envío del mismo aviso nunca sale);
 * 5. se deja el resultado en el outbox (una vez por intento): la academia ve
 *    en su lista si la familia está avisada.
 *
 * Si el emisor lanza un error, el aviso queda como no entregado
 * (`not_delivered`) y la academia ve «Avísala tú»: no se reintenta, porque el
 * registro de envíos ya guardó esa clave y un segundo intento nunca saldría.
 * Solo si ni siquiera se puede guardar el resultado, el aviso sigue pendiente
 * y la siguiente ejecución lo vuelve a mirar (el emisor no lo reenvía).
 * Mismos cerrojos que el cobro: solo con la clave de test de Stripe y nunca
 * contra la base de producción.
 */
import { getAppUrl } from "@/lib/env";
import { sendEmailWithLogging, type SendEmailOptions } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { localCalendarDate } from "@/modules/family-collection/domain/collection-plan";
import {
  FAMILY_FAILURE_NOTICE_TEMPLATE,
  FAMILY_FEES_PATH,
  familyFailureNoticeKey,
  familyFailureNoticeKind,
  notifiesFamilyOnFailure,
  renderFamilyFailureNotice,
} from "@/modules/family-collection/domain/family-failure-notice";
import {
  createFamilyFailureNoticeStore,
  type FamilyFailureNoticeOutcome,
  type FamilyFailureNoticeStore,
  type PendingFamilyFailureNotice,
} from "@/modules/family-collection/infrastructure/family-failure-notice-store";
import { withinGrace } from "@/modules/payment-reminders/domain/reminder-policy";

/**
 * Un aviso de más de 3 días ya no se envía (el reintento de la tarjeta sale al
 * día siguiente). Acota también la lectura (family-failure-notice-store.ts).
 */
export const FAMILY_FAILURE_NOTICE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** Avisos por ejecución como mucho; el resto, en la siguiente. */
export const FAMILY_FAILURE_NOTICE_BATCH = 50;
/** Tiempo como mucho para los avisos, después del cobro (la ruta tiene 300 s). */
export const FAMILY_FAILURE_NOTICE_DEADLINE_MS = 30_000;

export interface FamilyFailureNoticeDelivery {
  /** Correos aceptados por el proveedor. */
  sent: number;
  /** Avisos cerrados sin correo (sin correo guardado, cuota pagada, aviso caducado…). */
  notSent: number;
  /** Avisos cuyo resultado no se pudo guardar: la siguiente ejecución los vuelve a mirar. */
  pending: number;
}

export interface FamilyFailureNoticeDeps {
  store?: Pick<FamilyFailureNoticeStore, "listPending" | "recordResult">;
  sendEmail?: (options: SendEmailOptions) => Promise<boolean>;
  /** Comprueba que existen las tablas del cobro. */
  isStorageAvailable?: () => Promise<boolean>;
}

export interface FamilyFailureNoticeOptions {
  now?: Date;
  deadlineMs?: number;
  limit?: number;
  /** Dirección pública de la app (por defecto, la del entorno). */
  appUrl?: string;
  /** SOLO TESTS de PostgreSQL: academias a las que se limita. */
  organizationIds?: readonly string[];
}

const OPEN_INVOICE_STATUSES: ReadonlySet<string> = new Set(["issued", "partially_paid"]);
const ACTIVE_ORGANIZATION_STATUSES: ReadonlySet<string> = new Set(["trial", "active"]);

function emptyDelivery(): FamilyFailureNoticeDelivery {
  return { sent: 0, notSent: 0, pending: 0 };
}

/** Día local del reintento, o null si no hay o no se puede leer. */
function retryDateOf(notice: PendingFamilyFailureNotice): string | null {
  if (!notice.nextRetryAt) return null;
  try {
    return localCalendarDate(notice.nextRetryAt, notice.timezone);
  } catch {
    return null;
  }
}

function todayOf(now: Date, timezone: string): string | null {
  try {
    return localCalendarDate(now, timezone);
  } catch {
    return null;
  }
}

/**
 * Lo que se hace con un aviso pendiente: enviarlo o cerrarlo sin correo. Pura.
 * Nunca se envía un aviso que ya no es verdad ni se promete un reintento que
 * no va a salir:
 * - `retryScheduled`: el texto puede prometer un reintento. Solo si el
 *   intento lo tiene programado y `retriesEnabled` (el cobro automático está
 *   encendido: sin la bandera la Fase B no corre y el reintento no sale);
 * - `retryDateLocal`: el día prometido, solo si todavía no ha llegado. Si ya
 *   llegó (el proceso diario se retrasó o no terminó) pero la ventana de
 *   cobro del reintento sigue abierta, se promete sin fecha; si la ventana ya
 *   pasó, el reintento no saldrá y no se promete nada.
 */
export function decideFamilyFailureNotice(
  notice: PendingFamilyFailureNotice,
  now: Date,
  options: { retriesEnabled: boolean }
):
  | { action: "send"; retryScheduled: boolean; retryDateLocal: string | null }
  | { action: "close"; outcome: FamilyFailureNoticeOutcome } {
  if (!ACTIVE_ORGANIZATION_STATUSES.has(notice.organizationStatus)) {
    return { action: "close", outcome: "organization_inactive" };
  }
  if (!OPEN_INVOICE_STATUSES.has(notice.invoiceStatus)) return { action: "close", outcome: "invoice_closed" };
  if (
    notice.attemptStatus !== "failed" ||
    notice.lastAttemptNumber > notice.attemptNumber ||
    !notifiesFamilyOnFailure({ attemptNumber: notice.attemptNumber, failureCode: notice.failureCode ?? "" })
  ) {
    return { action: "close", outcome: "superseded" };
  }
  if (!notice.payerEmail) return { action: "close", outcome: "no_email" };

  const retryDate = options.retriesEnabled ? retryDateOf(notice) : null;
  if (retryDate === null) return { action: "send", retryScheduled: false, retryDateLocal: null };
  const today = todayOf(now, notice.timezone);
  if (today === null) return { action: "send", retryScheduled: false, retryDateLocal: null };
  if (retryDate > today) return { action: "send", retryScheduled: true, retryDateLocal: retryDate };
  // Hoy o ya pasado: nunca una fecha que no es futura.
  return withinGrace(retryDate, today)
    ? { action: "send", retryScheduled: true, retryDateLocal: null }
    : { action: "send", retryScheduled: false, retryDateLocal: null };
}

/**
 * Envía los avisos pendientes de primer fallo y deja su resultado. Nunca
 * lanza por un aviso concreto: un error se registra en el log (solo ids y el
 * nombre del error) y el aviso queda como no entregado.
 */
export async function deliverFamilyFailureNotices(
  options: FamilyFailureNoticeOptions = {},
  deps: FamilyFailureNoticeDeps = {}
): Promise<FamilyFailureNoticeDelivery> {
  const result = emptyDelivery();
  // Cerrojos de R11, como el cobro: solo clave de test y nunca la base de producción.
  if (resolveConnectEnvironment() !== "test" || isProductionDatabase()) return result;
  const storageAvailable = deps.isStorageAvailable ?? (() => isFamilyCollectionStorageAvailable());
  if (!(await storageAvailable())) return result;
  if (options.organizationIds && options.organizationIds.length === 0) return result;

  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.deadlineMs ?? FAMILY_FAILURE_NOTICE_DEADLINE_MS);
  const store = deps.store ?? createFamilyFailureNoticeStore();
  const sendEmail = deps.sendEmail ?? sendEmailWithLogging;
  const feesUrl = `${(options.appUrl ?? getAppUrl()).replace(/\/+$/, "")}${FAMILY_FEES_PATH}`;
  // Los reintentos solo salen con el cobro automático encendido (Fase B).
  const retriesEnabled = isFamilyAutomaticCollectionFlagEnabled();

  const pending = await store.listPending({
    since: new Date(now.getTime() - FAMILY_FAILURE_NOTICE_MAX_AGE_MS),
    limit: options.limit ?? FAMILY_FAILURE_NOTICE_BATCH,
    scope: options.organizationIds ? [...options.organizationIds] : null,
  });

  for (const notice of pending) {
    if (Date.now() >= deadline) break;
    const ids = { organizationId: notice.organizationId, invoiceId: notice.invoiceId, attemptId: notice.attemptId };
    const record = (outcome: FamilyFailureNoticeOutcome) =>
      store.recordResult({
        organizationId: notice.organizationId,
        locationId: notice.locationId,
        attemptId: notice.attemptId,
        invoiceId: notice.invoiceId,
        outcome,
        now,
      });
    let outcome: FamilyFailureNoticeOutcome;
    try {
      const decision = decideFamilyFailureNotice(notice, now, { retriesEnabled });
      if (decision.action === "close") {
        outcome = decision.outcome;
      } else {
        const message = renderFamilyFailureNotice({
          kind: familyFailureNoticeKind({
            paymentMethodKind: notice.paymentMethodKind,
            failureCode: notice.failureCode,
            declineCode: notice.declineCode,
            retryScheduled: decision.retryScheduled,
          }),
          academyName: notice.academyName,
          servicePeriodStart: notice.servicePeriodStart,
          retryDateLocal: decision.retryDateLocal,
          feesUrl,
        });
        const accepted = await sendEmail({
          purpose: "transactional",
          to: notice.payerEmail ?? "",
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(notice.replyToEmail ? { replyTo: notice.replyToEmail } : {}),
          template: FAMILY_FAILURE_NOTICE_TEMPLATE,
          // Como los recordatorios: la organización canónica va como tenant.
          tenantId: notice.organizationId,
          // Solo ids: nunca el correo ni el nombre.
          metadata: { kind: FAMILY_FAILURE_NOTICE_TEMPLATE, attemptId: notice.attemptId, invoiceId: notice.invoiceId },
          // Un solo correo por intento, aunque el resultado no llegara a guardarse.
          dedupeKey: familyFailureNoticeKey(notice.attemptId),
        });
        outcome = accepted ? "sent" : "not_delivered";
      }
    } catch (error) {
      // Si falló el envío, el registro de envíos ya guardó su clave y otro
      // intento no saldría: queda como no entregado y la academia ve «Avísala tú».
      outcome = "not_delivered";
      // Solo ids y el nombre del error: nunca el correo ni mensajes del proveedor.
      logger.error("Cobro automático: no se pudo enviar el aviso de cobro fallido a la familia", undefined, {
        ...ids,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
    try {
      await record(outcome);
    } catch (error) {
      // Sin resultado guardado, la siguiente ejecución lo vuelve a mirar.
      result.pending += 1;
      logger.error("Cobro automático: no se pudo guardar el resultado del aviso a la familia", undefined, {
        ...ids,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      continue;
    }
    if (outcome === "sent") result.sent += 1;
    else result.notSent += 1;
  }
  return result;
}
