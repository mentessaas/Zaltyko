"use client";

import Link from "next/link";
import { Check, Search } from "lucide-react";
import type { FormEventHandler } from "react";

import { fieldClassName, primaryButtonClassName } from "./owner-enrollment-ui";
import type { Candidate, EnrollmentBundle } from "./owner-enrollment-types";

type PricePlanOption = {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  cadence: string;
};

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
  pricePlanId: string;
  createToday: string;
  busyCreate: boolean;
  previewMode: boolean;
  onLocationChange: (locationId: string) => void;
  onClassChange: (classTemplateId: string) => void;
  onCandidateQueryChange: (query: string) => void;
  onCandidateSelect: (candidate: Candidate) => void;
  onCandidateClear: () => void;
  onStartsOnChange: (date: string) => void;
  onPricePlanChange: (pricePlanId: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
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
  pricePlanId,
  createToday,
  busyCreate,
  previewMode,
  onLocationChange,
  onClassChange,
  onCandidateQueryChange,
  onCandidateSelect,
  onCandidateClear,
  onStartsOnChange,
  onPricePlanChange,
  onSubmit,
}: Props) {
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
            <label
              htmlFor="enrollment-athlete-search"
              className="mb-1 block text-sm font-semibold"
            >
              {participantLabel}
            </label>
            {selectedCandidate ? (
              <div className="flex min-h-11 items-center justify-between gap-3 border border-teal-700 bg-teal-50 px-3 py-2">
                <span className="font-semibold text-teal-950">
                  {selectedCandidate.name}
                </span>
                <button
                  type="button"
                  className="touch-target min-h-11 px-2 text-sm font-semibold text-teal-900 underline underline-offset-4"
                  disabled={previewMode}
                  onClick={onCandidateClear}
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
                  disabled={busyCreate || !classTemplateId}
                  aria-describedby="enrollment-search-help"
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
              <p role="alert" className="mt-2 text-sm text-red-800">
                {candidateError}
              </p>
            )}
            {candidateNotice && (
              <p className="mt-2 text-sm text-slate-700">
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
                      className="touch-target min-h-11 w-full px-3 py-2 text-left text-sm font-medium hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-teal-800"
                      onClick={() => onCandidateSelect(candidate)}
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
              onChange={(event) => onStartsOnChange(event.currentTarget.value)}
              disabled={busyCreate || previewMode}
              required
            />
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
              aria-describedby="enrollment-price-plan-help"
            >
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
              <p role="alert" className="mt-1 text-sm text-red-800">
                {pricePlansError}
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
              disabled={
                previewMode ||
                busyCreate ||
                !selectedCandidate ||
                !selectedClass ||
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

          <p className="text-xs leading-5 text-slate-600 md:col-span-2">
            Fecha local de la sede: {createToday || "no disponible"}. La
            inscripción no activa cuotas ni cobros.
          </p>
        </form>
      )}
    </section>
  );
}
