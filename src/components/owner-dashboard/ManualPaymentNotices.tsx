"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import {
  formatManualPaymentMethod,
  formatMoney,
  type PendingPaymentRequest,
} from "./manual-payment-form-model";
import { ownerField, ownerUi } from "./owner-ui";
import { cn } from "@/lib/utils";

/** A pending submission belongs to another academy: resolve it there first. */
export function ManualPaymentRetryScopeNotice({
  retryRequest,
  retryBelongsToCurrentOrganization,
}: {
  retryRequest: PendingPaymentRequest | null;
  retryBelongsToCurrentOrganization: boolean;
}) {
  return retryRequest && !retryBelongsToCurrentOrganization ? (
    <div
      role="alert"
      className={ownerUi.noticeWarning}
    >
      <p>
        Hay un envío de pago pendiente de confirmar en otra academia. Para
        evitar duplicados o confusiones, resuélvelo primero en su academia de
        origen.
      </p>
      <Link
        href={`/owner/payments?organizationId=${encodeURIComponent(retryRequest.body.organizationId)}`}
        className="mt-2 inline-flex min-h-11 items-center font-bold underline underline-offset-2"
      >
        Volver a los pagos de la academia del envío pendiente
      </Link>
    </div>
  ) : null;
}

/** A pending submission was started by another Owner session. */
export function ManualPaymentOtherActorNotice({
  otherActorPending,
}: {
  otherActorPending: boolean;
}) {
  return otherActorPending ? (
    <div
      role="alert"
      className={ownerUi.noticeWarning}
    >
      Hay un envío pendiente en otra sesión de Owner. Vuelve a la cuenta que lo
      inició para reintentar ese mismo registro antes de crear otro pago.
    </div>
  ) : null;
}

/** A legacy sessionStorage submission without actor that can be linked to this session. */
export function ManualPaymentLegacyRecoveryNotice({
  legacyRecoveryRequired,
  otherSubmissionPending,
  disabled,
  legacyRecoveryBusy,
  onRecover,
}: {
  legacyRecoveryRequired: boolean;
  otherSubmissionPending: boolean;
  disabled: boolean;
  legacyRecoveryBusy: boolean;
  onRecover: () => void;
}) {
  return legacyRecoveryRequired ? (
    <div
      role="alert"
      className={ownerUi.noticeWarning}
    >
      <p>
        Hay un envío antiguo que no conserva qué usuario lo inició. Si lo
        recuperas, quedará vinculado a la sesión autenticada actual. El servidor
        volverá a comprobar los permisos y no se enviará hasta que pulses
        «Reintentar el mismo registro».
      </p>
      {otherSubmissionPending && (
        <p className="mt-2">
          Resuelve primero el otro envío pendiente; este registro antiguo
          permanecerá guardado.
        </p>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onRecover}
        className={cn(ownerUi.primaryButton, "mt-3")}
      >
        {legacyRecoveryBusy
          ? "Recuperando…"
          : "Vincular el envío antiguo a esta sesión"}
      </button>
    </div>
  ) : null;
}

/**
 * View without open charges. It still lets a pending submission of this
 * academy be retried with the same idempotency key.
 */
export function ManualPaymentEmptyState({
  notices,
  retryStorageError,
  retryForCurrentOrganization,
  retryCharge,
  retryReceivedOn,
  reference,
  onReferenceChange,
  busy,
  retryStorageReady,
  onRetry,
  error,
  saved,
}: {
  notices: ReactNode;
  retryStorageError: string | null;
  retryForCurrentOrganization: PendingPaymentRequest | null;
  retryCharge: OpenManualPaymentCharge | null;
  retryReceivedOn: string | null;
  reference: string;
  onReferenceChange: (value: string) => void;
  busy: boolean;
  retryStorageReady: boolean;
  onRetry: () => void;
  error: string | null;
  saved: boolean;
}) {
  return (
    <div className={ownerUi.card}>
      <h2 className={ownerUi.cardTitle}>
        No hay cargos pendientes
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-z-soft">
        Cuando la academia tenga un cargo abierto, podrás registrar aquí el
        dinero que ya hayas recibido y dejarlo conciliado en un solo paso.
      </p>
      {notices}
      {retryStorageError && (
        <p role="alert" className={cn(ownerUi.noticeError, "mt-4")}>
          {retryStorageError}
        </p>
      )}
      {retryForCurrentOrganization && (
        <div className={cn(ownerUi.noticeWarning, "mt-4")}>
          <p>
            Hay un envío anterior cuyo resultado no se pudo confirmar. Puedes
            consultar el mismo envío sin crear otro registro.
          </p>
          <dl className="mt-3 grid gap-2 rounded-md bg-white p-3 text-z-ink sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Importe original</dt>
              <dd>
                {formatMoney(
                  retryForCurrentOrganization.body.amountCents,
                  retryForCurrentOrganization.snapshot.currency
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Método original</dt>
              <dd>{formatManualPaymentMethod(retryForCurrentOrganization.body.method)}</dd>
            </div>
            <div>
              <dt className="font-semibold">Fecha original de recepción</dt>
              <dd>
                {retryReceivedOn ?? retryForCurrentOrganization.body.receivedAt}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Saldo actual del cargo</dt>
              <dd>
                {retryCharge
                  ? formatMoney(
                      retryCharge.outstandingCents,
                      retryCharge.currency
                    )
                  : "No disponible entre los cargos pendientes"}
              </dd>
            </div>
          </dl>
          {retryForCurrentOrganization.referenceRequired && (
            <label className="mt-3 grid gap-2">
              <span className="font-semibold">Vuelve a introducir la referencia del envío</span>
              <input
                type="text"
                maxLength={200}
                value={reference}
                onChange={(event) => onReferenceChange(event.target.value)}
                disabled={busy}
                className={ownerField}
              />
            </label>
          )}
          <button
            type="button"
            disabled={
              busy || !retryStorageReady || retryStorageError !== null
            }
            onClick={onRetry}
            className={cn(ownerUi.primaryButton, "mt-3")}
          >
            {busy ? "Comprobando…" : "Reintentar el mismo registro"}
          </button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className={cn(ownerUi.noticeError, "mt-4")}
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className={cn(ownerUi.noticeInfo, "mt-4 font-semibold")}
        >
          Pago guardado y asignado al cargo.
        </p>
      )}
    </div>
  );
}
