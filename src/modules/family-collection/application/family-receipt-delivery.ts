/**
 * Cobro automático de cuotas (Fase 4, Tarea 9): envío del justificante de
 * pago a la familia (D6, «Sí, apagado hasta abogado»).
 *
 * El justificante ya está en el outbox (lo escribe applyOutcome en la misma
 * transacción que registra el cobro, una sola vez por intento, solo con la
 * bandera encendida). La ruta cron lo llama al final, después de los avisos,
 * con el tiempo que quede y fuera de cualquier transacción: un cobro por
 * domiciliación que Stripe confirma por evento recibe su justificante en la
 * siguiente pasada diaria. En cada llamada:
 * 1. se leen los justificantes de los últimos días sin resultado, de página
 *    en página hasta acabarlos o agotar el plazo;
 * 2. se lee del libro lo que lleva el justificante (readReceipt);
 * 3. se envía a la persona que paga, por el mismo emisor, destinatario y
 *    correo de respuesta que los avisos de cobro fallido, con una clave de
 *    envío por intento (un segundo envío del mismo justificante nunca sale);
 * 4. se deja el resultado en el outbox (una vez por intento).
 *
 * Sin la bandera ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED devuelve ceros
 * sin leer la base. Mismos cerrojos que el cobro: solo con la clave de test
 * de Stripe y nunca contra la base de producción. Nunca bloquea el cobro: un
 * error de un justificante queda como no entregado y en el registro solo van
 * ids y el nombre del error.
 */
import { getAppUrl } from "@/lib/env";
import { sendEmailWithLogging, type SendEmailOptions } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import {
  isFamilyCollectionReceiptsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import {
  familyCollectionStorageShape,
  type FamilyCollectionStorageShape,
} from "@/modules/family-collection/application/storage";
import {
  FAMILY_RECEIPT_TEMPLATE,
  familyReceiptKey,
  familyReceiptPath,
  renderFamilyReceipt,
} from "@/modules/family-collection/domain/family-receipt";
import {
  createFamilyReceiptStore,
  type FamilyReceiptOutcome,
  type FamilyReceiptStore,
  type PendingFamilyReceipt,
} from "@/modules/family-collection/infrastructure/family-receipt-store";
import { isOperatingOrganizationStatus } from "@/modules/organizations/domain/organization-status";

/** Un justificante de más de 7 días ya no se envía (sigue en la página del portal). */
export const FAMILY_RECEIPT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Justificantes por página. */
export const FAMILY_RECEIPT_BATCH = 50;
/** Tiempo como mucho para los justificantes por defecto. */
export const FAMILY_RECEIPT_DEADLINE_MS = 20_000;

export interface FamilyReceiptDelivery {
  /** Correos aceptados por el proveedor. */
  sent: number;
  /** Justificantes cerrados sin correo (sin correo guardado, envío no aceptado…). */
  notSent: number;
  /** Justificantes cuyo resultado no se pudo guardar: la siguiente ejecución los vuelve a mirar. */
  pending: number;
}

export interface FamilyReceiptDeps {
  store?: Pick<FamilyReceiptStore, "listPending" | "readReceipt" | "recordResult">;
  sendEmail?: (options: SendEmailOptions) => Promise<boolean>;
  /** Forma del almacenamiento del cobro (por defecto, la del catálogo). */
  storageShape?: () => Promise<FamilyCollectionStorageShape>;
}

export interface FamilyReceiptOptions {
  now?: Date;
  deadlineMs?: number;
  limit?: number;
  /** Dirección pública de la app (por defecto, la del entorno). */
  appUrl?: string;
  /** SOLO TESTS de PostgreSQL: academias a las que se limita. */
  organizationIds?: readonly string[];
}

function emptyDelivery(): FamilyReceiptDelivery {
  return { sent: 0, notSent: 0, pending: 0 };
}

/**
 * Envía los justificantes pendientes y deja su resultado. Nunca lanza por un
 * justificante concreto.
 */
export async function deliverFamilyReceipts(
  options: FamilyReceiptOptions = {},
  deps: FamilyReceiptDeps = {}
): Promise<FamilyReceiptDelivery> {
  const result = emptyDelivery();
  // Bandera primero: apagada, nada (ni siquiera se lee la base).
  if (!isFamilyCollectionReceiptsFlagEnabled()) return result;
  if (resolveConnectEnvironment() !== "test" || isProductionDatabase()) return result;
  const shape = deps.storageShape ? await deps.storageShape() : await familyCollectionStorageShape();
  if (shape === "none") return result;
  if (options.organizationIds && options.organizationIds.length === 0) return result;

  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.deadlineMs ?? FAMILY_RECEIPT_DEADLINE_MS);
  const store = deps.store ?? createFamilyReceiptStore();
  const sendEmail = deps.sendEmail ?? sendEmailWithLogging;
  const appUrl = (options.appUrl ?? getAppUrl()).replace(/\/+$/, "");
  const limit = options.limit ?? FAMILY_RECEIPT_BATCH;
  const since = new Date(now.getTime() - FAMILY_RECEIPT_MAX_AGE_MS);
  const scope = options.organizationIds ? [...options.organizationIds] : null;
  let after: { occurredAt: string; attemptId: string } | null = null;

  for (;;) {
    if (Date.now() >= deadline) break;
    const page = await store.listPending({ since, limit, scope, after });
    let expired = false;
    for (const receipt of page) {
      if (Date.now() >= deadline) {
        expired = true;
        break;
      }
      result[await deliverOne(receipt, { store, sendEmail, appUrl, now })] += 1;
    }
    if (expired) break;
    const last = page.length > 0 ? page[page.length - 1] : undefined;
    if (page.length < limit || last === undefined || last.occurredAt === undefined) break;
    const next = { occurredAt: last.occurredAt, attemptId: last.attemptId };
    // La página siguiente tiene que avanzar; si no, se para (nunca en bucle).
    if (after !== null && after.occurredAt === next.occurredAt && after.attemptId === next.attemptId) break;
    after = next;
  }
  return result;
}

interface DeliveryContext {
  store: Pick<FamilyReceiptStore, "readReceipt" | "recordResult">;
  sendEmail: (options: SendEmailOptions) => Promise<boolean>;
  appUrl: string;
  now: Date;
}

async function deliverOne(
  receipt: PendingFamilyReceipt,
  context: DeliveryContext
): Promise<keyof FamilyReceiptDelivery> {
  const { store, sendEmail, appUrl, now } = context;
  const ids = { organizationId: receipt.organizationId, invoiceId: receipt.invoiceId, attemptId: receipt.attemptId };
  let outcome: FamilyReceiptOutcome;
  // Tarea M (punto 15): solo un fallo al leer el libro deja el justificante
  // pendiente; uno al preparar el correo (o al enviarlo) no se arregla
  // reintentando cada día: queda como no entregado.
  let stage: "read" | "prepare" | "send" = "read";
  try {
    if (!isOperatingOrganizationStatus(receipt.organizationStatus)) {
      outcome = "organization_inactive";
    } else if (!receipt.payerEmail) {
      // Sin correo: la página del portal sigue disponible.
      outcome = "no_email";
    } else {
      const view = await store.readReceipt({ organizationId: receipt.organizationId, attemptId: receipt.attemptId, now });
      if (!view) {
        outcome = "superseded";
      } else {
        stage = "prepare";
        const message = renderFamilyReceipt({ ...view, receiptUrl: `${appUrl}${familyReceiptPath(receipt.attemptId)}` });
        stage = "send";
        const accepted = await sendEmail({
          purpose: "transactional",
          to: receipt.payerEmail,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(receipt.replyToEmail ? { replyTo: receipt.replyToEmail } : {}),
          template: FAMILY_RECEIPT_TEMPLATE,
          tenantId: receipt.organizationId,
          // Solo ids: nunca el correo, el nombre ni importes.
          metadata: { kind: FAMILY_RECEIPT_TEMPLATE, attemptId: receipt.attemptId, invoiceId: receipt.invoiceId },
          // Un solo correo por intento, aunque el resultado no llegara a guardarse.
          dedupeKey: familyReceiptKey(receipt.attemptId),
        });
        outcome = accepted ? "sent" : "not_delivered";
      }
    }
  } catch (error) {
    logger.error("Cobro automático: no se pudo enviar el justificante de pago a la familia", undefined, {
      ...ids,
      errorName: error instanceof Error ? error.name : "unknown",
      stage,
    });
    // Al leer el libro: sin resultado, la siguiente ejecución lo vuelve a
    // mirar. Al preparar el correo: saldría igual cada día durante 7 días.
    // Al enviar: el registro de envíos ya guardó la clave y otro intento no
    // saldría. En los dos últimos casos queda como no entregado.
    if (stage === "read") return "pending";
    outcome = "not_delivered";
  }
  try {
    await store.recordResult({
      organizationId: receipt.organizationId,
      locationId: receipt.locationId,
      attemptId: receipt.attemptId,
      invoiceId: receipt.invoiceId,
      outcome,
      now,
    });
  } catch (error) {
    logger.error("Cobro automático: no se pudo guardar el resultado del justificante de pago", undefined, {
      ...ids,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return "pending";
  }
  return outcome === "sent" ? "sent" : "notSent";
}
