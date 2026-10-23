"use client";

import Link from "next/link";
import { Check, Search } from "lucide-react";
import { useEffect, useRef, type FormEventHandler } from "react";

import {
  fieldClassName,
  formatDate,
  primaryButtonClassName,
} from "./owner-enrollment-ui";
import { isEnrollmentStartDateAllowed } from "./owner-enrollment-date";
import type { Candidate, EnrollmentBundle, PricePlanOption } from "./owner-enrollment-types";

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

type Props = {
  organizationId: string;
  locations: EnrollmentBundle["locations"];
  classes: EnrollmentBundle["classes"];
  createLocationId: string;
  classTemplateId: string;
  classesForLocation: EnrollmentBundle["classes"];
  selectedClass: EnrollmentBundle["classes"][number] | undefined;
  participantLabel: string;
  candidates: Candidate[];
  selectedCandidate: Candidate | null;
  candidateQuery: string;
  candidateLoading: boolean;
  candidateError: string;
  candidateNotice: string;
  startsOn: string;
  pricePlans: PricePlanOption[];
  pricePlansLoading: boolean;
  pricePlansError: string;
  pricePlanUnavailable?: boolean;
  pricePlanId: string;
  createToday: string;
  busyCreate: boolean;
  writesBlocked?: boolean;
  previewMode: boolean;
  onLocationChange: (locationId: string) => void;
  onClassChange: (classTemplateId: string) => void;
  onCandidateQueryChange: (query: string) => void;
  onCandidateSelect: (candidate: Candidate) => void;
  onCandidateClear: () => void;
  onStartsOnChange: (date: string) => void;
  onPricePlanChange: (pricePlanId: string) => void;
  onRetryCandidates: () => void;
  onRetryPricePlans: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

type CandidateFocusRequest = {
  organizationId: string;
  locationId: string;
  classId: string;
  candidateId: string | null;
  trigger: HTMLButtonElement;
};

export function OwnerEnrollmentCreateForm({
  organizationId,
  locations,
  classes,
  createLocationId,
  classTemplateId,
  classesForLocation,
  selectedClass,
  participantLabel,
  candidates,
  selectedCandidate,
  candidateQuery,
  candidateLoading,
  candidateError,
  candidateNotice,
  startsOn,
  pricePlans,
  pricePlansLoading,
  pricePlansError,
  pricePlanUnavailable = false,
  pricePlanId,
  createToday,
  busyCreate,
  writesBlocked = false,
  previewMode,
  onLocationChange,
  onClassChange,
  onCandidateQueryChange,
  onCandidateSelect,
  onCandidateClear,
  onStartsOnChange,
  onPricePlanChange,
  onRetryCandidates,
  onRetryPricePlans,
  onSubmit,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const focusRequestRef = useRef<CandidateFocusRequest | null>(null);
  const selectedCandidateId = selectedCandidate?.id ?? null;
  const startsOnOutsideClassPeriod = Boolean(
    selectedClass &&
      startsOn &&
      !isEnrollmentStartDateAllowed(startsOn, selectedClass)
  );

  useEffect(() => {
    const request = focusRequestRef.current;
    if (!request) return;
    focusRequestRef.current = null;
    if (
      request.organizationId !== organizationId ||
      request.locationId !== createLocationId ||
      request.classId !== classTemplateId ||
      request.candidateId !== selectedCandidateId ||
      busyCreate || previewMode
    ) return;

    // Only follow the focused control that this interaction replaced. A delayed
    // update must not take focus back from another field the user has reached.
    const active = document.activeElement;
    if (active !== request.trigger && (active !== document.body || request.trigger.isConnected)) return;
    (selectedCandidateId === null ? searchRef.current : changeRef.current)?.focus();
  }, [organizationId, createLocationId, classTemplateId, selectedCandidateId, busyCreate, previewMode]);

  function requestCandidateFocus(trigger: HTMLButtonElement, candidateId: string | null) {
    focusRequestRef.current = document.activeElement === trigger
      ? { organizationId, locationId: createLocationId, classId: classTemplateId, candidateId, trigger }
      : null;
  }

  return (
    <section
      id="new-enrollment-form"
      aria-labelledby="new-enrollment-heading"
      className="mt-6 border border-slate-300 bg-white p-5 sm:p-6"
    >
      <div>
        <h2
          id="new-enrollment-heading"
          className="text-xl font-bold tracking-tight"
        >
          Añadir a una clase
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-700">
          El registro queda pendiente y reserva una plaza hasta que lo actives o
          lo canceles.
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="mt-5 border border-dashed border-slate-400 bg-slate-50 p-4">
          <p className="text-sm leading-6 text-slate-800">
            Primero crea una clase recurrente para poder asignar plazas.
          </p>
          <Link
            href={"/owner/classes?organizationId=" + organizationId}
            className="mt-3 inline-flex min-h-11 items-center font-semibold text-teal-900 underline underline-offset-4"
          >
            Crear una clase
          </Link>
        </div>
      ) : (
        <form
          aria-label="Crear inscripción"
          aria-busy={busyCreate}
          className="mt-5 grid gap-4 md:grid-cols-2"
          onSubmit={onSubmit}
        >
          <div>
            <label
              htmlFor="enrollment-location"
              className="mb-1 block text-sm font-semibold"
            >
              Sede
            </label>
            <select
              id="enrollment-location"
              className={fieldClassName}
              value={createLocationId}
              onChange={(event) => onLocationChange(event.currentTarget.value)}
              disabled={busyCreate || previewMode}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="enrollment-class"
              className="mb-1 block text-sm font-semibold"
            >
              Clase
            </label>
            <select
              id="enrollment-class"
              className={fieldClassName}
              value={classTemplateId}
              onChange={(event) => onClassChange(event.currentTarget.value)}
              disabled={
                busyCreate || previewMode || classesForLocation.length === 0
              }
              required
            >
              <option value="">Selecciona una clase</option>
              {classesForLocation.map((classItem) => (
                <option
                  key={classItem.id}
                  value={classItem.id}
                  disabled={classItem.availableSeats < 1}
                >
                  {classItem.name}
                  {classItem.programName ? " · " + classItem.programName : ""}
                  {" · "}
                  {classItem.availableSeats > 0
                    ? classItem.availableSeats + " plazas libres"
                    : "Completa"}
                </option>
              ))}
            </select>
            {classesForLocation.length === 0 && (
              <p className="mt-1 text-sm text-slate-700">
                No hay clases activas en esta sede.
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            {selectedCandidate ? (
              <p id="enrollment-athlete-label" className="mb-1 block text-sm font-semibold">{participantLabel}</p>
            ) : (
              <label htmlFor="enrollment-athlete-search" className="mb-1 block text-sm font-semibold">{participantLabel}</label>
            )}
            {selectedCandidate ? (
              <div role="group" aria-labelledby="enrollment-athlete-label" className="flex min-h-11 items-center justify-between gap-3 border border-teal-700 bg-teal-50 px-3 py-2">
                <span className="font-semibold text-teal-950">
                  {selectedCandidate.name}
                </span>
                <button
                  ref={changeRef}
                  type="button"
                  className="touch-target min-h-11 px-2 text-sm font-semibold text-teal-900 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                  disabled={busyCreate || previewMode}
                  aria-label={`Cambiar ${participantLabel.toLowerCase()}: ${selectedCandidate.name}`}
                  onClick={(event) => {
                    requestCandidateFocus(event.currentTarget, null);
                    onCandidateClear();
                  }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  id="enrollment-athlete-search"
                  className={fieldClassName + " pl-10"}
                  type="search"
                  autoComplete="off"
                  minLength={2}
                  maxLength={80}
                  value={candidateQuery}
                  onChange={(event) =>
                    onCandidateQueryChange(event.currentTarget.value)
                  }
                  placeholder="Escribe al menos dos letras"
                  disabled={busyCreate || previewMode || !classTemplateId}
                  aria-busy={candidateLoading}
                  aria-describedby={candidateError ? "enrollment-search-help enrollment-search-error" : "enrollment-search-help"}
                />
              </div>
            )}
            <p
              id="enrollment-search-help"
              className="mt-1 text-xs leading-5 text-slate-600"
            >
              Solo aparecen personas vinculadas a esta sede.
            </p>
            {candidateLoading && (
              <p role="status" className="mt-2 text-sm text-slate-700">
                Buscando…
              </p>
            )}
            {candidateError && (
              <div className="mt-2">
                <p id="enrollment-search-error" role="alert" className="text-sm text-red-800">{candidateError}</p>
                <button type="button" className="min-h-11 text-sm font-semibold text-teal-900 underline" disabled={busyCreate || previewMode || candidateLoading || !classTemplateId || candidateQuery.trim().length < 2} onClick={onRetryCandidates}>Volver a buscar</button>
              </div>
            )}
            {candidateNotice && (
              <p role="status" className="mt-2 text-sm text-slate-700">
                {candidateNotice}{" "}
                <Link
                  href={
                    "/owner/groups?organizationId=" +
                    organizationId +
                    "&locationId=" +
                    createLocationId
                  }
                  className="font-semibold text-teal-900 underline underline-offset-4"
                >
                  Ir a Grupos
                </Link>
              </p>
            )}
            {candidates.length > 0 && !selectedCandidate && (
              <ul
                aria-label="Resultados de búsqueda"
                className="mt-2 divide-y divide-slate-200 border border-slate-300 bg-white"
              >
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={busyCreate || previewMode}
                      className="touch-target min-h-11 w-full px-3 py-2 text-left text-sm font-medium hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-teal-800"
                      onClick={(event) => {
                        requestCandidateFocus(event.currentTarget, candidate.id);
                        onCandidateSelect(candidate);
                      }}
                    >
                      {candidate.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label
              htmlFor="enrollment-starts-on"
              className="mb-1 block text-sm font-semibold"
            >
              Fecha de inicio
            </label>
            <input
              id="enrollment-starts-on"
              className={fieldClassName}
              type="date"
              value={startsOn}
              min={selectedClass?.effectiveFrom}
              max={selectedClass?.effectiveTo ?? undefined}
              aria-invalid={startsOnOutsideClassPeriod || undefined}
              aria-describedby={
                startsOnOutsideClassPeriod
                  ? "enrollment-starts-on-help enrollment-starts-on-error"
                  : "enrollment-starts-on-help"
              }
              onChange={(event) => onStartsOnChange(event.currentTarget.value)}
              disabled={busyCreate || previewMode}
              required
            />
            <p
              id="enrollment-starts-on-help"
              className="mt-1 text-xs leading-5 text-slate-600"
            >
              {selectedClass
                ? `Periodo de la clase: ${formatDate(selectedClass.effectiveFrom)}${selectedClass.effectiveTo ? `–${formatDate(selectedClass.effectiveTo)}` : " en adelante"}.`
                : "Elige una clase para consultar su periodo válido."}
            </p>
            {startsOnOutsideClassPeriod && (
              <p
                id="enrollment-starts-on-error"
                role="alert"
                className="mt-1 text-sm text-red-800"
              >
                La fecha debe estar dentro del periodo de la clase seleccionada.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="enrollment-price-plan"
              className="mb-1 block text-sm font-semibold"
            >
              Tarifa mensual
            </label>
            <select
              id="enrollment-price-plan"
              className={fieldClassName}
              value={pricePlanId}
              onChange={(event) => onPricePlanChange(event.currentTarget.value)}
              disabled={busyCreate || previewMode || pricePlansLoading}
              aria-busy={pricePlansLoading}
              aria-invalid={pricePlanUnavailable || undefined}
              aria-describedby={["enrollment-price-plan-help", pricePlansError && "enrollment-price-plan-error", pricePlanUnavailable && "enrollment-price-plan-unavailable"].filter(Boolean).join(" ")}
            >
              {pricePlanUnavailable && <option value={pricePlanId} disabled>Tarifa seleccionada no disponible</option>}
              <option value="">Sin tarifa asignada</option>
              {pricePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {formatMoney(plan.amountCents, plan.currency)}
                </option>
              ))}
            </select>
            <p
              id="enrollment-price-plan-help"
              className="mt-1 text-xs leading-5 text-slate-600"
            >
              El importe viene de la tarifa. Si queda sin asignar, no se podrá
              incluir en una factura hasta resolverlo.
            </p>
            {pricePlansLoading && (
              <p role="status" className="mt-1 text-sm text-slate-700">
                Cargando tarifas…
              </p>
            )}
            {pricePlansError && (
              <div className="mt-1">
                <p id="enrollment-price-plan-error" role="alert" className="text-sm text-red-800">{pricePlansError}</p>
                <button type="button" className="min-h-11 text-sm font-semibold text-teal-900 underline" disabled={busyCreate || previewMode || pricePlansLoading || !createLocationId} onClick={onRetryPricePlans}>Volver a consultar las tarifas</button>
              </div>
            )}
            {pricePlanUnavailable && (
              <p id="enrollment-price-plan-unavailable" role="alert" className="mt-1 text-sm text-red-800">
                La tarifa seleccionada ya no está disponible en esta sede. Elige otra o «Sin tarifa asignada» antes de registrar la inscripción.
              </p>
            )}
            {!pricePlansLoading &&
              !pricePlansError &&
              pricePlans.length === 0 &&
              !previewMode && (
                <p className="mt-1 text-sm text-slate-700">
                  No hay tarifas mensuales disponibles para esta sede.
                </p>
              )}
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className={primaryButtonClassName + " w-full"}
              aria-describedby={pricePlansLoading || pricePlansError ? "enrollment-pricing-required" : pricePlanUnavailable ? "enrollment-price-plan-unavailable" : undefined}
              disabled={
                writesBlocked ||
                previewMode ||
                busyCreate ||
                pricePlansLoading ||
                Boolean(pricePlansError) ||
                pricePlanUnavailable ||
                !selectedCandidate ||
                !selectedClass ||
                startsOnOutsideClassPeriod ||
                selectedClass.availableSeats < 1 ||
                !startsOn
              }
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {busyCreate
                ? "Guardando…"
                : previewMode
                  ? "Solo vista de ejemplo"
                  : "Registrar inscripción pendiente"}
            </button>
          </div>

          {pricePlansLoading || pricePlansError ? (
            <p id="enrollment-pricing-required" className="text-sm leading-6 text-slate-700 md:col-span-2">
              Para registrar la inscripción, primero debe completarse la consulta de tarifas. Después podrás elegir una tarifa o dejarla sin asignar.
            </p>
          ) : null}

          <p className="text-xs leading-5 text-slate-600 md:col-span-2">
            Fecha local de la sede: {createToday || "no disponible"}. La
            inscripción no activa cuotas ni cobros.
          </p>
        </form>
      )}
    </section>
  );
}
