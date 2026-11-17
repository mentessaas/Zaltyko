/**
 * Cobro automático de cuotas (Fase 3): proceso diario de cobro.
 *
 * `runFamilyCollection` lo lanza la ruta cron (Tarea 6). Dos fases:
 * - Fase A (family-collection-reconcile.ts): poner al día lo que quedó a
 *   medias (reanudar intentos reclamados o creados, releer los que están en
 *   curso). Corre aunque la bandera esté apagada, para que un cobro que ya
 *   salió en Stripe siempre quede registrado; con la bandera apagada la
 *   puerta nunca deja crear ni confirmar, así que solo lee, cancela o cierra.
 * - Fase B (family-collection-collect.ts): cobrar lo que vence hoy. Solo con
 *   la bandera encendida. Por domiciliación, solo además con
 *   ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED encendida («Primero solo
 *   tarjeta»); la Fase A sigue leyendo y registrando las domiciliaciones que
 *   ya están en el banco, con o sin esa bandera.
 *
 * Nada corre si los cerrojos de R11 están cerrados (clave que no es de test o
 * base de producción) o si faltan las tablas de las Fases 1, 2 y 3.
 * Recorre por orden de id, de `batchSize` en `batchSize`; con el plazo
 * agotado (240 s por defecto) marca `complete: false` y lo que falte sigue
 * en la siguiente ejecución.
 */
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isFamilyAutomaticSepaCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { collectDueInvoices } from "@/modules/family-collection/application/family-collection-collect";
import { reconcilePendingAttempts } from "@/modules/family-collection/application/family-collection-reconcile";
import {
  emptyRunResult,
  type FamilyCollectionRunResult,
  type RunState,
} from "@/modules/family-collection/application/family-collection-steps";
import {
  createFamilyCollectionStore,
  type FamilyCollectionStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  createStripeCollectionGateway,
  type FamilyCollectionGateway,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { refreshConnectAccountForCollection } from "@/modules/payments-connect/application/connect-onboarding-service";

export type { FamilyCollectionRunResult } from "@/modules/family-collection/application/family-collection-steps";

/** Margen bajo el límite de 300 s de las rutas cron. */
export const FAMILY_COLLECTION_DEADLINE_MS = 240_000;
export const FAMILY_COLLECTION_BATCH_SIZE = 100;

export interface FamilyCollectionDeps {
  store?: FamilyCollectionStore;
  gateway?: FamilyCollectionGateway;
  /** Relee la cuenta conectada en Stripe (refreshConnectAccountForCollection). */
  refreshAccount?: (accountRowId: string) => Promise<unknown>;
}

export interface FamilyCollectionRunOptions {
  now?: Date;
  deadlineMs?: number;
  batchSize?: number;
  /**
   * SOLO TESTS de PostgreSQL: limita el recorrido a estas academias para no
   * tocar datos de otras suites. La ruta cron y cualquier código de
   * producción llaman sin él (todas las academias).
   */
  organizationIds?: readonly string[];
}

export async function runFamilyCollection(
  options: FamilyCollectionRunOptions = {},
  deps: FamilyCollectionDeps = {}
): Promise<FamilyCollectionRunResult> {
  const now = options.now ?? new Date();
  const flagEnabled = isFamilyAutomaticCollectionFlagEnabled();
  const environment = resolveConnectEnvironment();
  // Cerrojos de R11: solo clave de test y nunca contra la base de producción.
  if (environment !== "test" || isProductionDatabase()) return emptyRunResult(false);

  const store = deps.store ?? createFamilyCollectionStore();
  if (!(await store.isStorageAvailable())) return emptyRunResult(false);

  const batchSize = options.batchSize ?? FAMILY_COLLECTION_BATCH_SIZE;
  if (options.organizationIds && options.organizationIds.length === 0) return emptyRunResult(flagEnabled);
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("El tamaño de página del cobro debe ser un entero positivo.");
  }

  const state: RunState = {
    now,
    deadline: Date.now() + (options.deadlineMs ?? FAMILY_COLLECTION_DEADLINE_MS),
    batchSize,
    environment,
    productionDatabase: false,
    flagEnabled,
    sepaEnabled: isFamilyAutomaticSepaCollectionFlagEnabled(),
    store,
    gateway: deps.gateway ?? createStripeCollectionGateway(),
    scope: options.organizationIds ? [...options.organizationIds] : null,
    refreshAccount: deps.refreshAccount ?? ((accountRowId) => refreshConnectAccountForCollection(accountRowId)),
    refreshedOrganizations: new Set(),
    result: emptyRunResult(flagEnabled),
  };

  // Fase A antes de cobrar nada nuevo.
  await reconcilePendingAttempts(state);
  if (flagEnabled && state.result.complete) await collectDueInvoices(state);
  return state.result;
}
