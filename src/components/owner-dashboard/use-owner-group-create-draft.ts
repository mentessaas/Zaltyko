"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useOrganizationDraftField } from "./use-organization-draft-field";
import {
  GROUP_CREATE_FIELD_ERROR_IDS,
  GROUP_CREATE_NATIVE_FIELD_ERRORS,
  readPendingGroupCreate,
  summarizeGroupCreateFieldErrors,
  type GroupCreateField,
  type GroupCreatePayload,
  type GroupCreateValidationState,
  type GroupsBundle,
  type PendingGroupCreateState,
} from "./owner-groups-manager-model";

/**
 * Group creation draft (ephemeral fields and validation) plus the pending
 * create command restored from sessionStorage after hydration. Extracted from
 * OwnerGroupsManager; sending the command stays in the manager.
 */
export function useOwnerGroupCreateDraft({
  bundle,
  organizationId,
  membershipScope,
}: {
  bundle: GroupsBundle;
  organizationId: string;
  membershipScope: string;
}) {
  const defaultProgramId = bundle.programs[0]?.id ?? "";
  const defaultLocationId =
    bundle.selectedLocationId ??
    bundle.groups.find((group) => group.id === bundle.selectedGroupId)
      ?.locationId ??
    bundle.locations[0]?.id ??
    "";
  const [createOpen, setCreateOpen] = useState(bundle.groups.length === 0);
  const [groupName, setGroupName] = useOrganizationDraftField(organizationId, "");
  const [programId, setProgramId] = useOrganizationDraftField(
    organizationId,
    defaultProgramId
  );
  const [locationId, setLocationId] = useOrganizationDraftField(
    organizationId,
    defaultLocationId
  );
  const [capacity, setCapacity] = useOrganizationDraftField(organizationId, "");
  const [groupCreateValidation, setGroupCreateValidation] =
    useOrganizationDraftField<GroupCreateValidationState>(organizationId, () => ({
      fieldErrors: {},
      summary: "",
    }));
  const groupCreateFieldErrors = groupCreateValidation.fieldErrors;
  const groupCreateValidationSummary = groupCreateValidation.summary;
  const [pendingGroupCreate, setPendingGroupCreate] =
    useState<PendingGroupCreateState | null>(null);
  const [pendingGroupCreateLoadedFor, setPendingGroupCreateLoadedFor] =
    useState<string | null>(null);
  const [pendingGroupCreateReadAttempt, setPendingGroupCreateReadAttempt] = useState(0);
  const currentPendingGroupCreate =
    pendingGroupCreate?.organizationId === organizationId
      ? pendingGroupCreate
      : null;
  const replayableGroupCreate =
    currentPendingGroupCreate?.kind === "replayable"
      ? currentPendingGroupCreate.command
      : null;
  const replayableGroupPayload = replayableGroupCreate
    ? (JSON.parse(replayableGroupCreate.body) as GroupCreatePayload)
    : null;
  const groupCreateScopeLoaded = pendingGroupCreateLoadedFor === organizationId;
  const createStorageKey = `zaltyko:pending-group-create:v2:${organizationId}`;
  const legacyCreateStorageKey = `zaltyko:pending-group-create:${organizationId}`;

  useEffect(() => {
    const pending = readPendingGroupCreate(
      createStorageKey,
      legacyCreateStorageKey,
      organizationId
    );
    // Restore sessionStorage after hydration so server and first client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingGroupCreate(pending);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGroupCreateValidation({ fieldErrors: {}, summary: "" });
    if (pending?.kind === "replayable") {
      const payload = JSON.parse(pending.command.body) as GroupCreatePayload;
      setGroupName(payload.name);
      setProgramId(payload.programId);
      setLocationId(payload.locationId);
      setCapacity(payload.capacity === null ? "" : String(payload.capacity));
      setCreateOpen(true);
    } else {
      setGroupName("");
      setProgramId(defaultProgramId);
      setLocationId(defaultLocationId);
      setCapacity("");
      setCreateOpen(bundle.groups.length === 0);
    }
    setPendingGroupCreateLoadedFor(organizationId);
  }, [
    bundle.groups.length,
    createStorageKey,
    defaultLocationId,
    defaultProgramId,
    legacyCreateStorageKey,
    organizationId,
    membershipScope,
    pendingGroupCreateReadAttempt,
    setGroupCreateValidation,
  ]);

  function clearPendingGroupCreate() {
    try {
      window.sessionStorage.removeItem(createStorageKey);
    } catch {
      // The in-memory state still reflects the server's definitive response.
    }
    setPendingGroupCreate((current) =>
      current?.organizationId === organizationId ? null : current
    );
  }

  function clearGroupCreateFieldError(field: GroupCreateField) {
    setGroupCreateValidation((current) => {
      if (!current.fieldErrors[field]) return current;
      const fieldErrors = { ...current.fieldErrors };
      delete fieldErrors[field];
      return {
        fieldErrors,
        summary: summarizeGroupCreateFieldErrors(fieldErrors),
      };
    });
  }

  function markNativeGroupCreateFieldInvalid(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }
    const field = (Object.keys(GROUP_CREATE_FIELD_ERROR_IDS) as GroupCreateField[]).find(
      (key) => GROUP_CREATE_FIELD_ERROR_IDS[key] === `${target.id}-error`
    );
    if (!field) return;
    setGroupCreateValidation((current) => {
      const fieldErrors = {
        ...current.fieldErrors,
        [field]: GROUP_CREATE_NATIVE_FIELD_ERRORS[field],
      };
      return {
        fieldErrors,
        summary: summarizeGroupCreateFieldErrors(fieldErrors),
      };
    });
  }

  return {
    createOpen,
    setCreateOpen,
    groupName,
    setGroupName,
    programId,
    setProgramId,
    locationId,
    setLocationId,
    capacity,
    setCapacity,
    setGroupCreateValidation,
    groupCreateFieldErrors,
    groupCreateValidationSummary,
    setPendingGroupCreate,
    pendingGroupCreateLoadedFor,
    setPendingGroupCreateReadAttempt,
    currentPendingGroupCreate,
    replayableGroupCreate,
    replayableGroupPayload,
    groupCreateScopeLoaded,
    createStorageKey,
    clearPendingGroupCreate,
    clearGroupCreateFieldError,
    markNativeGroupCreateFieldInvalid,
  };
}
