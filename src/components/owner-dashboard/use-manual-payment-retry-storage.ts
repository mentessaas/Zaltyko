"use client";

import { useEffect, useState } from "react";
import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import {
  fingerprintManualPaymentActor,
  LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY,
  migrateLegacyPendingManualPayment,
  persistManualPaymentBalanceMarker,
  readAllPendingManualPayments,
  readLegacyPendingManualPayment,
  readResolvedManualPaymentMarker,
  withManualPaymentRetryLock,
  type ManualPaymentRetrySnapshot,
} from "./manual-payment-retry-storage";
import {
  getBrowserStorage,
  toPendingPaymentRequest,
  type PendingPaymentRequest,
} from "./manual-payment-form-model";

/**
 * Durable retry state of manual payments for the authenticated actor: restores
 * pending submissions from localStorage, follows other tabs (storage/focus) and
 * links a legacy sessionStorage submission on request. It never sends a
 * payment; ManualPaymentForm does. Extracted from ManualPaymentForm.
 */
export function useManualPaymentRetryStorage({
  actorId,
  setError,
}: {
  actorId: string;
  setError: (message: string | null) => void;
}) {
  const [retryRequest, setRetryRequest] =
    useState<PendingPaymentRequest | null>(null);
  const [retryStorageReady, setRetryStorageReady] = useState(false);
  const [retryStorageError, setRetryStorageError] = useState<string | null>(null);
  const [actorScopeHash, setActorScopeHash] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [otherActorPending, setOtherActorPending] = useState(false);
  const [legacyRecoveryRequired, setLegacyRecoveryRequired] = useState(false);
  const [legacyRecoveryBusy, setLegacyRecoveryBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let currentScopeHash: string | null = null;
    setRetryStorageReady(false);
    setRetryRequest(null);
    setPendingCount(0);
    setOtherActorPending(false);
    setLegacyRecoveryRequired(false);
    setLegacyRecoveryBusy(false);
    setActorScopeHash(null);
    setRetryStorageError(null);

    const applyPending = (snapshots: ManualPaymentRetrySnapshot[]) => {
      const actorSnapshots = snapshots.filter(
        (snapshot) => snapshot.actorScopeHash === currentScopeHash
      );
      setPendingCount(actorSnapshots.length);
      setOtherActorPending(actorSnapshots.length !== snapshots.length);
      setRetryRequest(
        actorSnapshots[0] ? toPendingPaymentRequest(actorSnapshots[0]) : null
      );
    };

    const showStorageError = (message: string) => {
      if (!active) return;
      setRetryStorageError(message);
      setRetryStorageReady(true);
    };

    void fingerprintManualPaymentActor(actorId)
      .then(async (scopeHash) => {
        if (!active) return;
        currentScopeHash = scopeHash;
        const durableStorage = getBrowserStorage("localStorage");
        const legacyStorage = getBrowserStorage("sessionStorage");
        if (!durableStorage || !legacyStorage) {
          throw new Error("storage-unavailable");
        }
        const storedState = await withManualPaymentRetryLock(async () => {
          const legacyStatus = readLegacyPendingManualPayment(legacyStorage);
          if (legacyStatus === "invalid") throw new Error("storage-invalid");
          if (legacyStatus === "unavailable") {
            throw new Error("storage-unavailable");
          }
          return {
            legacyStatus,
            pending: readAllPendingManualPayments(durableStorage),
          };
        });
        if (!active) return;
        setActorScopeHash(scopeHash);
        setLegacyRecoveryRequired(storedState.legacyStatus === "pending");
        const pending = storedState.pending;
        if (pending.status === "pending") {
          applyPending(pending.snapshots);
        } else if (pending.status === "invalid") {
          showStorageError(
            "Hay un registro pendiente dañado. No se enviará otro pago para evitar duplicados."
          );
          return;
        } else if (pending.status === "unavailable") {
          throw new Error("storage-unavailable");
        } else {
          applyPending([]);
        }
        setRetryStorageReady(true);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error && error.message === "storage-invalid"
            ? "Hay un registro pendiente dañado. No se enviará otro pago para evitar duplicados."
            : "El almacenamiento seguro o la coordinación entre pestañas no está disponible. No se enviará el pago.";
        showStorageError(message);
      });

    const refreshFromDurableStorage = () => {
      if (!active) return;
      const durableStorage = getBrowserStorage("localStorage");
      if (!durableStorage) {
        setRetryStorageError(
          "El almacenamiento seguro ya no está disponible. No registres otro pago hasta recuperarlo."
        );
        return;
      }
      const legacyStorage = getBrowserStorage("sessionStorage");
      if (!legacyStorage) {
        setRetryStorageError(
          "No se pudo comprobar si queda un envío antiguo sin recuperar. No registres otro pago hasta recuperar el almacenamiento."
        );
        return;
      }
      if (!currentScopeHash) return;
      void withManualPaymentRetryLock(async () => ({
        pending: readAllPendingManualPayments(durableStorage),
        legacyStatus: readLegacyPendingManualPayment(legacyStorage),
      }))
        .then((storedState) => {
          if (!active) return;
          if (
            storedState.legacyStatus === "invalid" ||
            storedState.legacyStatus === "unavailable"
          ) {
            setRetryStorageError(
              "No se pudo verificar el envío antiguo pendiente. No registres otro pago hasta resolverlo."
            );
            return;
          }
          setLegacyRecoveryRequired(storedState.legacyStatus === "pending");
          const pending = storedState.pending;
          if (pending.status === "pending") {
            applyPending(pending.snapshots);
            setRetryStorageError(null);
          } else if (pending.status === "none") {
            applyPending([]);
            setRetryStorageError(null);
          } else {
            setRetryStorageError(
              "No se pudo verificar el envío guardado entre pestañas. No registres otro pago hasta recuperar el almacenamiento."
            );
          }
        })
        .catch(() => {
          if (!active) return;
          setRetryStorageError(
            "La coordinación entre pestañas ya no está disponible. No registres otro pago hasta recuperarla."
          );
        });
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key.startsWith("zaltyko:pending-manual-payment:v2:") ||
        event.key.startsWith("zaltyko:resolved-manual-payment:v2:") ||
        event.key === LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY
      ) {
        refreshFromDurableStorage();
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refreshFromDurableStorage);
    return () => {
      active = false;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshFromDurableStorage);
    };
  }, [actorId]);

  async function recoverLegacyPendingPayment() {
    if (
      !legacyRecoveryRequired ||
      legacyRecoveryBusy ||
      !retryStorageReady ||
      !actorScopeHash
    ) {
      return;
    }
    setLegacyRecoveryBusy(true);
    setError(null);
    try {
      await withManualPaymentRetryLock(async () => {
        const durableStorage = getBrowserStorage("localStorage");
        const legacyStorage = getBrowserStorage("sessionStorage");
        if (!durableStorage || !legacyStorage) {
          throw new Error("legacy-storage-unavailable");
        }
        const legacyStatus = readLegacyPendingManualPayment(legacyStorage);
        if (legacyStatus === "invalid" || legacyStatus === "unavailable") {
          throw new Error("legacy-storage-invalid");
        }
        const pending = readAllPendingManualPayments(durableStorage);
        if (pending.status === "invalid" || pending.status === "unavailable") {
          throw new Error("retry-storage-unavailable");
        }
        if (pending.status === "pending" && pending.snapshots.length > 0) {
          const actorSnapshots = pending.snapshots.filter(
            (snapshot) => snapshot.actorScopeHash === actorScopeHash
          );
          setPendingCount(actorSnapshots.length);
          setOtherActorPending(actorSnapshots.length !== pending.snapshots.length);
          setRetryRequest(
            actorSnapshots[0]
              ? toPendingPaymentRequest(actorSnapshots[0])
              : null
          );
          setError(
            "Resuelve primero el otro envío pendiente; el envío antiguo seguirá guardado para recuperarlo después."
          );
          return;
        }
        if (legacyStatus === "none") {
          setLegacyRecoveryRequired(false);
          setError("El envío antiguo ya no está pendiente. Se volvió a comprobar el almacenamiento.");
          return;
        }

        const migration = migrateLegacyPendingManualPayment(
          legacyStorage,
          durableStorage,
          actorScopeHash
        );
        if (migration !== "migrated") {
          throw new Error("legacy-recovery-failed");
        }
        const recovered = readAllPendingManualPayments(durableStorage);
        if (recovered.status !== "pending") {
          throw new Error("legacy-recovery-failed");
        }
        const actorSnapshots = recovered.snapshots.filter(
          (snapshot) => snapshot.actorScopeHash === actorScopeHash
        );
        if (actorSnapshots.length === 0) {
          throw new Error("legacy-recovery-failed");
        }
        setPendingCount(actorSnapshots.length);
        setOtherActorPending(actorSnapshots.length !== recovered.snapshots.length);
        setRetryRequest(toPendingPaymentRequest(actorSnapshots[0]!));
        setLegacyRecoveryRequired(false);
        setError(
          "El envío antiguo quedó vinculado a esta sesión y conserva su clave original. No se ha enviado; pulsa Reintentar el mismo registro para consultar su resultado."
        );
      });
    } catch (error: unknown) {
      setError(
        error instanceof Error && error.message === "legacy-storage-invalid"
          ? "No se pudo validar el envío antiguo. Se conserva sin modificar y no se ha enviado."
          : error instanceof Error && error.message === "legacy-recovery-failed"
            ? "No se pudo recuperar el envío antiguo. Se conserva para revisión y no se ha enviado."
            : "No se pudo coordinar la recuperación. El envío antiguo se conserva y no se ha enviado."
      );
    } finally {
      setLegacyRecoveryBusy(false);
    }
  }

  return {
    retryRequest,
    setRetryRequest,
    retryStorageReady,
    retryStorageError,
    setRetryStorageError,
    actorScopeHash,
    pendingCount,
    setPendingCount,
    otherActorPending,
    setOtherActorPending,
    legacyRecoveryRequired,
    legacyRecoveryBusy,
    recoverLegacyPendingPayment,
  };
}

/**
 * Refreshes the per-charge balance marker other tabs compare against before
 * registering a new payment. Extracted from ManualPaymentForm.
 */
export function useManualPaymentBalanceMarkerSync({
  actorScopeHash,
  loadedCharges,
  organizationId,
}: {
  actorScopeHash: string | null;
  loadedCharges: OpenManualPaymentCharge[];
  organizationId: string;
}) {
  useEffect(() => {
    if (!actorScopeHash) return;
    const storage = getBrowserStorage("localStorage");
    if (!storage) return;
    void withManualPaymentRetryLock(async () => {
      const pending = readAllPendingManualPayments(storage);
      if (pending.status === "invalid" || pending.status === "unavailable") {
        return;
      }
      const snapshots = pending.status === "pending" ? pending.snapshots : [];
      for (const charge of loadedCharges) {
        if (
          snapshots.some(
            (snapshot) =>
              snapshot.organizationId === organizationId &&
              snapshot.chargeId === charge.chargeId
          )
        ) {
          continue;
        }
        const marker = readResolvedManualPaymentMarker(
          storage,
          organizationId,
          charge.chargeId
        );
        if (
          marker.status === "marker" &&
          marker.marker.remainingCents !== charge.outstandingCents
        ) {
          persistManualPaymentBalanceMarker(
            storage,
            organizationId,
            charge.chargeId,
            charge.outstandingCents
          );
        }
      }
    }).catch(() => undefined);
  }, [actorScopeHash, loadedCharges, organizationId]);
}
