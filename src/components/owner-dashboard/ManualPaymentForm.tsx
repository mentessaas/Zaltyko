"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import {
  clearPendingManualPayment,
  createManualPaymentRetrySnapshot,
  persistPendingManualPayment,
  persistResolvedManualPaymentMarker,
  readAllPendingManualPayments,
  readResolvedManualPaymentMarker,
  restoreManualPaymentRetryBody,
  withManualPaymentRetryLock,
  type ManualPaymentRetrySnapshot,
} from "./manual-payment-retry-storage";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import { useOrganizationDraftField } from "./use-organization-draft-field";
import {
  formatMoney,
  getBrowserStorage,
  getRetryReceivedOn,
  isMatchingManualPaymentResponse,
  parseAmountCents,
  toPendingPaymentRequest,
  type ManualPaymentMethod,
  type PaymentRequest,
} from "./manual-payment-form-model";
import { useManualPaymentPagination } from "./use-manual-payment-pagination";
import {
  useManualPaymentBalanceMarkerSync,
  useManualPaymentRetryStorage,
} from "./use-manual-payment-retry-storage";
import {
  ManualPaymentEmptyState,
  ManualPaymentLegacyRecoveryNotice,
  ManualPaymentOtherActorNotice,
  ManualPaymentRetryScopeNotice,
} from "./ManualPaymentNotices";
import { ManualPaymentChargeField, ManualPaymentDetailsFields } from "./ManualPaymentFormFields";

import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import {
  calendarDateToReceivedAt,
  getCalendarDateInTimezone,
} from "@/modules/billing/domain/manual-payment-date";


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
  const {
    pageMatchesCurrentProps,
    loadedCharges,
    pageCursor,
    loadingMore,
    loadMoreError,
    loadMoreCharges,
  } = useManualPaymentPagination({ organizationId, locationId, charges, nextCursor });
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
  const {
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
  } = useManualPaymentRetryStorage({ actorId, setError });
  const paymentInFlight = useRef(false);

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

  useManualPaymentBalanceMarkerSync({ actorScopeHash, loadedCharges, organizationId });

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
  const retryBelongsToCurrentOrganization =
    retryRequest?.body.organizationId === organizationId;
  const retryForCurrentOrganization = retryBelongsToCurrentOrganization
    ? retryRequest
    : null;
  const retryCharge = retryForCurrentOrganization
    ? (loadedCharges.find(
        (charge) => charge.chargeId === retryForCurrentOrganization.body.chargeId
      ) ?? null)
    : null;
  const retryReceivedOn = retryForCurrentOrganization
    ? getRetryReceivedOn(retryForCurrentOrganization, retryCharge)
    : null;
  const formCharge = retryForCurrentOrganization
    ? retryCharge
    : selectedCharge;
  const displayedChargeId = retryForCurrentOrganization
    ? retryForCurrentOrganization.body.chargeId
    : chargeId;
  const displayedAmount = retryForCurrentOrganization
    ? (retryForCurrentOrganization.body.amountCents / 100).toFixed(2)
    : amount;
  const displayedAmountCents =
    retryForCurrentOrganization?.body.amountCents ?? amountCents;
  const displayedMethod =
    retryForCurrentOrganization?.body.method ?? method;
  const displayedReceivedOn = retryForCurrentOrganization
    ? (retryReceivedOn ?? "")
    : effectiveReceivedOn;
  const displayedCurrency =
    retryForCurrentOrganization?.snapshot.currency ?? selectedCharge?.currency;
  const formLocked =
    busy ||
    retryRequest !== null ||
    pendingCount > 0 ||
    otherActorPending ||
    legacyRecoveryRequired ||
    !retryStorageReady ||
    retryStorageError !== null;
  const retryScopeNotice = (
    <ManualPaymentRetryScopeNotice
      retryRequest={retryRequest}
      retryBelongsToCurrentOrganization={retryBelongsToCurrentOrganization}
    />
  );
  const otherActorPendingNotice = (
    <ManualPaymentOtherActorNotice otherActorPending={otherActorPending} />
  );
  const legacyRecoveryNotice = (
    <ManualPaymentLegacyRecoveryNotice
      legacyRecoveryRequired={legacyRecoveryRequired}
      otherSubmissionPending={pendingCount > 0 || otherActorPending}
      disabled={
        busy ||
        legacyRecoveryBusy ||
        !retryStorageReady ||
        retryStorageError !== null ||
        pendingCount > 0 ||
        otherActorPending
      }
      legacyRecoveryBusy={legacyRecoveryBusy}
      onRecover={() => void recoverLegacyPendingPayment()}
    />
  );

  if (loadedCharges.length === 0) {
    return (
      <ManualPaymentEmptyState
        notices={
          <>
            {retryScopeNotice}
            {otherActorPendingNotice}
            {legacyRecoveryNotice}
          </>
        }
        retryStorageError={retryStorageError}
        retryForCurrentOrganization={retryForCurrentOrganization}
        retryCharge={retryCharge}
        retryReceivedOn={retryReceivedOn}
        reference={reference}
        onReferenceChange={setReference}
        busy={busy}
        retryStorageReady={retryStorageReady}
        onRetry={retryPendingPayment}
        error={error}
        saved={saved}
      />
    );
  }

  return (
    <form
      onSubmit={submit}
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-6 rounded-3xl border border-z-line bg-white p-5 shadow-sm sm:p-8"
    >
      <div className="rounded-2xl border border-z-brand-100/15 bg-z-brand-50 px-4 py-3 text-sm leading-6 text-z-brand-700">
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

      <ManualPaymentChargeField
        chargeSelectId={chargeSelectId}
        chargeHelpId={chargeHelpId}
        displayedChargeId={displayedChargeId}
        onChooseCharge={chooseCharge}
        formLocked={formLocked}
        formCharge={formCharge}
        missingRetryChargeId={
          retryForCurrentOrganization && !retryCharge
            ? retryForCurrentOrganization.body.chargeId
            : null
        }
        loadedCharges={loadedCharges}
        pageCursor={pageCursor}
        onLoadMore={() => void loadMoreCharges(formLocked)}
        loadMoreDisabled={!pageMatchesCurrentProps || loadingMore || formLocked}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
      />

      {formCharge && (
        <ManualPaymentDetailsFields
          formCharge={formCharge}
          isRetry={Boolean(retryForCurrentOrganization)}
          retryCharge={retryCharge}
          amountInputId={amountInputId}
          amountHelpId={amountHelpId}
          displayedAmount={displayedAmount}
          onAmountChange={setAmount}
          amountInvalid={
            !retryForCurrentOrganization &&
            amount.trim().length > 0 &&
            (!amountCents || amountCents > formCharge.outstandingCents)
          }
          displayedCurrency={displayedCurrency}
          displayedMethod={displayedMethod}
          onMethodChange={setMethod}
          displayedReceivedOn={displayedReceivedOn}
          today={today}
          onReceivedOnChange={(value) => {
            if (dateInterpretationError === "received-date") {
              setDateInterpretationError(null);
            }
            setReceivedOn(value);
          }}
          reference={reference}
          onReferenceChange={setReference}
          referenceDisabled={
            busy ||
            !retryStorageReady ||
            (retryRequest !== null && !retryRequest.referenceRequired)
          }
          formLocked={formLocked}
        />
      )}

      {formCharge && displayedAmountCents && (
        <p className="border-t border-z-line pt-4 text-sm text-z-soft">
          {retryForCurrentOrganization
            ? `Importe del envío original: ${formatMoney(displayedAmountCents, displayedCurrency ?? formCharge.currency)} a `
            : `Se asignarán ${formatMoney(displayedAmountCents, formCharge.currency)} a `}
          {formCharge.invoiceReference}.
          {retryForCurrentOrganization
            ? " Se volverá a consultar este mismo envío; el saldo actual aparece arriba."
            : " Si el importe es parcial, el cargo conservará su saldo pendiente."}
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
          className="min-h-12 rounded-full bg-black px-6 text-sm font-bold text-white hover:bg-z-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "Guardando…"
            : retryRequest && retryBelongsToCurrentOrganization
              ? "Reintentar el mismo registro"
              : retryRequest
                ? "Resuelve primero el envío pendiente"
                : "Guardar pago recibido"}
        </button>
        <span className="text-xs text-z-soft">
          {formCharge && displayedAmountCents
            ? retryForCurrentOrganization
              ? `Importe original: ${formatMoney(displayedAmountCents, displayedCurrency ?? formCharge.currency)}`
              : `Total a registrar: ${formatMoney(displayedAmountCents, formCharge.currency)}`
            : "Elige un cargo e indica el importe recibido."}
        </span>
      </div>
    </form>
  );
}
