"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
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

export function ManualPaymentForm({
  organizationId,
  charges,
}: {
  organizationId: string;
  charges: OpenManualPaymentCharge[];
  canManageFamilyCollectionPreferences?: boolean;
}) {
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesBlocked = planPolicy.status !== "ready" || planPolicy.readOnly;
  const router = useRouter();
  const firstCharge = charges[0];
  const [chargeId, setChargeId] = useOrganizationDraftField(
    organizationId,
    () => firstCharge?.chargeId ?? ""
  );
  const selectedCharge = useMemo(
    () => charges.find((charge) => charge.chargeId === chargeId) ?? null,
    [chargeId, charges]
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
  const [retryRequest, setRetryRequest] = useState<{
    key: string;
    body: PaymentRequest;
  } | null>(null);
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

  function chooseCharge(nextChargeId: string) {
    const currentCharge = charges.find(
      (charge) => charge.chargeId === chargeId
    );
    const nextCharge = charges.find(
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

  async function sendPayment(
    key: string,
    body: PaymentRequest,
    isRetry = false
  ) {
    if (paymentInFlight.current) return;
    paymentInFlight.current = true;
    try {
      setBusy(true);
      setError(null);
      setSaved(false);
      setRetryRequest({ key, body });
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
          setRetryRequest(null);
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

      setRetryRequest(null);
      setSaved(true);
      setAmount("");
      setReference("");
      router.refresh();
    } catch {
      setError(
        "No sabemos si se guardó. Reintenta este mismo envío; la clave segura evita duplicarlo."
      );
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
      if (retryRequest.body.organizationId !== organizationId) return;
      void sendPayment(retryRequest.key, retryRequest.body, true);
      return;
    }
    if (dateInterpretationError) return;
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
    void sendPayment(`owner-manual-payment:${crypto.randomUUID()}`, {
      organizationId,
      chargeId: selectedCharge.chargeId,
      amountCents,
      method,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      receivedAt,
    });
  }

  const amountCents = parseAmountCents(amount);
  const effectiveReceivedOn = receivedOn || today;
  const formLocked = busy || retryRequest !== null;
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

  if (charges.length === 0) {
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
        {retryRequest && retryBelongsToCurrentOrganization && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            <p>
              Hay un envío anterior cuyo resultado no se pudo confirmar. Puedes
              consultar el mismo envío sin crear otro registro.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void sendPayment(retryRequest.key, retryRequest.body, true)
              }
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

      <label className="grid gap-2">
        <span className="text-sm font-bold text-slate-900">
          Cargo pendiente
        </span>
        <select
          value={chargeId}
          onChange={(event) => chooseCharge(event.target.value)}
          disabled={formLocked}
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100"
        >
          {charges.map((charge) => (
            <option key={charge.chargeId} value={charge.chargeId}>
              {charge.payerName ?? "Pagador sin nombre"} ·{" "}
              {charge.invoiceReference} ·{" "}
              {formatMoney(charge.outstandingCents, charge.currency)} pendiente
            </option>
          ))}
        </select>
        {selectedCharge && (
          <span className="text-xs leading-5 text-slate-600">
            {selectedCharge.locationName} · Vence el{" "}
            {formatPaymentDueDate(
              selectedCharge.dueAt,
              selectedCharge.locationTimezone
            )}
          </span>
        )}
      </label>

      {selectedCharge && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-bold text-slate-900">
              Importe recibido
            </span>
            <span className="relative">
              <input
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
                aria-describedby="manual-payment-amount-help"
                className="min-h-12 w-full rounded-xl border border-slate-300 px-3 pr-16 text-base text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                {selectedCharge.currency}
              </span>
            </span>
            <span
              id="manual-payment-amount-help"
              className="text-xs text-slate-600"
            >
              Pendiente:{" "}
              {formatMoney(
                selectedCharge.outstandingCents,
                selectedCharge.currency
              )}{" "}
              · Usa coma o punto decimal.
            </span>
          </label>

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
              disabled={formLocked}
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
            (retryRequest
              ? !retryBelongsToCurrentOrganization
              : writesBlocked ||
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
