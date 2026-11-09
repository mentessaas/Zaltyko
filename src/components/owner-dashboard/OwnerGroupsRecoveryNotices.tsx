"use client";

import Link from "next/link";
import type { ComponentProps, RefObject } from "react";
import { OwnerAthleteArchiveEditor, type PendingOwnerAthleteArchive } from "./OwnerAthleteArchiveEditor";
import type { PendingOwnerAthleteFamilyAssociation } from "./OwnerAthleteFamilyAssociationEditor";
import type { PendingOwnerAthleteProfileUpdate } from "./OwnerAthleteProfileEditor";
import {
  primaryButtonClassName,
  secondaryButtonClassName,
  type PendingMembershipCommand,
} from "./owner-groups-manager-model";

type ArchiveEditorProps = ComponentProps<typeof OwnerAthleteArchiveEditor>;

function pendingArchiveHref(command: PendingOwnerAthleteArchive) {
  const params = new URLSearchParams({ organizationId: command.organizationId });
  params.set("locationId", command.locationId);
  params.set("groupId", command.groupId);
  return `/owner/groups?${params.toString()}`;
}

/** Blocking recovery problem with a manual "check again" action. */
export function OwnerGroupsRecoveryAlert({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <section role="alert" className="rounded-[12px] mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-z-ink">
      <p>{message}</p>
      <button type="button" className={`${secondaryButtonClassName} mt-3`} onClick={onRetry}>
        {retryLabel}
      </button>
    </section>
  );
}

export function OwnerGroupsPendingArchiveNotice({
  pendingAthleteArchive,
  isForeign,
}: {
  pendingAthleteArchive: PendingOwnerAthleteArchive;
  isForeign: boolean;
}) {
  return (
    <section role="status" aria-labelledby="pending-athlete-archive-title" className="rounded-[12px] mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-z-ink">
      <h2 id="pending-athlete-archive-title" className="font-bold">Archivo de ficha pendiente de confirmar</h2>
      <p className="mt-2 leading-6">Conservamos la solicitud original y su clave. No iniciaremos otras escrituras hasta confirmar el resultado. El reintento solo se hará al pulsar el botón de la ficha original.</p>
      {isForeign && (
        <Link className="mt-2 inline-flex min-h-11 items-center font-semibold underline" href={pendingArchiveHref(pendingAthleteArchive)}>
          Volver al grupo original para resolver el archivo
        </Link>
      )}
    </section>
  );
}

/** Lets the original archive command be checked when its athlete left the current memberships. */
export function OwnerGroupsDetachedArchiveResolver({
  pendingAthleteArchive,
  disabled,
  onActiveChange,
  onPendingCommandChange,
  onArchived,
}: {
  pendingAthleteArchive: PendingOwnerAthleteArchive;
  disabled: boolean;
  onActiveChange: ArchiveEditorProps["onActiveChange"];
  onPendingCommandChange: ArchiveEditorProps["onPendingCommandChange"];
  onArchived: ArchiveEditorProps["onArchived"];
}) {
  return (
    <section role="region" aria-label="Resolver archivo de ficha pendiente" className="rounded-[12px] mt-5 border border-amber-700 bg-amber-50 p-4">
      <p className="mb-3 text-sm leading-6 text-z-ink">La ficha ya no aparece en las pertenencias actuales. Puedes comprobar la operación original con su misma clave, sin crear otro archivo.</p>
      <OwnerAthleteArchiveEditor
        key={`archive-detached:${pendingAthleteArchive.idempotencyKey}`}
        organizationId={pendingAthleteArchive.organizationId}
        locationId={pendingAthleteArchive.locationId}
        groupId={pendingAthleteArchive.groupId}
        athleteId={pendingAthleteArchive.athleteId}
        athleteName="ficha seleccionada"
        disabled={disabled}
        pendingCommand={pendingAthleteArchive}
        onActiveChange={onActiveChange}
        onPendingCommandChange={onPendingCommandChange}
        onArchived={onArchived}
      />
    </section>
  );
}

export function OwnerGroupsPendingFamilyAssociationNotice({
  pendingAthleteFamilyAssociation,
  visibleHere,
}: {
  pendingAthleteFamilyAssociation: PendingOwnerAthleteFamilyAssociation;
  visibleHere: boolean;
}) {
  return (
    <section role="status" aria-labelledby="pending-family-association-title" className="rounded-[12px] mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-z-ink">
      <h2 id="pending-family-association-title" className="font-bold">Asociación familiar pendiente de confirmar</h2>
      <p className="mt-2 leading-6">Conservamos el cuerpo y la clave de la solicitud original. No iniciaremos otras escrituras hasta confirmar el resultado. Reintenta solo desde el botón de esta gimnasta; nunca enviaremos la operación automáticamente.</p>
      {!visibleHere && (
        <Link className="mt-2 inline-flex min-h-11 items-center font-semibold underline" href={`/owner/groups?organizationId=${encodeURIComponent(pendingAthleteFamilyAssociation.organizationId)}&locationId=${encodeURIComponent(pendingAthleteFamilyAssociation.locationId)}&groupId=${encodeURIComponent(pendingAthleteFamilyAssociation.groupId)}`}>
          Volver al grupo original para reintentar
        </Link>
      )}
    </section>
  );
}

export function OwnerGroupsForeignProfileNotice({
  pendingAthleteProfile,
}: {
  pendingAthleteProfile: PendingOwnerAthleteProfileUpdate;
}) {
  return (
    <p role="status" className="rounded-[12px] mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-z-ink">
      Hay una edición de ficha pendiente en otra academia, sede, grupo o gimnasta. No iniciaremos otras escrituras hasta comprobar la solicitud original. {" "}
      <Link className="font-bold underline" href={`/owner/groups?organizationId=${encodeURIComponent(pendingAthleteProfile.organizationId)}&locationId=${encodeURIComponent(pendingAthleteProfile.locationId)}&groupId=${encodeURIComponent(pendingAthleteProfile.groupId)}`}>
        Volver al grupo original
      </Link>
    </p>
  );
}

export function OwnerGroupsForeignMembershipNotice({
  foreignMembershipScope,
}: {
  foreignMembershipScope: { organizationId: string; groupId: string };
}) {
  return (
    <p role="status" className="rounded-[12px] mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-z-ink">
      Hay un cambio de pertenencia pendiente en otra academia o grupo. No iniciaremos otra escritura hasta resolverlo.{" "}
      <Link className="font-bold underline" href={`/owner/groups?organizationId=${encodeURIComponent(foreignMembershipScope.organizationId)}&groupId=${encodeURIComponent(foreignMembershipScope.groupId)}`}>
        Volver al grupo original
      </Link>
    </p>
  );
}

export function OwnerGroupsPendingMembershipNotice({
  pendingMembership,
  canRetryMembership,
  busy,
  retryMembershipRef,
  onRetry,
}: {
  pendingMembership: PendingMembershipCommand;
  canRetryMembership: boolean;
  busy: boolean;
  retryMembershipRef: RefObject<HTMLButtonElement>;
  onRetry: () => void;
}) {
  return (
    <section
      role="status"
      aria-labelledby="pending-membership-title"
      className="rounded-[12px] mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-z-ink"
    >
      <h2 id="pending-membership-title" className="font-bold">Operación pendiente de confirmar</h2>
      <p className="mt-2 leading-6">
        {pendingMembership.kind === "create"
          ? "Conservamos la solicitud original y su clave en esta pantalla para comprobar el resultado sin crear otra operación. No cierres ni recargues la página mientras esté pendiente."
          : "Conservamos los IDs, el estado, la fecha y la clave de la solicitud original en esta sesión. Si recargas, se restaurará sin reenviarse; pulsa reintentar para comprobar el resultado."}
        {!canRetryMembership && " Vuelve a la academia y al grupo originales para reintentar; no enviaremos nada desde otro contexto."}
      </p>
      {!canRetryMembership && (
        <Link className="mt-2 inline-flex min-h-11 items-center font-semibold underline" href={`/owner/groups?organizationId=${encodeURIComponent(pendingMembership.organizationId)}&groupId=${encodeURIComponent(pendingMembership.groupId)}`}>
          Volver al grupo original
        </Link>
      )}
      <button
        ref={retryMembershipRef}
        type="button"
        className={`${primaryButtonClassName} mt-3`}
        disabled={busy || !canRetryMembership}
        onClick={onRetry}
      >
        {busy ? "Comprobando resultado…" : "Reintentar operación pendiente"}
      </button>
    </section>
  );
}
