"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import { FamilyCollectionModeCard } from "@/components/owner-dashboard/FamilyCollectionModeCard";
import {
  getLocalCalendarDate,
  localDateToReceivedAt,
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
  canManageFamilyCollectionPreferences,
}: {
  organizationId: string;
  charges: OpenManualPaymentCharge[];
  canManageFamilyCollectionPreferences: boolean;
}) {
  const router = useRouter();
  const firstCharge = charges[0];
  const [chargeId, setChargeId] = useState(firstCharge?.chargeId ?? "");
  const selectedCharge = useMemo(
    () => charges.find((charge) => charge.chargeId === chargeId) ?? null,
    [chargeId, charges]
  );
  const [amount, setAmount] = useState(
    firstCharge ? (firstCharge.outstandingCents / 100).toFixed(2) : ""
  );
  const [method, setMethod] = useState<ManualPaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [today, setToday] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [retryRequest, setRetryRequest] = useState<{
    key: string;
    body: PaymentRequest;
  } | null>(null);

  useEffect(() => {
    const localToday = getLocalCalendarDate();
    const frame = window.requestAnimationFrame(() => {
      setToday(localToday);
      setReceivedOn((current) => current || localToday);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function chooseCharge(nextChargeId: string) {
    setChargeId(nextChargeId);
    const nextCharge = charges.find(
      (charge) => charge.chargeId === nextChargeId
    );
    setAmount(nextCharge ? (nextCharge.outstandingCents / 100).toFixed(2) : "");
    setSaved(false);
    setError(null);
  }

  async function sendPayment(key: string, body: PaymentRequest) {
    setBusy(true);
    setError(null);
    setSaved(false);
    setRetryRequest({ key, body });
    try {
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
        if (response.status < 500) setRetryRequest(null);
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
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retryRequest) {
      void sendPayment(retryRequest.key, retryRequest.body);
      return;
    }
    if (!selectedCharge || !receivedOn) return;
    const amountCents = parseAmountCents(amount);
    if (!amountCents || amountCents > selectedCharge.outstandingCents) {
      setError(
        "El importe debe ser mayor que cero y no superar el saldo pendiente."
      );
      return;
    }
    const receivedAt = localDateToReceivedAt(receivedOn);
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
  const formLocked = busy || retryRequest !== null;

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
            {new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(
              new Date(selectedCharge.dueAt)
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
              value={receivedOn}
              max={today || undefined}
              onChange={(event) => setReceivedOn(event.target.value)}
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

      {selectedCharge ? (
        <FamilyCollectionModeCard
          organizationId={organizationId}
          familyId={selectedCharge.familyId}
          canManage={canManageFamilyCollectionPreferences}
        />
      ) : null}

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
          disabled={busy || (!retryRequest && (!selectedCharge || !receivedOn))}
          className="min-h-12 rounded-full bg-teal-900 px-6 text-sm font-bold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "Guardando…"
            : retryRequest
              ? "Reintentar el mismo registro"
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
