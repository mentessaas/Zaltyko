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
 *
 * Fase 4 (D9): si el cortacircuitos se abre (demasiados rechazos de Stripe de
 * toda la plataforma al crear cobros), no se crea ni se reclama nada más en la
 * pasada y el resultado lleva `circuitOpen: true`; mañana empieza cerrado.
 */
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isFamilyAutomaticSepaCollectionFlagEnabled,
  isFamilyCollectionEventsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { collectDueInvoices } from "@/modules/family-collection/application/family-collection-collect";
import { reconcilePendingAttempts } from "@/modules/family-collection/application/family-collection-reconcile";
import { applyRecordedAttemptRefunds } from "@/modules/family-collection/application/family-collection-refunds";
import {
  emptyRunResult,
  type FamilyCollectionRunResult,
  type RunState,
} from "@/modules/family-collection/application/family-collection-steps";
import { closedBreaker } from "@/modules/family-collection/domain/circuit-breaker";
import {
  createFamilyCollectionRefundStore,
  createFamilyCollectionStore,
  type FamilyCollectionRefundStore,
  type FamilyCollectionStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  createStripeCollectionGateway,
  createStripeRefundGateway,
  type FamilyCollectionGateway,
  type FamilyCollectionRefundGateway,
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
  /**
   * Fase 4 (Tarea 7): devoluciones de un cobro registrado tarde. Por defecto,
   * el almacén y el adaptador reales; pero si se pasa una pasarela simulada
   * (`gateway`) sin `refundGateway`, no se leen devoluciones (nunca se mezcla
   * un Stripe simulado con el real).
   */
  refundStore?: FamilyCollectionRefundStore;
  refundGateway?: FamilyCollectionRefundGateway;
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

/**
 * Estado de una pasada (proceso diario) o de un evento de Stripe (Fase 4).
 * `null` si los cerrojos de R11 están cerrados (clave que no es de test o base
 * de producción), si falta el almacenamiento de las Fases 1, 2 y 3 o, en modo
 * `"event"`, si la bandera de los eventos
 * (ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED) está apagada.
 *
 * En modo `"event"` solo se relee y se aplica lo que diga Stripe (nunca se
 * crea ni se confirma un cobro); `flagEnabled` y `sepaEnabled` se leen igual
 * que en la pasada diaria para que los pasos compartidos decidan lo mismo.
 *
 * `authenticationRecovery` (Fase 4: el banco pide que la familia confirme un
 * cobro de tarjeta y el intento espera en `requires_action`) exige la bandera
 * de eventos, la bandera del cobro y el almacenamiento con la forma "phase4";
 * la forma solo se consulta si las dos banderas están encendidas. Es igual en
 * los dos modos.
 */
export async function createRunState(
  options: FamilyCollectionRunOptions,
  deps: FamilyCollectionDeps,
  mode: "daily" | "event"
): Promise<RunState | null> {
  const now = options.now ?? new Date();
  const flagEnabled = isFamilyAutomaticCollectionFlagEnabled();
  const environment = resolveConnectEnvironment();
  // Cerrojos de R11: solo clave de test y nunca contra la base de producción.
  if (environment !== "test" || isProductionDatabase()) return null;
  if (mode === "event" && !isFamilyCollectionEventsFlagEnabled()) return null;

  const store = deps.store ?? createFamilyCollectionStore();
  if (!(await store.isStorageAvailable())) return null;

  const batchSize = options.batchSize ?? FAMILY_COLLECTION_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("El tamaño de página del cobro debe ser un entero positivo.");
  }

  const authenticationRecovery =
    flagEnabled && isFamilyCollectionEventsFlagEnabled() && (await store.isEventsStorageAvailable());

  return {
    now,
    deadline: Date.now() + (options.deadlineMs ?? FAMILY_COLLECTION_DEADLINE_MS),
    batchSize,
    environment,
    productionDatabase: false,
    flagEnabled,
    sepaEnabled: isFamilyAutomaticSepaCollectionFlagEnabled(),
    authenticationRecovery,
    store,
    gateway: deps.gateway ?? createStripeCollectionGateway(),
    scope: options.organizationIds ? [...options.organizationIds] : null,
    refreshAccount: deps.refreshAccount ?? ((accountRowId) => refreshConnectAccountForCollection(accountRowId)),
    refreshedOrganizations: new Set(),
    applyRecordedRefunds: recordedRefundsApplier(deps, now),
    // Fase 4 (D9): cada pasada (y cada evento) empieza con el cortacircuitos cerrado.
    breaker: closedBreaker(),
    result: emptyRunResult(flagEnabled),
  };
}

/** Las devoluciones de un cobro registrado tarde (applyRecordedAttemptRefunds), o null. */
function recordedRefundsApplier(deps: FamilyCollectionDeps, now: Date): RunState["applyRecordedRefunds"] {
  if (deps.gateway && !deps.refundGateway) return null;
  const refunds = {
    store: deps.refundStore ?? createFamilyCollectionRefundStore(),
    gateway: deps.refundGateway ?? createStripeRefundGateway(),
  };
  return (attempt, connectedAccount) => applyRecordedAttemptRefunds({ attempt, connectedAccount, now }, refunds);
}

export async function runFamilyCollection(
  options: FamilyCollectionRunOptions = {},
  deps: FamilyCollectionDeps = {}
): Promise<FamilyCollectionRunResult> {
  // Sin estado (cerrojos cerrados o sin tablas) no se hace nada.
  const state = await createRunState(options, deps, "daily");
  if (!state) return emptyRunResult(false);
  // Alcance vacío (solo tests de PostgreSQL): ninguna academia que recorrer.
  if (state.scope && state.scope.length === 0) return emptyRunResult(state.flagEnabled);

  // Fase A antes de cobrar nada nuevo.
  await reconcilePendingAttempts(state);
  if (state.flagEnabled && state.result.complete) await collectDueInvoices(state);
  return state.result;
}
