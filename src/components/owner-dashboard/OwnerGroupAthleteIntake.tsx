"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import {
  fieldClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  statusLabel,
  type Candidate,
  type CreateAthleteRecoveryState,
} from "./owner-groups-manager-model";
import { ownerTone } from "./owner-tone-ui";

/** "Añadir una gimnasta": search active athletes of the academy and add one to the group. */
export function OwnerGroupAthleteSearchForm({
  candidateQuery,
  candidates,
  commandsLocked,
  writesBlocked,
  onSubmit,
  onCandidateQueryChange,
  onAddAthlete,
}: {
  candidateQuery: string;
  candidates: Candidate[];
  commandsLocked: boolean;
  writesBlocked: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCandidateQueryChange: (value: string) => void;
  onAddAthlete: (athleteId: string) => void;
}) {
  return (
    <form className="mt-5" onSubmit={onSubmit}>
      <label
        htmlFor="athlete-search"
        className="block text-sm font-bold"
      >
        Añadir una gimnasta
      </label>
      <p className="mt-1 text-xs text-z-soft">
        Busca por nombre. Solo se muestran fichas activas de
        esta academia.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="athlete-search"
          className={fieldClassName}
          value={candidateQuery}
          disabled={commandsLocked}
          onChange={(event) =>
            onCandidateQueryChange(event.target.value)
          }
          minLength={2}
          maxLength={80}
          autoComplete="off"
          placeholder="Nombre o apellido"
        />
        <button
          type="submit"
          className={secondaryButtonClassName}
          disabled={commandsLocked}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Buscar
        </button>
      </div>
      {candidates.length > 0 && (
        <ul className="mt-3 divide-y divide-z-line border-y border-z-line border-t-[3px] border-t-z-ink">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="flex min-h-14 items-center justify-between gap-3 py-2"
            >
              <span className="text-sm font-semibold">
                {candidate.name}
              </span>
              <button
                type="button"
                className={secondaryButtonClassName}
                disabled={commandsLocked || writesBlocked}
                onClick={() => onAddAthlete(candidate.id)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Añadir
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** "¿No aparece? Crear ficha y añadir", including the recovery state of a previous attempt. */
export function OwnerGroupAthleteCreateDetails({
  recovery,
  newAthleteGivenName,
  newAthleteFamilyName,
  commandsLocked,
  createAthleteBlocked,
  writesBlocked,
  busy,
  onSubmit,
  onGivenNameChange,
  onFamilyNameChange,
  onConfirmRecoveredReceipt,
  onRetryRecoveryCheck,
  onRefresh,
}: {
  recovery: CreateAthleteRecoveryState | null;
  newAthleteGivenName: string;
  newAthleteFamilyName: string;
  commandsLocked: boolean;
  createAthleteBlocked: boolean;
  writesBlocked: boolean;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGivenNameChange: (value: string) => void;
  onFamilyNameChange: (value: string) => void;
  onConfirmRecoveredReceipt: () => void;
  onRetryRecoveryCheck: () => void;
  onRefresh: () => void;
}) {
  return (
    <details className="mt-4 border-t border-z-line pt-4">
      <summary className="touch-target inline-flex min-h-11 cursor-pointer items-center font-semibold text-z-brand-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-z-brand-500">
        ¿No aparece? Crear ficha y añadir
      </summary>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-z-soft">
        Busca primero para evitar duplicados. Solo pedimos
        nombre y apellidos; no crea una cuenta familiar ni un
        cobro.
      </p>
      {recovery?.status === "checking" && (
        <p role="status" className={`mt-3 ${ownerTone.noticeWarning}`}>
          Comprobando el recibo del alta pendiente. No se enviará otra operación mientras se valida.
        </p>
      )}
      {recovery?.status === "needs-input" && (
        <p role="status" className={`mt-3 ${ownerTone.noticeWarning}`}>
          No aparece ningún recibo para la clave pendiente. Reintroduce exactamente el mismo nombre y apellidos para reintentar; se conservará la misma clave y no se creará otra.
        </p>
      )}
      {recovery?.status === "complete" && recovery.receipt && (
        <div role="status" className={`mt-3 ${ownerTone.noticeInfo}`}>
          <p>El recibo confirma el alta y la pertenencia al grupo. Estado actual: {statusLabel(recovery.receipt.status)}.</p>
          <button type="button" disabled={commandsLocked} className={`${secondaryButtonClassName} mt-3`} onClick={onConfirmRecoveredReceipt}>
            Confirmar resultado y limpiar clave pendiente
          </button>
        </div>
      )}
      {recovery?.status === "blocked" && (
        <div role="alert" className={`mt-3 ${ownerTone.noticeWarning}`}>
          <p>{recovery.detail ?? "No se pudo validar el alta anterior. No se enviará otra operación."}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" disabled={commandsLocked} className={secondaryButtonClassName} onClick={onRetryRecoveryCheck}>Reintentar comprobación</button>
            <button type="button" disabled={commandsLocked} className={secondaryButtonClassName} onClick={onRefresh}>Actualizar pertenencias</button>
            <Link href="/contact?type=support" aria-disabled={commandsLocked} tabIndex={commandsLocked ? -1 : undefined}
              onClick={(event) => { if (commandsLocked) event.preventDefault(); }}
              className="touch-target inline-flex min-h-11 items-center font-semibold text-z-brand-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-z-brand-500">Contactar soporte</Link>
          </div>
        </div>
      )}
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={onSubmit}
      >
        <label className="block text-sm font-semibold">
          Nombre
          <input
            className={`${fieldClassName} mt-2`}
            value={newAthleteGivenName}
            disabled={commandsLocked || createAthleteBlocked || writesBlocked}
            onChange={(changeEvent) => {
              onGivenNameChange(changeEvent.target.value);
            }}
            maxLength={100}
            autoComplete="given-name"
            required
          />
        </label>
        <label className="block text-sm font-semibold">
          Apellidos
          <input
            className={`${fieldClassName} mt-2`}
            value={newAthleteFamilyName}
            disabled={commandsLocked || createAthleteBlocked || writesBlocked}
            onChange={(changeEvent) => {
              onFamilyNameChange(changeEvent.target.value);
            }}
            maxLength={100}
            autoComplete="family-name"
            required
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className={primaryButtonClassName}
            disabled={commandsLocked || createAthleteBlocked || writesBlocked}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {busy ? "Guardando…" : "Crear y añadir al grupo"}
          </button>
        </div>
      </form>
    </details>
  );
}
