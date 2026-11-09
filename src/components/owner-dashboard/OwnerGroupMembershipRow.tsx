"use client";

import type { ComponentProps } from "react";
import { Check } from "lucide-react";
import { OwnerAthleteProfileEditor } from "./OwnerAthleteProfileEditor";
import { OwnerAthleteFamilyAssociationEditor } from "./OwnerAthleteFamilyAssociationEditor";
import { OwnerAthleteArchiveEditor } from "./OwnerAthleteArchiveEditor";
import {
  secondaryButtonClassName,
  statusLabel,
  type GroupsBundle,
} from "./owner-groups-manager-model";

type ProfileEditorProps = ComponentProps<typeof OwnerAthleteProfileEditor>;
type FamilyEditorProps = ComponentProps<typeof OwnerAthleteFamilyAssociationEditor>;
type ArchiveEditorProps = ComponentProps<typeof OwnerAthleteArchiveEditor>;

/**
 * One row of "Pertenencias actuales". The manager computes every lock and
 * editor key; this component only lays out the athlete's actions.
 */
export function OwnerGroupMembershipRow({
  membership,
  organizationId,
  locationId,
  groupId,
  effectiveFrom,
  allowExistingFamilies,
  commandsLocked,
  writesBlocked,
  profileEditorKey,
  profileEditorDisabled,
  pendingAthleteProfile,
  onProfileActiveChange,
  onProfilePendingCommandChange,
  familyAssociationKey,
  familyAssociationEditorDisabled,
  pendingAthleteFamilyAssociation,
  onFamilyActiveChange,
  onFamilyPendingCommandChange,
  onSaved,
  showArchiveEditor,
  archiveEditorKey,
  archiveEditorDisabled,
  pendingAthleteArchive,
  onArchiveActiveChange,
  onArchivePendingCommandChange,
  onArchived,
  onChangeMembership,
}: {
  membership: GroupsBundle["memberships"][number];
  organizationId: string;
  locationId: string;
  groupId: string;
  effectiveFrom: string;
  allowExistingFamilies: boolean;
  commandsLocked: boolean;
  writesBlocked: boolean;
  profileEditorKey: string;
  profileEditorDisabled: boolean;
  pendingAthleteProfile: ProfileEditorProps["pendingCommand"];
  onProfileActiveChange: ProfileEditorProps["onActiveChange"];
  onProfilePendingCommandChange: ProfileEditorProps["onPendingCommandChange"];
  familyAssociationKey: string;
  familyAssociationEditorDisabled: boolean;
  pendingAthleteFamilyAssociation: FamilyEditorProps["pendingCommand"];
  onFamilyActiveChange: FamilyEditorProps["onActiveChange"];
  onFamilyPendingCommandChange: FamilyEditorProps["onPendingCommandChange"];
  onSaved: () => void;
  showArchiveEditor: boolean;
  archiveEditorKey: string;
  archiveEditorDisabled: boolean;
  pendingAthleteArchive: ArchiveEditorProps["pendingCommand"];
  onArchiveActiveChange: ArchiveEditorProps["onActiveChange"];
  onArchivePendingCommandChange: ArchiveEditorProps["onPendingCommandChange"];
  onArchived: ArchiveEditorProps["onArchived"];
  onChangeMembership: (toStatus: "active" | "paused" | "ended") => void;
}) {
  return (
    <li
      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-semibold">
          {membership.athleteName}
        </p>
        <p className="mt-1 text-xs text-z-soft">
          {statusLabel(membership.status)} desde{" "}
          {membership.startsOn}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <OwnerAthleteProfileEditor
          key={profileEditorKey}
          organizationId={organizationId}
          locationId={locationId}
          groupId={groupId}
          athleteId={membership.athleteId}
          athleteName={membership.athleteName}
          disabled={profileEditorDisabled}
          readOnly={writesBlocked}
          pendingCommand={pendingAthleteProfile}
          onActiveChange={onProfileActiveChange}
          onPendingCommandChange={onProfilePendingCommandChange}
          onSaved={onSaved}
        />
        <OwnerAthleteFamilyAssociationEditor
          key={`family:${familyAssociationKey}`}
          organizationId={organizationId}
          locationId={locationId}
          groupId={groupId}
          athleteId={membership.athleteId}
          athleteName={membership.athleteName}
          effectiveFrom={effectiveFrom}
          allowExistingFamilies={allowExistingFamilies}
          disabled={familyAssociationEditorDisabled}
          readOnly={writesBlocked}
          pendingCommand={pendingAthleteFamilyAssociation}
          onActiveChange={onFamilyActiveChange}
          onPendingCommandChange={onFamilyPendingCommandChange}
          onSaved={onSaved}
        />
        {showArchiveEditor && (
          <OwnerAthleteArchiveEditor
            key={archiveEditorKey}
            organizationId={organizationId}
            locationId={locationId}
            groupId={groupId}
            athleteId={membership.athleteId}
            athleteName={membership.athleteName}
            disabled={archiveEditorDisabled}
            pendingCommand={pendingAthleteArchive}
            onActiveChange={onArchiveActiveChange}
            onPendingCommandChange={onArchivePendingCommandChange}
            onArchived={onArchived}
          />
        )}
        {membership.status === "pending" && (
          <button
            type="button"
            className={secondaryButtonClassName}
            aria-label={`Activar a ${membership.athleteName}`}
            disabled={commandsLocked || writesBlocked}
            onClick={() =>
              onChangeMembership("active")
            }
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Activar
          </button>
        )}
        {membership.status === "active" && (
          <button
            type="button"
            className={secondaryButtonClassName}
            aria-label={`Poner en pausa a ${membership.athleteName}`}
            disabled={commandsLocked || writesBlocked}
            onClick={() =>
              onChangeMembership("paused")
            }
          >
            Poner en pausa
          </button>
        )}
        {membership.status === "paused" && (
          <button
            type="button"
            className={secondaryButtonClassName}
            aria-label={`Reactivar a ${membership.athleteName}`}
            disabled={commandsLocked || writesBlocked}
            onClick={() =>
              onChangeMembership("active")
            }
          >
            Reactivar
          </button>
        )}
        <button
          type="button"
          className="rounded-[12px] touch-target inline-flex min-h-11 items-center justify-center border border-red-700 bg-white px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-800 disabled:opacity-50"
          aria-label={`Dar de baja a ${membership.athleteName}`}
          disabled={commandsLocked || writesBlocked}
          onClick={() =>
            onChangeMembership("ended")
          }
        >
          Dar de baja
        </button>
      </div>
    </li>
  );
}
