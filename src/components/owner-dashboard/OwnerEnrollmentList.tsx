"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef } from "react";

import {
  fieldClassName,
  formatDate,
  primaryButtonClassName,
  secondaryButtonClassName,
  statusHref,
  statusLabel,
  statusTone,
} from "./owner-enrollment-ui";
import type {
  ChangeableStatus,
  EnrollmentBundle,
  StatusFilter,
} from "./owner-enrollment-types";

type Enrollment = EnrollmentBundle["enrollments"][number];

const useCommittedLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type Props = {
  bundle: EnrollmentBundle;
  selectedStatus: StatusFilter;
  previewMode: boolean;
  navigationLocked?: boolean;
  writesBlocked?: boolean;
  createOpen: boolean;
  busyId: string;
  confirmingCancelId: string;
  confirmingCompleteId: string;
  error: string;
  notice: string;
  onApplyFilters: (status: StatusFilter, locationId: string) => void;
  onOpenCreate: () => void;
  onConfirmCancel: (enrollmentId: string) => void;
  onConfirmComplete: (enrollmentId: string) => void;
  onChangeStatus: (
    enrollment: Enrollment,
    status: ChangeableStatus
  ) => void;
};

export function OwnerEnrollmentList({
  bundle,
  selectedStatus,
  previewMode,
  navigationLocked = false,
  writesBlocked = false,
  createOpen,
  busyId,
  confirmingCancelId,
  confirmingCompleteId,
  error,
  notice,
  onApplyFilters,
  onOpenCreate,
  onConfirmCancel,
  onConfirmComplete,
  onChangeStatus,
}: Props) {
  const focusTargetsRef = useRef({
    cancelTrigger: new Map<string, HTMLButtonElement>(),
    cancelConfirm: new Map<string, HTMLButtonElement>(),
    completeTrigger: new Map<string, HTMLButtonElement>(),
    completeConfirm: new Map<string, HTMLButtonElement>(),
  });
  const lastConfirmationRef = useRef<
    { kind: "cancel" | "complete"; enrollmentId: string } | null
  >(null);

  useCommittedLayoutEffect(() => {
    const currentConfirmation = confirmingCancelId
      ? { kind: "cancel" as const, enrollmentId: confirmingCancelId }
      : confirmingCompleteId
        ? { kind: "complete" as const, enrollmentId: confirmingCompleteId }
        : null;
    if (currentConfirmation) {
      const button = currentConfirmation.kind === "cancel"
        ? focusTargetsRef.current.cancelConfirm.get(currentConfirmation.enrollmentId)
        : focusTargetsRef.current.completeConfirm.get(currentConfirmation.enrollmentId);
      button?.focus({ preventScroll: true });
    } else if (lastConfirmationRef.current) {
      const previous = lastConfirmationRef.current;
      const button = previous.kind === "cancel"
        ? focusTargetsRef.current.cancelTrigger.get(previous.enrollmentId)
        : focusTargetsRef.current.completeTrigger.get(previous.enrollmentId);
      button?.focus({ preventScroll: true });
    }
    lastConfirmationRef.current = currentConfirmation;
  }, [confirmingCancelId, confirmingCompleteId]);

  return (
    <section aria-labelledby="enrollment-list-heading" className="mt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="enrollment-list-heading"
            className="text-xl font-bold tracking-tight"
          >
            Inscripciones de la academia
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            {bundle.total} resultado{bundle.total === 1 ? "" : "s"}
            {bundle.pages > 1
              ? " · página " + bundle.page + " de " + bundle.pages
              : ""}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {bundle.locations.length > 1 && (
            <div>
              <label htmlFor="enrollment-filter-location" className="sr-only">
                Filtrar por sede
              </label>
              <select
                id="enrollment-filter-location"
                className={fieldClassName}
                value={bundle.filterLocationId ?? "all"}
                disabled={previewMode}
                onChange={(event) =>
                  onApplyFilters(
                    selectedStatus,
                    event.currentTarget.value
                  )
                }
              >
                <option value="all">Todas mis sedes</option>
                {bundle.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="enrollment-filter-status" className="sr-only">
              Filtrar por estado
            </label>
            <select
              id="enrollment-filter-status"
              className={fieldClassName}
              value={selectedStatus}
              disabled={previewMode}
              onChange={(event) =>
                onApplyFilters(
                  event.currentTarget.value as StatusFilter,
                  bundle.filterLocationId ?? "all"
                )
              }
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="active">Activas</option>
              <option value="paused">En pausa</option>
              <option value="trial">Pruebas</option>
              <option value="cancelled">Bajas</option>
              <option value="completed">Finalizadas</option>
            </select>
          </div>
        </div>
      </div>

      {(error || notice) && (
        <div
          className={
            "mt-4 border px-4 py-3 text-sm leading-6 " +
            (error
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-950")
          }
        >
          <p role={error ? "alert" : "status"}>{error || notice}</p>
        </div>
      )}

      {bundle.enrollments.length === 0 ? (
        <div className="mt-4 border border-dashed border-slate-400 bg-white px-5 py-8 text-center">
          <h3 className="font-semibold">No hay inscripciones en este filtro</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            No hay resultados con los filtros actuales. Puedes cambiar los filtros
            sin modificar ninguna inscripción.
          </p>
          {selectedStatus !== "all" && (
            <button
              type="button"
              className={secondaryButtonClassName + " mt-4"}
              disabled={previewMode}
              onClick={() => onApplyFilters("all", bundle.filterLocationId ?? "all")}
            >
              Ver todos los estados
            </button>
          )}
          {bundle.filterLocationId && bundle.locations.length > 1 && (
            <button
              type="button"
              className={secondaryButtonClassName + " mt-4"}
              disabled={previewMode}
              onClick={() => onApplyFilters(selectedStatus, "all")}
            >
              Ver todas mis sedes
            </button>
          )}
          {!createOpen && (
            <button
              type="button"
              className={secondaryButtonClassName + " mt-4"}
              disabled={previewMode}
              onClick={onOpenCreate}
            >
              Nueva inscripción
            </button>
          )}
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {bundle.enrollments.map((enrollment) => {
            const localToday =
              bundle.localTodayByLocation[enrollment.locationId];
            const canActivate =
              (enrollment.status === "pending" &&
                !!localToday &&
                enrollment.startsOn <= localToday) ||
              enrollment.status === "paused";
            const canPause = enrollment.status === "active";
            const canComplete =
              enrollment.status === "active" ||
              enrollment.status === "paused";
            const canCancel =
              enrollment.status === "pending" ||
              enrollment.status === "active" ||
              enrollment.status === "paused";
            const pendingStartsInFuture =
              enrollment.status === "pending" &&
              !!localToday &&
              enrollment.startsOn > localToday;
            const confirmingCancel = confirmingCancelId === enrollment.id;
            const confirmingComplete =
              confirmingCompleteId === enrollment.id;
            const actionContext = `${enrollment.athleteName} · ${enrollment.className} · ${enrollment.locationName}`;

            return (
              <li
                key={enrollment.id}
                className="border border-slate-300 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">
                        {enrollment.athleteName}
                      </h3>
                      <span
                        className={
                          "inline-flex min-h-7 items-center border px-2.5 text-xs font-bold " +
                          statusTone(enrollment.status)
                        }
                      >
                        {statusLabel(enrollment.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {enrollment.className}
                      {enrollment.programName
                        ? " · " + enrollment.programName
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {enrollment.locationName}
                      {" · Inicio "}
                      {formatDate(enrollment.startsOn)}
                      {enrollment.endsOn
                        ? " · Fin " + formatDate(enrollment.endsOn)
                        : ""}
                    </p>
                    {pendingStartsInFuture && (
                      <p className="mt-2 text-sm text-amber-900">
                        Empieza el {formatDate(enrollment.startsOn)}. Podrás
                        activarla ese día.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!previewMode && canActivate && (
                      <button
                        type="button"
                        className={secondaryButtonClassName}
                        disabled={busyId === enrollment.id || writesBlocked}
                        aria-label={`${enrollment.status === "paused" ? "Reanudar" : "Activar"} inscripción de ${actionContext}`}
                        onClick={() => onChangeStatus(enrollment, "active")}
                      >
                        {enrollment.status === "paused" ? "Reanudar" : "Activar"}
                      </button>
                    )}
                    {!previewMode && canPause && (
                      <button
                        type="button"
                        className={secondaryButtonClassName}
                        disabled={busyId === enrollment.id || writesBlocked}
                        aria-label={`Pausar inscripción de ${actionContext}`}
                        onClick={() => onChangeStatus(enrollment, "paused")}
                      >
                        Pausar
                      </button>
                    )}
                    {!previewMode && canComplete && !confirmingComplete && (
                      <button
                        type="button"
                        ref={(button) => {
                          if (button) focusTargetsRef.current.completeTrigger.set(enrollment.id, button);
                          else focusTargetsRef.current.completeTrigger.delete(enrollment.id);
                        }}
                        className={secondaryButtonClassName}
                        disabled={busyId === enrollment.id || writesBlocked}
                        aria-label={`Finalizar inscripción de ${actionContext}`}
                        onClick={() => onConfirmComplete(enrollment.id)}
                      >
                        Finalizar
                      </button>
                    )}
                    {!previewMode && canCancel && !confirmingCancel && (
                      <button
                        type="button"
                        ref={(button) => {
                          if (button) focusTargetsRef.current.cancelTrigger.set(enrollment.id, button);
                          else focusTargetsRef.current.cancelTrigger.delete(enrollment.id);
                        }}
                        className="touch-target inline-flex min-h-11 items-center border border-slate-400 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
                        disabled={busyId === enrollment.id || writesBlocked}
                        aria-label={`Dar de baja inscripción de ${actionContext}`}
                        onClick={() => onConfirmCancel(enrollment.id)}
                      >
                        Dar de baja
                      </button>
                    )}
                    {!previewMode && confirmingCancel && (
                      <div
                        role="group"
                        aria-label={`Confirmar baja de ${actionContext}`}
                        className="flex flex-wrap items-center gap-2 border border-red-300 bg-red-50 p-2"
                      >
                        <span className="px-1 text-sm font-medium text-red-950">
                          ¿Dar de baja la inscripción de {actionContext}?
                        </span>
                        <button
                          type="button"
                          ref={(button) => {
                            if (button) focusTargetsRef.current.cancelConfirm.set(enrollment.id, button);
                            else focusTargetsRef.current.cancelConfirm.delete(enrollment.id);
                          }}
                          className="touch-target min-h-11 bg-red-800 px-3 text-sm font-bold text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
                          disabled={busyId === enrollment.id || writesBlocked}
                          aria-label={`Confirmar baja de ${actionContext}`}
                          onClick={() => onChangeStatus(enrollment, "cancelled")}
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          className="touch-target min-h-11 px-3 text-sm font-semibold text-red-950 underline underline-offset-4"
                          disabled={busyId === enrollment.id}
                          aria-label={`Volver sin dar de baja a ${actionContext}`}
                          onClick={() => onConfirmCancel("")}
                        >
                          Volver
                        </button>
                      </div>
                    )}
                    {!previewMode && confirmingComplete && (
                      <div
                        role="group"
                        aria-label={`Confirmar finalización de ${actionContext}`}
                        className="flex flex-wrap items-center gap-2 border border-slate-400 bg-slate-50 p-2"
                      >
                        <span className="px-1 text-sm font-medium text-slate-950">
                          ¿Finalizar la inscripción de {actionContext}?
                        </span>
                        <button
                          type="button"
                          ref={(button) => {
                            if (button) focusTargetsRef.current.completeConfirm.set(enrollment.id, button);
                            else focusTargetsRef.current.completeConfirm.delete(enrollment.id);
                          }}
                          className={primaryButtonClassName}
                          disabled={busyId === enrollment.id || writesBlocked}
                          aria-label={`Confirmar finalización de ${actionContext}`}
                          onClick={() => onChangeStatus(enrollment, "completed")}
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          className="touch-target min-h-11 px-3 text-sm font-semibold text-slate-900 underline underline-offset-4"
                          disabled={busyId === enrollment.id}
                          aria-label={`Volver sin finalizar la inscripción de ${actionContext}`}
                          onClick={() => onConfirmComplete("")}
                        >
                          Volver
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {previewMode && (
                  <p className="mt-3 text-xs leading-5 text-slate-600">
                    Acciones desactivadas en la vista de ejemplo.
                  </p>
                )}
                {enrollment.status === "trial" && (
                  <p className="mt-3 text-xs leading-5 text-slate-600">
                    Las pruebas se completan desde su flujo específico; esta
                    pantalla no modifica el seguimiento de la prueba.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {bundle.pages > 1 && (
        <nav
          aria-label="Páginas de inscripciones"
          className="mt-5 flex items-center justify-between"
        >
          {!previewMode && !navigationLocked && bundle.page > 1 ? (
            <Link
              href={statusHref(bundle, selectedStatus, bundle.page - 1)}
              className={secondaryButtonClassName}
              rel="prev"
              aria-label={`Anterior: página ${bundle.page - 1} de inscripciones`}
            >
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-700">
            Página {bundle.page} de {bundle.pages}
          </span>
          {!previewMode && !navigationLocked && bundle.page < bundle.pages ? (
            <Link
              href={statusHref(bundle, selectedStatus, bundle.page + 1)}
              className={secondaryButtonClassName}
              rel="next"
              aria-label={`Siguiente: página ${bundle.page + 1} de inscripciones`}
            >
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
