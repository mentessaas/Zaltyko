"use client";

import { useId, useState, type ComponentProps } from "react";
import { Check, Flag } from "lucide-react";
import { OwnerAthleteProfileEditor } from "./OwnerAthleteProfileEditor";
import { OwnerAthleteProgressPanel } from "./OwnerAthleteProgressPanel";
import { OwnerAthleteFamilyAssociationEditor } from "./OwnerAthleteFamilyAssociationEditor";
import { OwnerAthleteArchiveEditor } from "./OwnerAthleteArchiveEditor";
import {
  secondaryButtonClassName,
  statusLabel,
  type GroupsBundle,
} from "./owner-groups-manager-model";
import { ownerTone } from "./owner-tone-ui";

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
  showProgress = false,
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
  /** P2 #17: solo si el servidor confirmó que existen las tablas. */
  showProgress?: boolean;
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
  // P2 #17: objetivos y observaciones, plegados para no cargar la lista.
  const progressPanelId = useId();
  const [progressOpen, setProgressOpen] = useState(false);
  return (
    <li className="grid gap-3 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          className={ownerTone.dangerOutlineButton}
          aria-label={`Dar de baja a ${membership.athleteName}`}
          disabled={commandsLocked || writesBlocked}
          onClick={() =>
            onChangeMembership("ended")
          }
        >
          Dar de baja
        </button>
        {showProgress ? (
          <button
            type="button"
            className={secondaryButtonClassName}
            aria-expanded={progressOpen}
            aria-controls={progressOpen ? progressPanelId : undefined}
            aria-label={`Objetivos y observaciones de ${membership.athleteName}`}
            onClick={() => setProgressOpen((open) => !open)}
          >
            <Flag className="h-4 w-4" aria-hidden="true" />
            Objetivos y observaciones
          </button>
        ) : null}
      </div>
      </div>
      {showProgress && progressOpen ? (
        <div id={progressPanelId}>
          <OwnerAthleteProgressPanel
            organizationId={organizationId}
            locationId={locationId}
            athleteId={membership.athleteId}
            athleteName={membership.athleteName}
            readOnly={writesBlocked}
          />
        </div>
      ) : null}
    </li>
  );
}
