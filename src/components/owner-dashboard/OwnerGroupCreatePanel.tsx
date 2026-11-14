"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import {
  GROUP_CREATE_FIELD_ERROR_IDS,
  fieldClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  type GroupCreateField,
  type GroupCreateFieldErrors,
  type GroupCreatePayload,
  type GroupsBundle,
  type PendingGroupCreate,
  type PendingGroupCreateState,
} from "./owner-groups-manager-model";
import { ownerTone, ownerUi } from "./owner-ui";

/** Group create command awaiting its result, or a stored draft that cannot be replayed safely. */
export function OwnerGroupCreatePendingNotice({
  currentPendingGroupCreate,
  replayableGroupCreate,
  replayableGroupPayload,
  busy,
  retryDisabled,
  onRetry,
  onReadAgain,
  onRefresh,
}: {
  currentPendingGroupCreate: PendingGroupCreateState;
  replayableGroupCreate: PendingGroupCreate | null;
  replayableGroupPayload: GroupCreatePayload | null;
  busy: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
  onReadAgain: () => void;
  onRefresh: () => void;
}) {
  return (
    <section
      aria-labelledby="pending-group-create-title"
      className={`mt-5 ${ownerTone.noticeWarning}`}
      role="status"
    >
      <h2 id="pending-group-create-title" className="font-bold">
        {currentPendingGroupCreate.kind === "unavailable"
          ? "Borrador de grupo no disponible"
          : "Creación de grupo pendiente de confirmar"}
      </h2>
      {replayableGroupCreate && replayableGroupPayload ? (
        <>
          <p className="mt-2 leading-6">
            Volveremos a comprobar la solicitud original para «
            {replayableGroupPayload.name}» y evitar duplicados. El
            formulario queda protegido hasta conocer el resultado.
          </p>
          <button
            type="button"
            className={`${primaryButtonClassName} mt-3`}
            disabled={retryDisabled}
            onClick={onRetry}
          >
            {busy
              ? "Comprobando resultado…"
              : "Reintentar creación pendiente"}
          </button>
        </>
      ) : currentPendingGroupCreate.kind === "unavailable" ? (
        <p className="mt-2 leading-6">
          No se pudo consultar el almacenamiento de esta sesión. No
          iniciaremos una creación ni escribiremos sobre el borrador hasta
          poder comprobarlo. Restaura el acceso al almacenamiento de
          sesión y vuelve a comprobar el borrador; si no puedes, contacta
          con soporte.
        </p>
      ) : (
        <p className="mt-2 leading-6">
          Hay una solicitud anterior que no se puede reenviar de forma
          segura. No la borraremos ni enviaremos otra creación desde aquí.
          Actualiza la lista de grupos para comprobar su estado. Si no
          aparece o tienes dudas, contacta con soporte.
        </p>
      )}
      {(!replayableGroupCreate || !replayableGroupPayload) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {currentPendingGroupCreate.kind === "unavailable" ? (
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onReadAgain}
            >
              Volver a comprobar borrador
            </button>
          ) : (
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onRefresh}
            >
              Actualizar lista de grupos
            </button>
          )}
          <Link
            href="/contact?type=support"
            className="touch-target inline-flex min-h-11 items-center font-semibold text-z-brand-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-z-brand-500"
          >
            Contactar soporte
          </Link>
        </div>
      )}
    </section>
  );
}

/** "Crear un grupo" form. Validation and submission stay in OwnerGroupsManager. */
export function OwnerGroupCreateForm({
  programs,
  locations,
  groupName,
  programId,
  locationId,
  capacity,
  fieldErrors,
  locked,
  busy,
  onSubmit,
  onInvalidCapture,
  onGroupNameChange,
  onProgramIdChange,
  onLocationIdChange,
  onCapacityChange,
  onFieldEdited,
}: {
  programs: GroupsBundle["programs"];
  locations: GroupsBundle["locations"];
  groupName: string;
  programId: string;
  locationId: string;
  capacity: string;
  fieldErrors: GroupCreateFieldErrors;
  locked: boolean;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInvalidCapture: (event: FormEvent<HTMLFormElement>) => void;
  onGroupNameChange: (value: string) => void;
  onProgramIdChange: (value: string) => void;
  onLocationIdChange: (value: string) => void;
  onCapacityChange: (value: string) => void;
  onFieldEdited: (field: GroupCreateField) => void;
}) {
  return (
    <section
      aria-labelledby="create-group-title"
      className={`mt-6 ${ownerUi.card}`}
    >
      <h2 id="create-group-title" className={ownerUi.sectionTitle}>
        Crear un grupo
      </h2>
      {programs.length === 0 || locations.length === 0 ? (
        <p className={`mt-3 ${ownerUi.muted}`}>
          Para crear un grupo hace falta al menos una actividad y una sede
          activa en la academia.
        </p>
      ) : (
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={onSubmit}
          onInvalidCapture={onInvalidCapture}
        >
          <label className="block text-sm font-semibold">
            Nombre del grupo
            <input
              id="group-create-name"
              className={`${fieldClassName} mt-2`}
              value={groupName}
              disabled={locked}
              onChange={(event) => {
                onGroupNameChange(event.target.value);
                onFieldEdited("name");
              }}
              maxLength={120}
              required
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={
                fieldErrors.name
                  ? GROUP_CREATE_FIELD_ERROR_IDS.name
                  : undefined
              }
            />
          </label>
          {fieldErrors.name && (
            <span id={GROUP_CREATE_FIELD_ERROR_IDS.name} className="sr-only">
              {fieldErrors.name}
            </span>
          )}
          <label className="block text-sm font-semibold">
            Actividad
            <select
              id="group-create-program"
              className={`${fieldClassName} mt-2`}
              value={programId}
              disabled={locked}
              onChange={(event) => {
                onProgramIdChange(event.target.value);
                onFieldEdited("programId");
              }}
              required
              aria-invalid={fieldErrors.programId ? true : undefined}
              aria-describedby={
                fieldErrors.programId
                  ? GROUP_CREATE_FIELD_ERROR_IDS.programId
                  : undefined
              }
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </label>
          {fieldErrors.programId && (
            <span id={GROUP_CREATE_FIELD_ERROR_IDS.programId} className="sr-only">
              {fieldErrors.programId}
            </span>
          )}
          <label className="block text-sm font-semibold">
            Sede
            <select
              id="group-create-location"
              className={`${fieldClassName} mt-2`}
              value={locationId}
              disabled={locked}
              onChange={(event) => {
                onLocationIdChange(event.target.value);
                onFieldEdited("locationId");
              }}
              required
              aria-invalid={fieldErrors.locationId ? true : undefined}
              aria-describedby={
                fieldErrors.locationId
                  ? GROUP_CREATE_FIELD_ERROR_IDS.locationId
                  : undefined
              }
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          {fieldErrors.locationId && (
            <span id={GROUP_CREATE_FIELD_ERROR_IDS.locationId} className="sr-only">
              {fieldErrors.locationId}
            </span>
          )}
          <label className="block text-sm font-semibold">
            Plazas (opcional)
            <input
              id="group-create-capacity"
              className={`${fieldClassName} mt-2`}
              disabled={locked}
              type="number"
              min="1"
              max="5000"
              step="1"
              inputMode="numeric"
              value={capacity}
              onChange={(event) => {
                onCapacityChange(event.target.value);
                onFieldEdited("capacity");
              }}
              aria-invalid={fieldErrors.capacity ? true : undefined}
              aria-describedby={
                fieldErrors.capacity
                  ? GROUP_CREATE_FIELD_ERROR_IDS.capacity
                  : undefined
              }
            />
          </label>
          {fieldErrors.capacity && (
            <span id={GROUP_CREATE_FIELD_ERROR_IDS.capacity} className="sr-only">
              {fieldErrors.capacity}
            </span>
          )}
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className={primaryButtonClassName}
              disabled={locked}
            >
              {busy ? "Guardando…" : "Guardar grupo"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
