"use client";

import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import { formatPaymentDueDate } from "./owner-payment-date";
import { formatMoney, type ManualPaymentMethod } from "./manual-payment-form-model";

/** "Cargo pendiente" select, "Cargar más cargos" and the due date of the selected charge. */
export function ManualPaymentChargeField({
  chargeSelectId,
  chargeHelpId,
  displayedChargeId,
  onChooseCharge,
  formLocked,
  formCharge,
  missingRetryChargeId,
  loadedCharges,
  pageCursor,
  onLoadMore,
  loadMoreDisabled,
  loadingMore,
  loadMoreError,
}: {
  chargeSelectId: string;
  chargeHelpId: string;
  displayedChargeId: string;
  onChooseCharge: (chargeId: string) => void;
  formLocked: boolean;
  formCharge: OpenManualPaymentCharge | null;
  /** Charge of the original retried submission when it is no longer among the open charges. */
  missingRetryChargeId: string | null;
  loadedCharges: OpenManualPaymentCharge[];
  pageCursor: string | null;
  onLoadMore: () => void;
  loadMoreDisabled: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <label
        htmlFor={chargeSelectId}
        className="text-sm font-bold text-z-ink"
      >
        Cargo pendiente
      </label>
      <select
        id={chargeSelectId}
        value={displayedChargeId}
        onChange={(event) => onChooseCharge(event.target.value)}
        disabled={formLocked}
        aria-describedby={formCharge ? chargeHelpId : undefined}
        className="min-h-12 w-full min-w-0 max-w-full rounded-xl border border-z-line bg-white px-3 text-sm text-z-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:bg-z-canvas"
      >
        {missingRetryChargeId !== null && (
          <option value={missingRetryChargeId}>
            Cargo del envío original (saldo actual no disponible)
          </option>
        )}
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
            onClick={onLoadMore}
            disabled={loadMoreDisabled}
            className="min-h-11 rounded-full border border-z-line bg-white px-4 text-sm font-semibold text-z-ink hover:bg-z-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
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
      {formCharge && (
        <span
          id={chargeHelpId}
          className="text-xs leading-5 text-z-soft"
        >
          {formCharge.locationName} · Vence el{" "}
          {formatPaymentDueDate(
            formCharge.dueAt,
            formCharge.locationTimezone
          )}
        </span>
      )}
    </div>
  );
}

/** Amount, method, received date and reference for the selected charge or the retried submission. */
export function ManualPaymentDetailsFields({
  formCharge,
  isRetry,
  retryCharge,
  amountInputId,
  amountHelpId,
  displayedAmount,
  onAmountChange,
  amountInvalid,
  displayedCurrency,
  displayedMethod,
  onMethodChange,
  displayedReceivedOn,
  today,
  onReceivedOnChange,
  reference,
  onReferenceChange,
  referenceDisabled,
  formLocked,
}: {
  formCharge: OpenManualPaymentCharge;
  isRetry: boolean;
  retryCharge: OpenManualPaymentCharge | null;
  amountInputId: string;
  amountHelpId: string;
  displayedAmount: string;
  onAmountChange: (value: string) => void;
  amountInvalid: boolean;
  displayedCurrency: string | undefined;
  displayedMethod: ManualPaymentMethod;
  onMethodChange: (method: ManualPaymentMethod) => void;
  displayedReceivedOn: string;
  today: string;
  onReceivedOnChange: (value: string) => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  referenceDisabled: boolean;
  formLocked: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <label
          htmlFor={amountInputId}
          className="text-sm font-bold text-z-ink"
        >
          {isRetry
            ? "Importe del envío original"
            : "Importe recibido"}
        </label>
        <span className="relative">
          <input
            id={amountInputId}
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            value={displayedAmount}
            onChange={(event) => onAmountChange(event.target.value)}
            disabled={formLocked}
            required
            aria-invalid={amountInvalid}
            aria-describedby={amountHelpId}
            className="min-h-12 w-full rounded-xl border border-z-line px-3 pr-16 text-base text-z-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:bg-z-canvas"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-z-soft"
          >
            {displayedCurrency ?? formCharge.currency}
          </span>
        </span>
        <span
          id={amountHelpId}
          className="text-xs text-z-soft"
        >
          {isRetry
            ? `Saldo actual del cargo: ${retryCharge ? formatMoney(retryCharge.outstandingCents, retryCharge.currency) : "no disponible"}. El importe original del envío se conserva para el reintento.`
            : `Pendiente: ${formatMoney(formCharge.outstandingCents, formCharge.currency)} · Usa coma o punto decimal.`}
        </span>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-z-ink">
          {isRetry
            ? "Método del envío original"
            : "Método de pago"}
        </span>
        <select
          value={displayedMethod}
          onChange={(event) =>
            onMethodChange(event.target.value as ManualPaymentMethod)
          }
          disabled={formLocked}
          className="min-h-12 rounded-xl border border-z-line bg-white px-3 text-sm text-z-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:bg-z-canvas"
        >
          <option value="bank_transfer">Transferencia</option>
          <option value="cash">Efectivo</option>
          <option value="card_terminal">Tarjeta en el local</option>
          <option value="other">Otro</option>
        </select>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-z-ink">
          {isRetry
            ? "Fecha original de recepción"
            : "Fecha de recepción"}
        </span>
        <input
          type="date"
          value={displayedReceivedOn}
          max={today || undefined}
          onChange={(event) => onReceivedOnChange(event.target.value)}
          disabled={formLocked}
          required
          className="min-h-12 rounded-xl border border-z-line px-3 text-sm text-z-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:bg-z-canvas"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-bold text-z-ink">
          Referencia{" "}
          <span className="font-normal text-z-soft">(opcional)</span>
        </span>
        <input
          type="text"
          maxLength={200}
          value={reference}
          onChange={(event) => onReferenceChange(event.target.value)}
          disabled={referenceDisabled}
          placeholder="Por ejemplo, concepto de la transferencia"
          className="min-h-12 rounded-xl border border-z-line px-3 text-sm text-z-ink placeholder:text-z-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:bg-z-canvas"
        />
        <span className="text-xs text-z-soft">
          No incluyas números completos de cuenta ni datos sensibles.
        </span>
      </label>
    </div>
  );
}
