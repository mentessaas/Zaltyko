"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import {
  clearPendingManualPayment,
  createManualPaymentRetrySnapshot,
  fingerprintManualPaymentActor,
  LEGACY_PENDING_MANUAL_PAYMENT_STORAGE_KEY,
  migrateLegacyPendingManualPayment,
  persistManualPaymentBalanceMarker,
  persistPendingManualPayment,
  persistResolvedManualPaymentMarker,
  readAllPendingManualPayments,
  readLegacyPendingManualPayment,
  readResolvedManualPaymentMarker,
  restoreManualPaymentRetryBody,
  withManualPaymentRetryLock,
  type ManualPaymentRetryStorageLike,
  type ManualPaymentRetrySnapshot,
} from "./manual-payment-retry-storage";
import { formatPaymentDueDate } from "./owner-payment-date";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import { useOrganizationDraftField } from "./use-organization-draft-field";

import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import {
  calendarDateToReceivedAt,
  getCalendarDateInTimezone,
} from "@/modules/billing/domain/manual-payment-date";

type ManualPaymentMethod = "cash" | "bank_transfer" | "card_terminal" | "other";

type PaymentRequest = {
  organizationId: string;
  chargeId: string;
  amountCents: number;
  method: ManualPaymentMethod;
  reference?: string;
  receivedAt: string;
};

type PendingPaymentRequest = {
  key: string;
  body: PaymentRequest;
  snapshot: ManualPaymentRetrySnapshot;
  referenceRequired: boolean;
};

type ManualPaymentOptionsRequest = {
  id: number;
  generation: number;
  pageIdentity: object;
  scopeKey: string;
  cursor: string;
  controller: AbortController;
};

type LoadedManualPaymentPage = {
  identity: object;
  charges: OpenManualPaymentCharge[];
  cursor: string | null;
};

const manualPaymentOptionsResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    charges: z.array(
      z.object({
        chargeId: z.string().uuid(),
        familyId: z.string().uuid(),
        locationId: z.string().uuid(),
        locationName: z.string(),
        locationTimezone: z.string(),
        invoiceReference: z.string(),
        payerName: z.string().nullable(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        dueAt: z.string(),
        totalCents: z.number().int().nonnegative().safe(),
        allocatedCents: z.number().int().nonnegative().safe(),
        outstandingCents: z.number().int().positive().safe(),
      })
    ),
    nextCursor: z.string().min(1).max(4096).nullable(),
  }),
});

function isMatchingManualPaymentResponse(
  value: unknown,
  request: PaymentRequest
): boolean {
  if (!value || typeof value !== "object") return false;
  const response = value as { ok?: unknown; data?: unknown };
  if (!response.data || typeof response.data !== "object") return false;
  const data = response.data as {
    chargeId?: unknown;
    amountCents?: unknown;
    method?: unknown;
    receivedAt?: unknown;
  };

  return (
    response.ok === true &&
    data.chargeId === request.chargeId &&
    data.amountCents === request.amountCents &&
    data.method === request.method &&
    data.receivedAt === request.receivedAt
  );
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function parseAmountCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function getBrowserStorage(
  kind: "localStorage" | "sessionStorage"
): ManualPaymentRetryStorageLike | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function toPendingPaymentRequest(
  snapshot: ManualPaymentRetrySnapshot
): PendingPaymentRequest {
  return {
    key: snapshot.idempotencyKey,
    body: {
      organizationId: snapshot.organizationId,
      chargeId: snapshot.chargeId,
      amountCents: snapshot.amountCents,
      method: snapshot.method,
      receivedAt: snapshot.receivedAt,
    },
    snapshot,
    referenceRequired: snapshot.referenceSha256 !== null,
  };
}

export function ManualPaymentForm({
  actorId,
  organizationId,
  locationId = null,
  charges,
  nextCursor = null,
}: {
  actorId: string;
  organizationId: string;
  locationId?: string | null;
  charges: OpenManualPaymentCharge[];
  nextCursor?: string | null;
  canManageFamilyCollectionPreferences?: boolean;
}) {
  const fieldIdPrefix = useId();
  const chargeSelectId = `${fieldIdPrefix}-charge`;
  const chargeHelpId = `${fieldIdPrefix}-charge-help`;
  const amountInputId = `${fieldIdPrefix}-amount`;
  const amountHelpId = `${fieldIdPrefix}-amount-help`;
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesBlocked = planPolicy.status !== "ready" || planPolicy.readOnly;
  const router = useRouter();
  const paginationPageIdentity = useMemo(
    () => ({}),
    [organizationId, locationId, charges, nextCursor]
  );
  const [loadedPage, setLoadedPage] = useState<LoadedManualPaymentPage>(() => ({
    identity: paginationPageIdentity,
    charges,
    cursor: nextCursor,
  }));
  const pageMatchesCurrentProps =
    loadedPage.identity === paginationPageIdentity;
  const loadedCharges = pageMatchesCurrentProps ? loadedPage.charges : charges;
  const pageCursor = pageMatchesCurrentProps ? loadedPage.cursor : nextCursor;
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const paginationScopeKey = JSON.stringify([organizationId, locationId]);
  const paginationGeneration = useRef(0);
  const paginationRequestSequence = useRef(0);
  const activePaginationRequest = useRef<ManualPaymentOptionsRequest | null>(
    null
  );
  const paginationMounted = useRef(false);
  const firstCharge = loadedCharges[0];
  const [chargeId, setChargeId] = useOrganizationDraftField(
    organizationId,
    () => firstCharge?.chargeId ?? ""
  );
  const selectedCharge = useMemo(
    () => loadedCharges.find((charge) => charge.chargeId === chargeId) ?? null,
    [chargeId, loadedCharges]
  );
  const selectedTimezone = selectedCharge?.locationTimezone ?? null;
  const [amount, setAmount] = useOrganizationDraftField(
    organizationId,
    () => (firstCharge ? (firstCharge.outstandingCents / 100).toFixed(2) : "")
  );
  const [method, setMethod] = useOrganizationDraftField<ManualPaymentMethod>(
    organizationId,
    "bank_transfer"
  );
  const [reference, setReference] = useOrganizationDraftField(organizationId, "");
  const [today, setToday] = useState("");
  const [dateInterpretationError, setDateInterpretationError] =
    useOrganizationDraftField<"timezone" | "received-date" | null>(
      organizationId,
      null
    );
  const [receivedOn, setReceivedOn] = useOrganizationDraftField(
    organizationId,
    ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useOrganizationDraftField<string | null>(
    organizationId,
    null
  );
  const [saved, setSaved] = useOrganizationDraftField(organizationId, false);
  const [retryRequest, setRetryRequest] =
    useState<PendingPaymentRequest | null>(null);
  const [retryStorageReady, setRetryStorageReady] = useState(false);
  const [retryStorageError, setRetryStorageError] = useState<string | null>(null);
  const [actorScopeHash, setActorScopeHash] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [otherActorPending, setOtherActorPending] = useState(false);
  const [legacyRecoveryRequired, setLegacyRecoveryRequired] = useState(false);
  const [legacyRecoveryBusy, setLegacyRecoveryBusy] = useState(false);
  const paymentInFlight = useRef(false);

  useEffect(() => {
    paginationMounted.current = true;
    return () => {
      paginationMounted.current = false;
      paginationGeneration.current += 1;
      activePaginationRequest.current?.controller.abort();
      activePaginationRequest.current = null;
    };
  }, []);

  useEffect(() => {
    paginationGeneration.current += 1;
    activePaginationRequest.current?.controller.abort();
    activePaginationRequest.current = null;
    setLoadedPage({
      identity: paginationPageIdentity,
      charges,
      cursor: nextCursor,
    });
    setLoadingMore(false);
    setLoadMoreError(false);
  }, [
    organizationId,
    locationId,
    charges,
    nextCursor,
    paginationPageIdentity,
  ]);

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

  useEffect(() => {
    setToday("");
    setDateInterpretationError(null);
    if (!selectedTimezone) {
      return;
    }
    let locationToday: string;
    try {
      locationToday = getCalendarDateInTimezone(new Date(), selectedTimezone);
    } catch {
      setDateInterpretationError("timezone");
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setToday(locationToday);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, selectedTimezone]);

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

  function chooseCharge(nextChargeId: string) {
    const currentCharge = loadedCharges.find(
      (charge) => charge.chargeId === chargeId
    );
    const nextCharge = loadedCharges.find(
      (charge) => charge.chargeId === nextChargeId
    );
    if (
      currentCharge?.locationTimezone !== nextCharge?.locationTimezone
    ) {
      setReceivedOn("");
      setToday("");
    }
    setChargeId(nextChargeId);
    setAmount(nextCharge ? (nextCharge.outstandingCents / 100).toFixed(2) : "");
    setSaved(false);
    setError(null);
  }

  async function loadMoreCharges() {
    const activeRequest = activePaginationRequest.current;
    if (
      !pageMatchesCurrentProps ||
      !pageCursor ||
      (activeRequest?.generation === paginationGeneration.current &&
        activeRequest.scopeKey === paginationScopeKey) ||
      formLocked
    ) {
      return;
    }
    const request: ManualPaymentOptionsRequest = {
      id: ++paginationRequestSequence.current,
      generation: paginationGeneration.current,
      pageIdentity: paginationPageIdentity,
      scopeKey: paginationScopeKey,
      cursor: pageCursor,
      controller: new AbortController(),
    };
    activePaginationRequest.current = request;
    const isCurrentRequest = () => {
      const active = activePaginationRequest.current;
      return (
        paginationMounted.current &&
        paginationGeneration.current === request.generation &&
        active !== null &&
        active.id === request.id &&
        active.pageIdentity === request.pageIdentity &&
        active.scopeKey === request.scopeKey
      );
    };

    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const params = new URLSearchParams({
        organizationId,
        cursor: request.cursor,
      });
      if (locationId) params.set("locationId", locationId);
      const response = await fetch(
        `/api/v1/owner/billing/manual-payments?${params.toString()}`,
        {
          headers: { accept: "application/json" },
          signal: request.controller.signal,
        }
      );
      if (!isCurrentRequest()) return;
      const raw: unknown = await response.json().catch(() => null);
      if (!isCurrentRequest()) return;
      const parsed = manualPaymentOptionsResponseSchema.safeParse(raw);
      if (!response.ok || !parsed.success) throw new Error("page-unavailable");

      setLoadedPage((current) => {
        if (current.identity !== request.pageIdentity) return current;
        const known = new Set(current.charges.map((charge) => charge.chargeId));
        return {
          identity: current.identity,
          charges: [
            ...current.charges,
            ...parsed.data.data.charges.filter(
              (charge) => !known.has(charge.chargeId)
            ),
          ],
          cursor: parsed.data.data.nextCursor,
        };
      });
    } catch {
      if (isCurrentRequest()) setLoadMoreError(true);
    } finally {
      if (isCurrentRequest()) {
        activePaginationRequest.current = null;
        setLoadingMore(false);
      }
    }
  }

  function retryPendingPayment() {
    if (!retryRequest || retryRequest.body.organizationId !== organizationId) return;
    if (paymentInFlight.current || busy) return;
    void restoreManualPaymentRetryBody(retryRequest.snapshot, reference)
      .then((restored) => {
        if (restored.status === "reference-required") {
          setError("Vuelve a introducir la misma referencia para confirmar el reintento.");
          return;
        }
        if (restored.status === "reference-mismatch") {
          setError("La referencia no coincide con el envío pendiente. No se ha enviado el pago.");
          return;
        }
        void sendPayment(
          retryRequest.key,
          restored.body,
          true,
          retryRequest.snapshot
        );
      })
      .catch(() => {
        setError("No se pudo verificar la referencia de forma segura. No se ha enviado el pago.");
      });
  }

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

  async function sendPayment(
    key: string,
    body: PaymentRequest,
    isRetry = false,
    existingSnapshot?: ManualPaymentRetrySnapshot,
    expectedOutstandingCents?: number
  ) {
    if (paymentInFlight.current) return;
    paymentInFlight.current = true;
    let requestMayHaveReachedServer = false;
    try {
      setBusy(true);
      setError(null);
      setSaved(false);
      await withManualPaymentRetryLock(async () => {
        const scopeHash = actorScopeHash;
        const storage = getBrowserStorage("localStorage");
        if (!scopeHash || !storage) {
          throw new Error("retry-storage-unavailable");
        }
        const pending = readAllPendingManualPayments(storage);
        if (pending.status === "invalid" || pending.status === "unavailable") {
          throw new Error("retry-storage-unavailable");
        }
        const allPendingSnapshots =
          pending.status === "pending" ? pending.snapshots : [];
        const pendingSnapshots = allPendingSnapshots.filter(
          (entry) => entry.actorScopeHash === scopeHash
        );
        setOtherActorPending(
          allPendingSnapshots.length !== pendingSnapshots.length
        );
        let snapshot = existingSnapshot;

        if (isRetry) {
          const exactPending = pendingSnapshots.some(
            (entry) => JSON.stringify(entry) === JSON.stringify(existingSnapshot)
          );
          if (
            !snapshot ||
            snapshot.actorScopeHash !== scopeHash ||
            snapshot.organizationId !== body.organizationId ||
            snapshot.chargeId !== body.chargeId ||
            snapshot.idempotencyKey !== key ||
            !exactPending ||
            allPendingSnapshots.some(
              (entry) =>
                entry.actorScopeHash !== scopeHash &&
                entry.organizationId === body.organizationId &&
                entry.chargeId === body.chargeId
            )
          ) {
            setError(
              "El envío pendiente cambió en otra pestaña. Actualiza la página y revisa el estado antes de continuar."
            );
            return;
          }
        } else {
          if (allPendingSnapshots.length > 0) {
            if (pendingSnapshots[0]) {
              setRetryRequest(toPendingPaymentRequest(pendingSnapshots[0]!));
            }
            setPendingCount(pendingSnapshots.length);
            setOtherActorPending(
              allPendingSnapshots.length !== pendingSnapshots.length
            );
            setError(
              pendingSnapshots.length > 0
                ? "Hay otro envío pendiente en una pestaña. Reintenta ese mismo registro antes de crear uno nuevo."
                : "Hay un envío pendiente en otra sesión de Owner. Vuelve a la cuenta que lo inició para resolverlo antes de registrar otro pago."
            );
            return;
          }
          const marker = readResolvedManualPaymentMarker(
            storage,
            body.organizationId,
            body.chargeId
          );
          if (marker.status === "invalid" || marker.status === "unavailable") {
            throw new Error("retry-storage-unavailable");
          }
          if (
            marker.status === "marker" &&
            (marker.marker.remainingCents === null ||
              marker.marker.remainingCents !== expectedOutstandingCents)
          ) {
            setError(
              "El saldo de este cargo cambió en otra pestaña. Actualiza la página y vuelve a revisar el importe antes de registrar otro pago."
            );
            return;
          }
          try {
            snapshot =
              (await createManualPaymentRetrySnapshot({
                body,
                currency:
                  loadedCharges.find((charge) => charge.chargeId === body.chargeId)
                    ?.currency ?? "",
                expectedOutstandingCents: expectedOutstandingCents ?? 0,
                actorScopeHash: scopeHash,
                idempotencyKey: key,
              })) ?? undefined;
          } catch {
            throw new Error("retry-fingerprint-unavailable");
          }
          if (
            !snapshot ||
            snapshot.organizationId !== body.organizationId ||
            snapshot.chargeId !== body.chargeId ||
            snapshot.idempotencyKey !== key ||
            !persistPendingManualPayment(storage, snapshot)
          ) {
            throw new Error("retry-persist-failed");
          }
        }

        setRetryStorageError(null);
        setRetryRequest({
          key,
          body,
          snapshot,
          referenceRequired: snapshot.referenceSha256 !== null,
        });
        setPendingCount(Math.max(pendingSnapshots.length, 1));

        requestMayHaveReachedServer = true;
        const response = await fetch("/api/v1/owner/billing/manual-payments", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
          },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const problem = (await response.json().catch(() => null)) as {
            detail?: string;
            message?: string;
          } | null;
          setError(
            response.status >= 500
              ? "No sabemos si se guardó. Reintenta este mismo envío; la clave segura evita duplicarlo."
              : (problem?.detail ??
                  problem?.message ??
                  "No se ha podido registrar el pago.")
          );
          const retryMayStillNeedReceipt =
            response.status >= 500 ||
            [408, 425, 429].includes(response.status) ||
            (isRetry && [401, 403, 404, 409].includes(response.status));
          if (!retryMayStillNeedReceipt) {
            if (clearPendingManualPayment(storage, snapshot)) {
              const current = readAllPendingManualPayments(storage);
              if (current.status === "pending") {
                const currentActor = current.snapshots.filter(
                  (entry) => entry.actorScopeHash === scopeHash
                );
                setPendingCount(currentActor.length);
                setOtherActorPending(
                  currentActor.length !== current.snapshots.length
                );
                setRetryRequest(
                  currentActor[0]
                    ? toPendingPaymentRequest(currentActor[0])
                    : null
                );
              } else if (current.status === "none") {
                setPendingCount(0);
                setOtherActorPending(false);
                setRetryRequest(null);
              } else {
                setRetryStorageError(
                  "No se pudo volver a verificar el almacenamiento de reintentos."
                );
              }
            } else {
              setError(
                "El servidor rechazó el envío, pero no se pudo limpiar el reintento guardado. No registres otro pago hasta resolverlo."
              );
            }
          }
          return;
        }

        const result: unknown = await response.json();
        if (
          response.status !== 201 ||
          !isMatchingManualPaymentResponse(result, body)
        ) {
          setError(
            "No sabemos si se guardó. Reintenta este mismo envío; la clave segura evita duplicarlo."
          );
          return;
        }

        if (!persistResolvedManualPaymentMarker(storage, snapshot)) {
          setError(
            "El pago está confirmado, pero no se pudo guardar la sincronización entre pestañas. Reintenta el mismo registro antes de crear otro."
          );
          return;
        }
        if (!clearPendingManualPayment(storage, snapshot)) {
          setError(
            "El pago está confirmado, pero no se pudo limpiar su reintento seguro. Puedes reintentar el mismo envío; no creará un segundo pago."
          );
          return;
        }
        const current = readAllPendingManualPayments(storage);
        if (current.status === "pending") {
          const currentActor = current.snapshots.filter(
            (entry) => entry.actorScopeHash === scopeHash
          );
          setPendingCount(currentActor.length);
          setOtherActorPending(currentActor.length !== current.snapshots.length);
          setRetryRequest(
            currentActor[0] ? toPendingPaymentRequest(currentActor[0]) : null
          );
        } else if (current.status === "none") {
          setPendingCount(0);
          setOtherActorPending(false);
          setRetryRequest(null);
        } else {
          setRetryStorageError(
            "No se pudo volver a verificar el almacenamiento de reintentos."
          );
          setError(
            "El pago está confirmado, pero no se pudo verificar si quedan otros envíos pendientes. Actualiza la página antes de continuar."
          );
          return;
        }
        setSaved(true);
        setAmount("");
        setReference("");
        router.refresh();
      });
    } catch (error: unknown) {
      if (requestMayHaveReachedServer) {
        setError(
          "No sabemos si se guardó. Reintenta este mismo envío; la clave segura evita duplicarlo."
        );
      } else {
        setRetryStorageError(
          "El almacenamiento seguro o la coordinación entre pestañas no está disponible. No se enviará el pago."
        );
        setError(
          error instanceof Error && error.message === "retry-persist-failed"
            ? "No se pudo guardar el reintento seguro. No se ha enviado el pago; inténtalo cuando el almacenamiento esté disponible."
            : error instanceof Error &&
                error.message === "retry-fingerprint-unavailable"
              ? "No se pudo preparar la verificación segura. El pago no se ha enviado."
              : "No se pudo comprobar el envío entre pestañas. No se ha enviado otro pago."
        );
      }
    } finally {
      paymentInFlight.current = false;
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paymentInFlight.current) return;
    // Resolve an existing idempotent command before blocking new writes.
    if (retryRequest) {
      retryPendingPayment();
      return;
    }
    if (legacyRecoveryRequired) return;
    if (pendingCount > 0 || otherActorPending) return;
    if (!retryStorageReady || retryStorageError || dateInterpretationError) return;
    if (writesBlocked) return;
    if (!selectedCharge || !effectiveReceivedOn) return;
    const amountCents = parseAmountCents(amount);
    if (!amountCents || amountCents > selectedCharge.outstandingCents) {
      setError(
        "El importe debe ser mayor que cero y no superar el saldo pendiente."
      );
      return;
    }
    let receivedAt: string;
    try {
      receivedAt = calendarDateToReceivedAt(
        effectiveReceivedOn,
        selectedCharge.locationTimezone
      );
    } catch {
      setDateInterpretationError("received-date");
      return;
    }
    void sendPayment(
      `owner-manual-payment:${crypto.randomUUID()}`,
      {
        organizationId,
        chargeId: selectedCharge.chargeId,
        amountCents,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        receivedAt,
      },
      false,
      undefined,
      selectedCharge.outstandingCents
    );
  }

  const amountCents = parseAmountCents(amount);
  const effectiveReceivedOn = receivedOn || today;
  const formLocked =
    busy ||
    retryRequest !== null ||
    pendingCount > 0 ||
    otherActorPending ||
    legacyRecoveryRequired ||
    !retryStorageReady ||
    retryStorageError !== null;
  const retryBelongsToCurrentOrganization =
    retryRequest?.body.organizationId === organizationId;
  const retryScopeNotice =
    retryRequest && !retryBelongsToCurrentOrganization ? (
      <div
        role="alert"
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
      >
        <p>
          Hay un envío de pago pendiente de confirmar en otra academia. Para
          evitar duplicados o confusiones, resuélvelo primero en su academia de
          origen.
        </p>
        <Link
          href={`/owner/payments?organizationId=${encodeURIComponent(retryRequest.body.organizationId)}`}
          className="mt-2 inline-block font-bold underline underline-offset-2"
        >
          Volver a los pagos de la academia del envío pendiente
        </Link>
      </div>
    ) : null;
  const otherActorPendingNotice = otherActorPending ? (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
    >
      Hay un envío pendiente en otra sesión de Owner. Vuelve a la cuenta que lo
      inició para reintentar ese mismo registro antes de crear otro pago.
    </div>
  ) : null;
  const legacyRecoveryNotice = legacyRecoveryRequired ? (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
    >
      <p>
        Hay un envío antiguo que no conserva qué usuario lo inició. Si lo
        recuperas, quedará vinculado a la sesión autenticada actual. El servidor
        volverá a comprobar los permisos y no se enviará hasta que pulses
        «Reintentar el mismo registro».
      </p>
      {(pendingCount > 0 || otherActorPending) && (
        <p className="mt-2">
          Resuelve primero el otro envío pendiente; este registro antiguo
          permanecerá guardado.
        </p>
      )}
      <button
        type="button"
        disabled={
          busy ||
          legacyRecoveryBusy ||
          !retryStorageReady ||
          retryStorageError !== null ||
          pendingCount > 0 ||
          otherActorPending
        }
        onClick={() => void recoverLegacyPendingPayment()}
        className="mt-3 min-h-11 rounded-full bg-amber-900 px-4 text-sm font-bold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {legacyRecoveryBusy
          ? "Recuperando…"
          : "Vincular el envío antiguo a esta sesión"}
      </button>
    </div>
  ) : null;

  if (loadedCharges.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold text-slate-950">
          No hay cargos pendientes
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Cuando la academia tenga un cargo abierto, podrás registrar aquí el
          dinero que ya hayas recibido y dejarlo conciliado en un solo paso.
        </p>
        {retryScopeNotice}
        {otherActorPendingNotice}
        {legacyRecoveryNotice}
        {retryStorageError && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {retryStorageError}
          </p>
        )}
        {retryRequest && retryBelongsToCurrentOrganization && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            <p>
              Hay un envío anterior cuyo resultado no se pudo confirmar. Puedes
              consultar el mismo envío sin crear otro registro.
            </p>
            {retryRequest.referenceRequired && (
              <label className="mt-3 grid gap-2">
                <span className="font-semibold">Vuelve a introducir la referencia del envío</span>
                <input
                  type="text"
                  maxLength={200}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  disabled={busy}
                  className="min-h-11 rounded-xl border border-amber-400 bg-white px-3 text-sm text-slate-950"
                />
              </label>
            )}
            <button
              type="button"
              disabled={
                busy || !retryStorageReady || retryStorageError !== null
              }
              onClick={retryPendingPayment}
              className="mt-2 min-h-11 rounded-full bg-amber-900 px-4 text-sm font-bold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Comprobando…" : "Reintentar el mismo registro"}
            </button>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {error}
          </p>
        )}
        {saved && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950"
          >
            Pago guardado y asignado al cargo.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
    >
      <div className="rounded-2xl border border-teal-900/15 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
        Registra solo dinero que ya has recibido. Zaltyko no iniciará ningún
        cobro.
      </div>
      {retryScopeNotice}
      {otherActorPendingNotice}
      {legacyRecoveryNotice}
      {retryStorageError && (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {retryStorageError}
        </p>
      )}
      <OwnerOperationalReadOnlyNotice organizationId={organizationId} />
      {dateInterpretationError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {dateInterpretationError === "timezone"
            ? "No se pudo interpretar la zona horaria de esta sede. No se puede registrar el pago."
            : "No se pudo interpretar la fecha de recepción en la zona horaria de la sede. Corrige la fecha o selecciona otra sede."}
        </p>
      )}

      <div className="grid gap-2">
        <label
          htmlFor={chargeSelectId}
          className="text-sm font-bold text-slate-900"
        >
          Cargo pendiente
        </label>
        <select
          id={chargeSelectId}
          value={chargeId}
          onChange={(event) => chooseCharge(event.target.value)}
          disabled={formLocked}
          aria-describedby={
            selectedCharge ? chargeHelpId : undefined
          }
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100"
        >
          {loadedCharges.map((charge) => (
            <option key={charge.chargeId} value={charge.chargeId}>
              {charge.payerName ?? "Pagador sin nombre"} ·{" "}
              {charge.invoiceReference} ·{" "}
              {formatMoney(charge.outstandingCents, charge.currency)} pendiente
            </option>
          ))}
        </select>
        {pageCursor && (
          <div className="grid justify-items-start gap-2">
            <button
              type="button"
              onClick={() => void loadMoreCharges()}
              disabled={!pageMatchesCurrentProps || loadingMore || formLocked}
              className="min-h-11 rounded-full border border-slate-400 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? "Cargando cargos…" : "Cargar más cargos"}
            </button>
            {loadMoreError && (
              <p role="alert" className="text-sm text-rose-800">
                No se pudieron cargar más cargos. Reintenta sin cambiar el pago seleccionado.
              </p>
            )}
          </div>
        )}
        {selectedCharge && (
          <span
            id={chargeHelpId}
            className="text-xs leading-5 text-slate-600"
          >
            {selectedCharge.locationName} · Vence el{" "}
            {formatPaymentDueDate(
              selectedCharge.dueAt,
              selectedCharge.locationTimezone
            )}
          </span>
        )}
      </div>

      {selectedCharge && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label
              htmlFor={amountInputId}
              className="text-sm font-bold text-slate-900"
            >
              Importe recibido
            </label>
            <span className="relative">
              <input
                id={amountInputId}
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.,][0-9]{1,2})?"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={formLocked}
                required
                aria-invalid={
                  amount.trim().length > 0 &&
                  (!amountCents ||
                    amountCents > selectedCharge.outstandingCents)
                }
                aria-describedby={amountHelpId}
                className="min-h-12 w-full rounded-xl border border-slate-300 px-3 pr-16 text-base text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500"
              >
                {selectedCharge.currency}
              </span>
            </span>
            <span
              id={amountHelpId}
              className="text-xs text-slate-600"
            >
              Pendiente:{" "}
              {formatMoney(
                selectedCharge.outstandingCents,
                selectedCharge.currency
              )}{" "}
              · Usa coma o punto decimal.
            </span>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-bold text-slate-900">
              Método de pago
            </span>
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as ManualPaymentMethod)
              }
              disabled={formLocked}
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100"
            >
              <option value="bank_transfer">Transferencia</option>
              <option value="cash">Efectivo</option>
              <option value="card_terminal">Tarjeta en el local</option>
              <option value="other">Otro</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold text-slate-900">
              Fecha de recepción
            </span>
            <input
              type="date"
              value={effectiveReceivedOn}
              max={today || undefined}
              onChange={(event) => {
                if (dateInterpretationError === "received-date") {
                  setDateInterpretationError(null);
                }
                setReceivedOn(event.target.value);
              }}
              disabled={formLocked}
              required
              className="min-h-12 rounded-xl border border-slate-300 px-3 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold text-slate-900">
              Referencia{" "}
              <span className="font-normal text-slate-500">(opcional)</span>
            </span>
            <input
              type="text"
              maxLength={200}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              disabled={
                busy ||
                !retryStorageReady ||
                (retryRequest !== null && !retryRequest.referenceRequired)
              }
              placeholder="Por ejemplo, concepto de la transferencia"
              className="min-h-12 rounded-xl border border-slate-300 px-3 text-sm text-slate-950 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100"
            />
            <span className="text-xs text-slate-500">
              No incluyas números completos de cuenta ni datos sensibles.
            </span>
          </label>
        </div>
      )}

      {selectedCharge && amountCents && (
        <p className="border-t border-slate-200 pt-4 text-sm text-slate-700">
          Se asignarán {formatMoney(amountCents, selectedCharge.currency)} a{" "}
          {selectedCharge.invoiceReference}. Si el importe es parcial, el cargo
          conservará su saldo pendiente.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950"
        >
          Pago guardado y asignado al cargo.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={
            busy ||
            !retryStorageReady ||
            retryStorageError !== null ||
            (retryRequest
              ? !retryBelongsToCurrentOrganization
              : pendingCount > 0 ||
                otherActorPending ||
                legacyRecoveryRequired ||
                writesBlocked ||
                dateInterpretationError !== null ||
                !selectedCharge ||
                !effectiveReceivedOn)
          }
          className="min-h-12 rounded-full bg-teal-900 px-6 text-sm font-bold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "Guardando…"
            : retryRequest && retryBelongsToCurrentOrganization
              ? "Reintentar el mismo registro"
              : retryRequest
                ? "Resuelve primero el envío pendiente"
                : "Guardar pago recibido"}
        </button>
        <span className="text-xs text-slate-500">
          {selectedCharge && amountCents
            ? `Total a registrar: ${formatMoney(amountCents, selectedCharge.currency)}`
            : "Elige un cargo e indica el importe recibido."}
        </span>
      </div>
    </form>
  );
}
