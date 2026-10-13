"use client";

import { useState } from "react";

export type MonthlyInvoiceOptionsResponse = {
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  timezone: string;
  pricingNote: string;
  pricePlans: Array<{
    id: string;
    name: string;
    amountCents: number;
    currency: string;
    cadence: string;
  }>;
  families: Array<{
    familyId: string;
    athleteNames: Array<string | null>;
    payers: Array<{
      familyPayerId: string;
      displayName: string | null;
      isPrimary: boolean;
    }>;
    enrollments: Array<{
      enrollmentId: string;
      athleteId: string;
      athleteName: string | null;
      status: string;
      billable: boolean;
      blockingReasons: string[];
      assignedPrice: {
        pricePlanId: string;
        name: string;
        amountCents: number;
        currency: string;
        startsOn: string;
        endsOn: string | null;
      } | null;
    }>;
    lines: Array<{
      enrollmentId: string;
      athleteName: string | null;
      pricePlanId: string;
      pricePlanName: string;
      amountCents: number;
      currency: string;
    }>;
    totalAmountCents: number | null;
    currency: string | null;
    blockingReasons: string[];
    canIssue: boolean;
    quoteHash: string | null;
    existingInvoiceId: string | null;
    existingInvoiceVoided: boolean;
  }>;
  unassignedEnrollments: Array<{
    enrollmentId: string;
    athleteId: string;
    athleteName: string | null;
    status: string;
    blockingReasons: string[];
  }>;
};

type IssueCommand = {
  organizationId: string;
  locationId: string;
  familyId: string;
  familyPayerId: string;
  servicePeriod: string;
  dueDate: string;
  quoteHash: string;
};

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100";
const buttonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-teal-800 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800";

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

function athleteLabel(value: string | null): string {
  return value?.trim() || "Gimnasta sin nombre";
}

function familyLabel(athleteNames: Array<string | null>): string {
  const names = athleteNames.map(athleteLabel);
  if (names.length === 0) return "Familia sin gimnastas asociadas";
  if (names.length <= 2) return names.join(" y ");
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    ENROLLMENT_PENDING: "La inscripción todavía está pendiente.",
    ENROLLMENT_PERIOD_INCOMPLETE:
      "La inscripción no cubre este periodo completo.",
    FAMILY_REQUIRED: "Falta vincular la inscripción a una familia.",
    FAMILY_MEMBERSHIP_AMBIGUOUS:
      "La inscripción aparece vinculada a más de una familia.",
    FAMILY_MEMBERSHIP_PERIOD_INCOMPLETE:
      "La relación con la familia no cubre este periodo completo.",
    FAMILY_INACTIVE: "La familia no está activa para este periodo.",
    PRICE_ASSIGNMENT_REQUIRED: "Falta asignar una tarifa mensual.",
    PRICE_ASSIGNMENT_AMBIGUOUS:
      "Hay más de una tarifa asignada para este periodo.",
    PRICE_ASSIGNMENT_PERIOD_INCOMPLETE:
      "La tarifa asignada no cubre este periodo completo.",
    PRICE_PLAN_NOT_AVAILABLE: "La tarifa ya no está disponible.",
    PRICE_ASSIGNMENT_CURRENCY_MISMATCH:
      "La tarifa usa una moneda distinta a la de la factura.",
    PRICE_PLAN_ZERO_AMOUNT:
      "La tarifa tiene un importe de cero y requiere revisión.",
    FAMILY_PAYER_REQUIRED:
      "Selecciona una persona pagadora adulta para esta familia.",
    NO_ACTIVE_ENROLLMENTS:
      "No hay inscripciones activas para facturar en este periodo.",
    CURRENCY_MISMATCH: "Las tarifas no usan una misma moneda.",
  };
  return (
    labels[reason] ?? "Esta factura requiere revisar un dato de la inscripción."
  );
}

export function OwnerMonthlyInvoiceWorkspace({
  state,
  options,
  selectedFamilyId,
  dueDate,
  errorMessage,
  successMessage,
  quoteNeedsReview = false,
  busy = false,
  onFamilyChange,
  onDueDateChange,
  onRetry,
  onAssignTariff,
  onLinkFamily,
  onAssignPayer,
  onIssue,
}: {
  state: "loading" | "error" | "empty" | "ready";
  options?: MonthlyInvoiceOptionsResponse;
  selectedFamilyId: string;
  dueDate: string;
  errorMessage?: string;
  successMessage?: string;
  quoteNeedsReview?: boolean;
  busy?: boolean;
  onFamilyChange: (familyId: string) => void;
  onDueDateChange: (dueDate: string) => void;
  onRetry: () => void;
  onAssignTariff: (enrollmentId: string) => void;
  onLinkFamily: (enrollmentId: string) => void;
  onAssignPayer: (familyId: string) => void;
  onIssue: (command: IssueCommand) => void;
}) {
  const [familyPayerId, setFamilyPayerId] = useState("");
  const selectedFamily = options?.families.find(
    (family) => family.familyId === selectedFamilyId
  );
  const selectedPayer = selectedFamily?.payers.find(
    (payer) => payer.familyPayerId === familyPayerId
  );
  const hasInvoice = Boolean(selectedFamily?.existingInvoiceId);
  const canIssue = Boolean(
    state === "ready" &&
    options &&
    selectedFamily?.canIssue &&
    selectedPayer &&
    dueDate &&
    selectedFamily.totalAmountCents !== null &&
    selectedFamily.currency &&
    selectedFamily.lines.length > 0 &&
    selectedFamily.quoteHash &&
    selectedFamily.blockingReasons.length === 0 &&
    !hasInvoice &&
    !busy
  );

  function issue() {
    if (
      !options ||
      !selectedFamily ||
      !selectedPayer ||
      !selectedFamily.quoteHash
    ) {
      return;
    }
    onIssue({
      organizationId: options.organizationId,
      locationId: options.locationId,
      familyId: selectedFamily.familyId,
      familyPayerId: selectedPayer.familyPayerId,
      servicePeriod: options.servicePeriod,
      dueDate,
      quoteHash: selectedFamily.quoteHash,
    });
  }

  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-6 text-slate-950 sm:py-10">
      <div className="mx-auto grid max-w-4xl gap-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-900">
            Facturación mensual
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Emitir cuota mensual
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Revisa la cuota completa de la familia. Emitir crea la factura; no
            registra ni inicia un pago.
          </p>
        </header>

        {state === "loading" && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-slate-700"
          >
            Cargando opciones de facturación…
          </p>
        )}

        {state === "error" && (
          <div
            role="alert"
            className="grid gap-3 border border-red-300 bg-red-50 p-4 text-sm text-red-900"
          >
            <p>{errorMessage ?? "No se han podido cargar las cuotas."}</p>
            <button
              type="button"
              onClick={onRetry}
              className={secondaryButtonClassName}
            >
              Volver a intentar
            </button>
          </div>
        )}

        {state === "empty" &&
          (!options ||
            (options.families.length === 0 &&
              options.unassignedEnrollments.length === 0)) && (
            <p className="border border-slate-300 bg-white p-5 text-sm leading-6 text-slate-700">
              No hay familias con inscripciones mensuales para facturar en este
              periodo.
            </p>
          )}

        {(state === "ready" ||
          (state === "empty" && options?.unassignedEnrollments.length)) &&
          options && (
            <section
              aria-labelledby="monthly-invoice-options-heading"
              className="grid gap-6 border border-slate-200 bg-white p-5 sm:p-7"
            >
              <h2
                id="monthly-invoice-options-heading"
                className="text-xl font-bold"
              >
                Revisa la factura
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold">Familia</span>
                  <select
                    value={selectedFamilyId}
                    onChange={(event) => {
                      setFamilyPayerId("");
                      onFamilyChange(event.target.value);
                    }}
                    disabled={busy}
                    required
                    className={fieldClassName}
                  >
                    <option value="">Selecciona una familia</option>
                    {options.families.map((family) => (
                      <option key={family.familyId} value={family.familyId}>
                        {familyLabel(family.athleteNames)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-2">
                  <label
                    htmlFor="monthly-invoice-payer-select"
                    className="text-sm font-bold"
                  >
                    Quién paga
                  </label>
                  <select
                    id="monthly-invoice-payer-select"
                    value={familyPayerId}
                    onChange={(event) => setFamilyPayerId(event.target.value)}
                    disabled={
                      busy ||
                      !selectedFamily ||
                      selectedFamily.payers.length === 0
                    }
                    required
                    className={fieldClassName}
                    aria-describedby="monthly-invoice-payer-help"
                  >
                    <option value="">Selecciona un pagador adulto</option>
                    {selectedFamily?.payers.map((payer) => (
                      <option
                        key={payer.familyPayerId}
                        value={payer.familyPayerId}
                      >
                        {payer.displayName?.trim() ||
                          "Persona pagadora sin nombre"}
                      </option>
                    ))}
                  </select>
                  <span
                    id="monthly-invoice-payer-help"
                    className="text-xs text-slate-600"
                  >
                    Confirma explícitamente la persona responsable de este pago.
                  </span>
                </div>

                <div className="grid gap-2">
                  <label
                    htmlFor="monthly-invoice-due-date"
                    className="text-sm font-bold"
                  >
                    Fecha de vencimiento
                  </label>
                  <input
                    id="monthly-invoice-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(event) => onDueDateChange(event.target.value)}
                    disabled={busy}
                    required
                    className={fieldClassName}
                    aria-describedby="monthly-invoice-due-help"
                  />
                  <span
                    id="monthly-invoice-due-help"
                    className="text-xs text-slate-600"
                  >
                    La fecha se interpreta en la zona horaria de la sede (
                    {options.timezone}).
                  </span>
                </div>
              </div>

              {!selectedFamily && (
                <p
                  role="alert"
                  className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
                >
                  Selecciona una familia para revisar sus inscripciones
                  mensuales.
                </p>
              )}

              {selectedFamily && selectedFamily.payers.length === 0 && (
                <div className="grid gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p>
                    Esta familia todavía no tiene un pagador adulto asignado. La
                    factura no se puede emitir hasta vincularlo explícitamente.
                  </p>
                  <button
                    type="button"
                    onClick={() => onAssignPayer(selectedFamily.familyId)}
                    className={secondaryButtonClassName}
                  >
                    Asignar un pagador adulto
                  </button>
                </div>
              )}

              {selectedFamily?.blockingReasons.length ? (
                <section
                  aria-labelledby="monthly-invoice-blockers-heading"
                  className="grid gap-3 border border-amber-300 bg-amber-50 p-4"
                >
                  <h3
                    id="monthly-invoice-blockers-heading"
                    className="font-bold text-amber-950"
                  >
                    Completa estos datos antes de emitir
                  </h3>
                  <ul className="grid gap-2">
                    {selectedFamily.blockingReasons.map((reason) => (
                      <li key={reason} className="text-sm text-amber-950">
                        {reasonLabel(reason)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {selectedFamily &&
                selectedFamily.enrollments.some(
                  (item) =>
                    item.blockingReasons.length > 0 || !item.assignedPrice
                ) && (
                  <section
                    aria-labelledby="monthly-invoice-enrollment-issues-heading"
                    className="grid gap-3 border border-amber-300 bg-amber-50 p-4"
                  >
                    <h3
                      id="monthly-invoice-enrollment-issues-heading"
                      className="font-bold text-amber-950"
                    >
                      Inscripciones que requieren atención
                    </h3>
                    <ul className="grid gap-3">
                      {selectedFamily.enrollments
                        .filter(
                          (item) =>
                            item.blockingReasons.length > 0 ||
                            !item.assignedPrice
                        )
                        .map((enrollment) => (
                          <li
                            key={enrollment.enrollmentId}
                            className="grid gap-2 border-t border-amber-200 pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                          >
                            <span className="text-sm font-semibold text-amber-950">
                              {athleteLabel(enrollment.athleteName)}
                            </span>
                            {enrollment.blockingReasons.map((reason) => (
                              <span
                                key={reason}
                                className="text-sm text-amber-950"
                              >
                                {reasonLabel(reason)}
                              </span>
                            ))}
                            {(enrollment.blockingReasons.some((reason) =>
                              reason.startsWith("PRICE_")
                            ) ||
                              !enrollment.assignedPrice) && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAssignTariff(enrollment.enrollmentId)
                                }
                                className={secondaryButtonClassName}
                                aria-label={`Asignar tarifa mensual a ${athleteLabel(enrollment.athleteName)}`}
                              >
                                Asignar tarifa
                              </button>
                            )}
                            {enrollment.blockingReasons.some((reason) =>
                              [
                                "FAMILY_REQUIRED",
                                "FAMILY_MEMBERSHIP_AMBIGUOUS",
                                "FAMILY_MEMBERSHIP_PERIOD_INCOMPLETE",
                              ].includes(reason)
                            ) && (
                              <button
                                type="button"
                                onClick={() =>
                                  onLinkFamily(enrollment.enrollmentId)
                                }
                                className={secondaryButtonClassName}
                                aria-label={`Vincular a una familia a ${athleteLabel(enrollment.athleteName)}`}
                              >
                                Vincular familia
                              </button>
                            )}
                          </li>
                        ))}
                    </ul>
                  </section>
                )}

              {selectedFamily?.existingInvoiceId && (
                <p
                  role="alert"
                  className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
                >
                  Ya existe una factura para esta familia y periodo. No se puede
                  emitir otra desde esta pantalla.
                </p>
              )}

              {options.unassignedEnrollments.length > 0 && (
                <section
                  aria-labelledby="monthly-invoice-unassigned-heading"
                  className="grid gap-3 border border-slate-300 bg-slate-50 p-4"
                >
                  <h3
                    id="monthly-invoice-unassigned-heading"
                    className="font-bold"
                  >
                    Inscripciones sin familia
                  </h3>
                  <p className="text-sm text-slate-700">
                    No aparecen en las facturas de este periodo y no bloquean a
                    las demás familias.
                  </p>
                  <ul className="grid gap-2">
                    {options.unassignedEnrollments.map((enrollment) => (
                      <li
                        key={enrollment.enrollmentId}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-2"
                      >
                        <span className="text-sm font-semibold">
                          {athleteLabel(enrollment.athleteName)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onLinkFamily(enrollment.enrollmentId)}
                          className={secondaryButtonClassName}
                          aria-label={`Vincular a una familia a ${athleteLabel(enrollment.athleteName)}`}
                        >
                          Vincular familia
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {quoteNeedsReview && (
                <p
                  role="alert"
                  className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
                >
                  La cuota ha cambiado. El desglose se ha actualizado; revísalo
                  antes de emitir.
                </p>
              )}

              {selectedFamily && selectedFamily.lines.length > 0 && (
                <section
                  aria-labelledby="monthly-invoice-lines-heading"
                  className="grid gap-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3
                      id="monthly-invoice-lines-heading"
                      className="font-bold"
                    >
                      Cuotas de {familyLabel(selectedFamily.athleteNames)}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {options.servicePeriod} · cuota mensual completa, sin
                      prorrateo
                    </p>
                  </div>
                  {options.pricingNote && (
                    <p className="text-sm text-slate-600">
                      {options.pricingNote}
                    </p>
                  )}
                  <ul className="divide-y divide-slate-200 border-y border-slate-200">
                    {selectedFamily.lines.map((line) => (
                      <li
                        key={line.enrollmentId}
                        className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <span className="font-semibold">
                          {athleteLabel(line.athleteName)}
                        </span>
                        <span className="text-sm text-slate-700">
                          {line.pricePlanName} ·{" "}
                          {formatMoney(line.amountCents, line.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {selectedFamily.totalAmountCents !== null &&
                    selectedFamily.currency && (
                      <p className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4 text-lg font-bold">
                        <span>Total de la factura</span>
                        <span>
                          {formatMoney(
                            selectedFamily.totalAmountCents,
                            selectedFamily.currency
                          )}
                        </span>
                      </p>
                    )}
                </section>
              )}

              {successMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className="border border-teal-300 bg-teal-50 p-4 text-sm text-teal-950"
                >
                  {successMessage}
                </p>
              )}

              <button
                type="button"
                disabled={!canIssue}
                onClick={issue}
                className={buttonClassName}
              >
                {busy ? "Emitiendo factura…" : "Emitir factura pendiente"}
                {selectedFamily?.totalAmountCents !== null &&
                  selectedFamily?.currency &&
                  ` · ${formatMoney(selectedFamily.totalAmountCents, selectedFamily.currency)}`}
              </button>
            </section>
          )}
      </div>
    </main>
  );
}
