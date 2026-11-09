"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import {
  formatManualPaymentMethod,
  formatMoney,
  type PendingPaymentRequest,
} from "./manual-payment-form-model";

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
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
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
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
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
        className="mt-3 min-h-11 rounded-full bg-amber-900 px-4 text-sm font-bold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="rounded-3xl border border-z-line bg-white p-6 sm:p-8">
      <h2 className="font-display text-xl font-bold text-z-ink">
        No hay cargos pendientes
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-z-soft">
        Cuando la academia tenga un cargo abierto, podrás registrar aquí el
        dinero que ya hayas recibido y dejarlo conciliado en un solo paso.
      </p>
      {notices}
      {retryStorageError && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {retryStorageError}
        </p>
      )}
      {retryForCurrentOrganization && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <p>
            Hay un envío anterior cuyo resultado no se pudo confirmar. Puedes
            consultar el mismo envío sin crear otro registro.
          </p>
          <dl className="mt-3 grid gap-2 rounded-lg bg-white/70 p-3 sm:grid-cols-2">
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
                className="min-h-11 rounded-xl border border-amber-400 bg-white px-3 text-sm text-z-ink"
              />
            </label>
          )}
          <button
            type="button"
            disabled={
              busy || !retryStorageReady || retryStorageError !== null
            }
            onClick={onRetry}
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
