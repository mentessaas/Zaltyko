/**
 * Cobro automático de cuotas (Fase 4, Tarea 9): lecturas del justificante de
 * pago para el portal de la familia (D6).
 *
 * Solo servidor. Cada lectura repite en SQL que la cuenta de la sesión es la
 * persona que paga esa factura y que sigue viendo las cuotas de la familia
 * (familyCanViewFees): un justificante de otra familia, academia o pagador
 * simplemente no existe para ella (nunca se distingue «no existe» de «no es
 * tuyo»). Sin la bandera ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED, fuera de
 * la clave de test de Stripe, contra la base de producción o sin las tablas
 * del cobro, nada (sin leer la base cuando lo dice el entorno).
 */
import { z } from "zod";

import { db } from "@/db";
import {
  isFamilyCollectionReceiptsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import type { FamilyReceiptView } from "@/modules/family-collection/domain/family-receipt";
import { createFamilyReceiptStore } from "@/modules/family-collection/infrastructure/family-receipt-store";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";

export type { FamilyReceiptView };

const uuidSchema = z.guid();
/** Como mucho, las cuotas del portal por página (las mismas que el estado del cobro). */
const RECEIPT_LINKS_INVOICE_LIMIT = 100;

function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

/** ¿Se pueden enseñar justificantes? Entorno primero, sin base. */
function receiptsOpenByEnvironment(): boolean {
  return isFamilyCollectionReceiptsFlagEnabled() && resolveConnectEnvironment() === "test" && !isProductionDatabase();
}

async function receiptsAvailable(): Promise<boolean> {
  if (!receiptsOpenByEnvironment()) return false;
  return isFamilyCollectionStorageAvailable(db);
}

/**
 * El justificante del intento `attemptId` de la academia `organizationId`,
 * solo para la persona que paga esa factura; si no, null.
 */
export async function getFamilyReceipt(input: {
  userId: string;
  organizationId: string;
  attemptId: string;
  now?: Date;
}): Promise<FamilyReceiptView | null> {
  if (!receiptsOpenByEnvironment()) return null;
  if (!isUuid(input.userId) || !isUuid(input.organizationId) || !isUuid(input.attemptId)) return null;
  if (!(await receiptsAvailable())) return null;
  return createFamilyReceiptStore().readReceipt({
    organizationId: input.organizationId,
    attemptId: input.attemptId,
    viewerUserId: input.userId,
    now: input.now ?? new Date(),
  });
}

/**
 * Para la página /familia/cuotas/justificante/[attemptId]: busca el
 * justificante en las academias cuyas cuotas ve la cuenta. Null si no hay
 * ninguno suyo (la página responde 404).
 */
export async function findFamilyReceipt(input: {
  userId: string;
  attemptId: string;
  now?: Date;
}): Promise<FamilyReceiptView | null> {
  if (!receiptsOpenByEnvironment()) return null;
  if (!isUuid(input.userId) || !isUuid(input.attemptId)) return null;
  if (!(await receiptsAvailable())) return null;
  const now = input.now ?? new Date();
  const access = await resolveFamilyPortalAccess({ userId: input.userId, now });
  for (const academy of access.academies) {
    if (academy.feeFamilyIds.length === 0) continue;
    const receipt = await getFamilyReceipt({
      userId: input.userId,
      organizationId: academy.organizationId,
      attemptId: input.attemptId,
      now,
    });
    if (receipt) return receipt;
  }
  return null;
}

/**
 * Para /familia/cuotas: por factura, el intento cuyo justificante puede abrir
 * la cuenta (enlace «Ver justificante»). Sin la bandera, vacío sin leer la base.
 */
export async function getFamilyReceiptLinks(input: {
  userId: string;
  invoiceIds: readonly string[];
  now?: Date;
}): Promise<Record<string, string>> {
  if (!receiptsOpenByEnvironment()) return {};
  if (!isUuid(input.userId)) return {};
  const invoiceIds = [...new Set(input.invoiceIds)].filter(isUuid).slice(0, RECEIPT_LINKS_INVOICE_LIMIT);
  if (invoiceIds.length === 0) return {};
  if (!(await receiptsAvailable())) return {};
  const now = input.now ?? new Date();
  const access = await resolveFamilyPortalAccess({ userId: input.userId, now });
  const store = createFamilyReceiptStore();
  const links: Record<string, string> = {};
  for (const academy of access.academies) {
    if (academy.feeFamilyIds.length === 0) continue;
    Object.assign(
      links,
      await store.listReceiptLinks({
        organizationId: academy.organizationId,
        familyIds: academy.feeFamilyIds,
        invoiceIds,
        viewerUserId: input.userId,
        now,
      })
    );
  }
  return links;
}
