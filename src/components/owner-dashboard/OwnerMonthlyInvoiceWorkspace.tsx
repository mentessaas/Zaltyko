"use client";

import { ownerField, ownerUi } from "./owner-ui";
import { OwnerListSkeleton } from "./OwnerFeedback";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
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
      athleteId: string;
      athleteName: string | null;
      pricePlanId: string;
      pricePlanName: string;
      amountCents: number;
      currency: string;
      coveredEnrollments: Array<{
        enrollmentId: string;
        classTemplateId: string;
        className: string;
        assignmentId: string;
      }>;
    }>;
    conflicts: Array<{
      athleteId: string;
      code: "ATHLETE_TARIFF_CONFLICT" | "TARIFF_COVERAGE_INCOMPLETE";
      enrollmentIds: string[];
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

// Campos, botones y avisos del sistema: forma compartida de `components/ui`
// y `ownerUi`, avisos en ocre y errores en señal (DESIGN.md, «Tonos de estado»).
const fieldClassName = ownerField;
const buttonClassName = ownerUi.primaryButton;
const secondaryButtonClassName = ownerUi.secondaryButton;

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
    CLASS_PERIOD_INCOMPLETE:
      "La clase no está vigente durante todo este periodo.",
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
      "La tarifa usa una moneda distinta a la de la cuota.",
    PRICE_PLAN_ZERO_AMOUNT:
      "La tarifa tiene un importe de cero y requiere revisión.",
    FAMILY_PAYER_REQUIRED:
      "Selecciona una persona pagadora adulta para esta familia.",
    NO_ACTIVE_ENROLLMENTS:
      "No hay inscripciones activas que generen cuota en este periodo.",
    CURRENCY_MISMATCH: "Las tarifas no usan una misma moneda.",
    PERIOD_ALREADY_INVOICED:
      "La cuota de este periodo ya está emitida para esta familia.",
    INVOICE_VOIDED:
      "La cuota de este periodo está anulada; no se puede emitir otra desde esta pantalla.",
    INVOICE_REFERENCE_TAKEN:
      "Ya existe otra factura con la referencia de esta cuota; revisa las facturas de la familia.",
    PERIOD_INVOICED_WITHOUT_SITE:
      "Esta familia ya tiene una cuota de este periodo sin sede asignada; revísala antes de emitir otra.",
    PERIOD_INVOICED_WITHOUT_SITE_VOIDED:
      "Esta familia tiene una cuota de este periodo sin sede asignada que está anulada; no se puede emitir otra desde esta pantalla.",
  };
  return (
    labels[reason] ?? "Esta cuota requiere revisar un dato de la inscripción."
  );
}

function conflictLabel(
  code: "ATHLETE_TARIFF_CONFLICT" | "TARIFF_COVERAGE_INCOMPLETE"
): string {
  if (code === "ATHLETE_TARIFF_CONFLICT") {
    return "Esta gimnasta tiene tarifas distintas entre sus clases mensuales.";
  }
  return "La tarifa no cubre todas las clases mensuales de esta gimnasta.";
}

export function OwnerMonthlyInvoiceWorkspace({
  state,
  options,
  selectedFamilyId,
  payerResetKey = 0,
  dueDate,
  errorMessage,
  successMessage,
  quoteNeedsReview = false,
  busy = false,
  writesBlocked = false,
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
  payerResetKey?: number;
  dueDate: string;
  errorMessage?: string;
  successMessage?: string;
  quoteNeedsReview?: boolean;
  busy?: boolean;
  writesBlocked?: boolean;
  onFamilyChange: (familyId: string) => void;
  onDueDateChange: (dueDate: string) => void;
  onRetry: () => void;
  onAssignTariff: (enrollmentId: string) => void;
  onLinkFamily: (enrollmentId: string) => void;
  onAssignPayer: (familyId: string) => void;
  onIssue: (command: IssueCommand) => void;
}) {
  const [payerSelection, setPayerSelection] = useState({
    familyId: selectedFamilyId,
    resetKey: payerResetKey,
    payerId: "",
  });
  const familyPayerId =
    payerSelection.familyId === selectedFamilyId &&
    payerSelection.resetKey === payerResetKey
      ? payerSelection.payerId
      : "";
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
    selectedFamily.conflicts.length === 0 &&
    selectedPayer &&
    dueDate &&
    selectedFamily.totalAmountCents !== null &&
    selectedFamily.currency &&
    selectedFamily.lines.length > 0 &&
    selectedFamily.quoteHash &&
    selectedFamily.blockingReasons.length === 0 &&
    !hasInvoice &&
    !busy &&
    !writesBlocked
  );

  function issue() {
    if (
      !options ||
      !selectedFamily ||
      !selectedPayer ||
      !selectedFamily.canIssue ||
      selectedFamily.conflicts.length > 0 ||
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
    <main className={ownerUi.page}>
      <div className="mx-auto grid max-w-4xl gap-8">
        <PageHeader
          title="Emitir cuota mensual"
          description="Revisa la cuota completa de la familia. Al emitirla queda pendiente de pago; no se registra ni se inicia ningún pago."
        />

        {state === "loading" && <OwnerListSkeleton label="Cargando cuotas mensuales…" rows={3} />}

        {state === "error" && (
          <div
            role="alert"
            className={cn(ownerUi.noticeError, "grid gap-3")}
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
            <p className="rounded-xl border border-z-line bg-white p-5 text-sm leading-6 text-z-soft">
              No hay familias con inscripciones mensuales que generen cuota en
              este periodo.
            </p>
          )}

        {(state === "ready" ||
          (state === "empty" && options?.unassignedEnrollments.length)) &&
          options && (
            <section
              aria-labelledby="monthly-invoice-options-heading"
              className={cn(ownerUi.card, "grid gap-6 sm:p-7")}
            >
              <h2
                id="monthly-invoice-options-heading"
                className={ownerUi.sectionTitle}
              >
                Revisa la cuota
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold">Familia</span>
                  <select
                    value={selectedFamilyId}
                    onChange={(event) => {
                      const familyId = event.target.value;
                      setPayerSelection({
                        familyId,
                        resetKey: payerResetKey,
                        payerId: "",
                      });
                      onFamilyChange(familyId);
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
                    onChange={(event) =>
                      setPayerSelection({
                        familyId: selectedFamilyId,
                        resetKey: payerResetKey,
                        payerId: event.target.value,
                      })
                    }
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
                    className="text-xs text-z-soft"
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
                    className="text-xs text-z-soft"
                  >
                    La fecha se interpreta en la zona horaria de la sede (
                    {options.timezone}).
                  </span>
                </div>
              </div>

              {!selectedFamily && (
                <p
                  role="alert"
                  className={ownerUi.noticeWarning}
                >
                  Selecciona una familia para revisar sus inscripciones
                  mensuales.
                </p>
              )}

              {selectedFamily && selectedFamily.payers.length === 0 && (
                <div className={cn(ownerUi.noticeWarning, "grid gap-3")}>
                  <p>
                    Esta familia todavía no tiene un pagador adulto asignado. La
                    cuota no se puede emitir hasta vincularlo explícitamente.
                  </p>
                  <button
                    type="button"
                    onClick={() => onAssignPayer(selectedFamily.familyId)}
                    disabled={busy || writesBlocked}
                    className={secondaryButtonClassName}
                  >
                    Asignar un pagador adulto
                  </button>
                </div>
              )}

              {selectedFamily?.blockingReasons.length ? (
                <section
                  aria-labelledby="monthly-invoice-blockers-heading"
                  className={cn(ownerUi.noticeWarning, "grid gap-3")}
                >
                  <h3
                    id="monthly-invoice-blockers-heading"
                    className="font-bold"
                  >
                    Revisa el estado de la cuota
                  </h3>
                  <ul className="grid gap-2">
                    {selectedFamily.blockingReasons.map((reason) => (
                      <li key={reason} className="text-sm">
                        {reasonLabel(reason)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {selectedFamily && selectedFamily.conflicts.length > 0 && (
                <section
                  role="alert"
                  aria-labelledby="monthly-invoice-conflicts-heading"
                  className={cn(ownerUi.noticeWarning, "grid gap-3")}
                >
                  <h3
                    id="monthly-invoice-conflicts-heading"
                    className="font-bold"
                  >
                    Resuelve los conflictos de tarifa antes de emitir
                  </h3>
                  <ul className="grid gap-2">
                    {selectedFamily.conflicts.map((conflict) => {
                      const athleteName =
                        selectedFamily.enrollments.find(
                          (enrollment) =>
                            enrollment.athleteId === conflict.athleteId
                        )?.athleteName ?? null;

                      return (
                        <li
                          key={`${conflict.athleteId}:${conflict.code}`}
                          className="text-sm"
                        >
                          <span className="font-semibold">
                            {athleteLabel(athleteName)}:{" "}
                          </span>
                          {conflictLabel(conflict.code)}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {selectedFamily &&
                selectedFamily.enrollments.some(
                  (item) =>
                    item.blockingReasons.length > 0 || !item.assignedPrice
                ) && (
                  <section
                    aria-labelledby="monthly-invoice-enrollment-issues-heading"
                    className={cn(ownerUi.noticeWarning, "grid gap-3")}
                  >
                    <h3
                      id="monthly-invoice-enrollment-issues-heading"
                      className="font-bold"
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
                            className="grid gap-3 border-t border-ochre-line pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                          >
                            <div className="grid min-w-0 gap-1">
                              <span className="break-words text-sm font-semibold">
                                {athleteLabel(enrollment.athleteName)}
                              </span>
                              {enrollment.blockingReasons.length > 0 && (
                                <div className="grid min-w-0 gap-1">
                                  {enrollment.blockingReasons.map((reason) => (
                                    <span
                                      key={reason}
                                      className="break-words text-sm"
                                    >
                                      {reasonLabel(reason)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              {(enrollment.blockingReasons.some((reason) =>
                                reason.startsWith("PRICE_")
                              ) ||
                                !enrollment.assignedPrice) && (
                                <button
                                  type="button"
                                  disabled={busy || writesBlocked}
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
                                  disabled={busy || writesBlocked}
                                  onClick={() =>
                                    onLinkFamily(enrollment.enrollmentId)
                                  }
                                  className={secondaryButtonClassName}
                                  aria-label={`Vincular a una familia a ${athleteLabel(enrollment.athleteName)}`}
                                >
                                  Vincular familia
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}

              {selectedFamily?.existingInvoiceId && (
                <p
                  role="alert"
                  className={ownerUi.noticeWarning}
                >
                  Ya existe una cuota para esta familia y periodo. No se puede
                  emitir otra desde esta pantalla.
                </p>
              )}

              {options.unassignedEnrollments.length > 0 && (
                <section
                  aria-labelledby="monthly-invoice-unassigned-heading"
                  className="grid gap-3 rounded-md border border-z-line bg-z-canvas p-4"
                >
                  <h3
                    id="monthly-invoice-unassigned-heading"
                    className="font-bold"
                  >
                    Inscripciones sin familia
                  </h3>
                  <p className="text-sm text-z-soft">
                    No aparecen en las cuotas de este periodo y no bloquean a
                    las demás familias.
                  </p>
                  <ul className="grid gap-2">
                    {options.unassignedEnrollments.map((enrollment) => (
                      <li
                        key={enrollment.enrollmentId}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-z-line pt-2"
                      >
                        <span className="text-sm font-semibold">
                          {athleteLabel(enrollment.athleteName)}
                        </span>
                        <button
                          type="button"
                          disabled={busy || writesBlocked}
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
                  className={ownerUi.noticeWarning}
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
                    <p className="text-sm text-z-soft">
                      {options.servicePeriod} · cuota mensual completa, sin
                      prorrateo
                    </p>
                  </div>
                  {options.pricingNote && (
                    <p className="text-sm text-z-soft">
                      {options.pricingNote}
                    </p>
                  )}
                  <ul
                    aria-label="Desglose por gimnasta"
                    className="divide-y divide-z-line border-y border-z-line"
                  >
                    {selectedFamily.lines.map((line) => (
                      <li
                        key={line.athleteId}
                        className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                      >
                        <div className="grid gap-1">
                          <h4 className="font-semibold">
                            {athleteLabel(line.athleteName)}
                          </h4>
                          <p className="text-sm text-z-soft">
                            Clases cubiertas:{" "}
                            {line.coveredEnrollments
                              .map((enrollment) => enrollment.className)
                              .join(", ")}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-z-ink sm:text-right">
                          {line.pricePlanName} ·{" "}
                          {formatMoney(line.amountCents, line.currency)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {selectedFamily.totalAmountCents !== null &&
                    selectedFamily.currency && (
                      <p className="flex flex-wrap justify-between gap-2 border-t border-z-line pt-4 text-lg font-bold">
                        <span>Total de la cuota</span>
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
                  className={ownerUi.noticeInfo}
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
                {busy ? "Emitiendo cuota…" : "Emitir cuota pendiente"}
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
