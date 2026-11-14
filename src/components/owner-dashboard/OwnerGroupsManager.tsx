"use client";

import { ownerTone, ownerUi } from "./owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Plus, UsersRound } from "lucide-react";
import { groupCommandOutcome, uncertainGroupCommandMessage } from "./owner-group-command-response";
import { useOrganizationDraftField } from "./use-organization-draft-field";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import { ownerDashboardScopeHref } from "./owner-dashboard-scope-url";
import { pendingOwnerAthleteProfileMatches } from "./OwnerAthleteProfileEditor";
import { pendingOwnerAthleteFamilyAssociationMatches } from "./OwnerAthleteFamilyAssociationEditor";
import { pendingOwnerAthleteArchiveMatches } from "./OwnerAthleteArchiveEditor";
import {
  decodeGroupAthleteRecovery,
  persistPendingGroupAthleteCreate,
  type PendingGroupAthleteCreate,
} from "./owner-pending-group-athlete";
import {
  clearPendingGroupMembership,
  commandFromGroupMembershipSnapshot,
  persistPendingGroupMembership,
  snapshotFromGroupMembershipCommand,
} from "./owner-pending-group-membership";
import {
  primaryButtonClassName,
  responseData,
  responseError,
  summarizeGroupCreateFieldErrors,
  type Candidate,
  type GroupCreateFieldErrors,
  type GroupCreatePayload,
  type GroupsBundle,
  type PendingGroupCreate,
  type PendingMembershipCommand,
} from "./owner-groups-manager-model";
import {
  useOwnerAthleteArchiveRecovery,
  useOwnerAthleteFamilyAssociationRecovery,
  useOwnerAthleteProfileRecovery,
} from "./use-owner-athlete-command-recovery";
import {
  useOwnerGroupAthleteCreateRecovery,
  useOwnerGroupMembershipRecovery,
} from "./use-owner-group-membership-recovery";
import { useOwnerGroupCreateDraft } from "./use-owner-group-create-draft";
import {
  OwnerGroupsDetachedArchiveResolver,
  OwnerGroupsForeignMembershipNotice,
  OwnerGroupsForeignProfileNotice,
  OwnerGroupsPendingArchiveNotice,
  OwnerGroupsPendingFamilyAssociationNotice,
  OwnerGroupsPendingMembershipNotice,
  OwnerGroupsRecoveryAlert,
} from "./OwnerGroupsRecoveryNotices";
import { OwnerGroupCreateForm, OwnerGroupCreatePendingNotice } from "./OwnerGroupCreatePanel";
import { OwnerGroupsSidebar } from "./OwnerGroupsSidebar";
import { OwnerGroupAthleteCreateDetails, OwnerGroupAthleteSearchForm } from "./OwnerGroupAthleteIntake";
import { OwnerGroupMembershipRow } from "./OwnerGroupMembershipRow";

export function OwnerGroupsManager({
  bundle,
  progressAvailable = false,
}: {
  bundle: GroupsBundle;
  /** P2 #17: el servidor comprobó que existen las tablas de objetivos y observaciones. */
  progressAvailable?: boolean;
}) {
  const router = useRouter();
  const organizationId = bundle.organization.id;
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesAllowed = planPolicy.status === "ready" && !planPolicy.readOnly;
  const writesBlocked = !writesAllowed;
  const membershipScope = `${organizationId}:${bundle.selectedGroupId ?? "none"}`;
  const [candidateQuery, setCandidateQuery] = useOrganizationDraftField(membershipScope, "");
  const [candidates, setCandidates] = useOrganizationDraftField<Candidate[]>(membershipScope, []);
  const [newAthleteGivenName, setNewAthleteGivenName] = useOrganizationDraftField(membershipScope, "");
  const [newAthleteFamilyName, setNewAthleteFamilyName] = useOrganizationDraftField(membershipScope, "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useOrganizationDraftField(membershipScope, "");
  const [notice, setNotice] = useOrganizationDraftField(membershipScope, "");
  const groupCreateRequestRef = useRef(false);
  const scopeVersionRef = useRef(0);
  useEffect(() => { scopeVersionRef.current += 1; }, [membershipScope]);
  const {
    profileRecoveryIssue,
    pendingAthleteProfile,
    activeAthleteProfileKey,
    profilePendingRef,
    activeAthleteProfileKeyRef,
    setProfileRecoveryAttempt,
    profileRecoveryReady,
    profileRecoveryBlocked,
    updateActiveAthleteProfile,
    updatePendingAthleteProfile,
  } = useOwnerAthleteProfileRecovery(organizationId);
  const {
    familyRecoveryIssue,
    pendingAthleteFamilyAssociation,
    activeAthleteFamilyAssociationKey,
    familyPendingRef,
    activeAthleteFamilyAssociationKeyRef,
    setFamilyRecoveryAttempt,
    familyRecoveryReady,
    familyRecoveryBlocked,
    updateActiveAthleteFamilyAssociation,
    updatePendingAthleteFamilyAssociation,
  } = useOwnerAthleteFamilyAssociationRecovery(organizationId);
  const {
    archiveRecoveryIssue,
    pendingAthleteArchive,
    activeAthleteArchiveKey,
    archivePendingRef,
    activeAthleteArchiveKeyRef,
    setArchiveRecoveryAttempt,
    archiveRecoveryLoaded,
    archiveRecoveryReady,
    archiveRecoveryBlocked,
    updateActiveAthleteArchive,
    updatePendingAthleteArchive,
    athleteArchiveMutationBlocked,
    refreshAfterAthleteArchive,
  } = useOwnerAthleteArchiveRecovery(organizationId);
  const {
    pendingMembershipRef,
    membershipSendingRef,
    membershipUncertainRef,
    pendingMembership,
    setPendingMembership,
    membershipRecoveryFailure,
    setMembershipRecoveryFailure,
    foreignMembershipScope,
    setMembershipRecoveryAttempt,
    retryMembershipRef,
    membershipRecoveryReady,
    membershipRecoveryError,
    canRetryMembership,
  } = useOwnerGroupMembershipRecovery({
    organizationId,
    selectedGroupId: bundle.selectedGroupId,
    membershipScope,
    busy,
  });
  const {
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
  } = useOwnerGroupCreateDraft({ bundle, organizationId, membershipScope });
  const {
    setCreateAthleteRecovery,
    setCreateAthleteRecoveryAttempt,
    scopedCreateAthleteRecovery,
    createAthleteBlocked,
    createAthleteStorageKey,
    clearCreateAthleteIntent,
  } = useOwnerGroupAthleteCreateRecovery({
    organizationId,
    selectedGroupId: bundle.selectedGroupId,
    membershipScope,
  });
  const selectedGroup = bundle.groups.find(
    (group) => group.id === bundle.selectedGroupId
  );
  const selectedToday = selectedGroup
    ? (bundle.localTodayByLocation[selectedGroup.locationId] ?? "")
    : "";
  const nonFamilyCommandsLocked = busy || !membershipRecoveryReady || membershipRecoveryError !== "" || pendingMembership !== null || foreignMembershipScope !== null || currentPendingGroupCreate !== null || archiveRecoveryBlocked;
  const pendingFamilyAssociationVisible = Boolean(selectedGroup && pendingAthleteFamilyAssociation && bundle.memberships.some((membership) =>
    pendingOwnerAthleteFamilyAssociationMatches(pendingAthleteFamilyAssociation, {
      organizationId,
      locationId: selectedGroup.locationId,
      groupId: selectedGroup.id,
      athleteId: membership.athleteId,
    })
  ));
  const groupCreateLocked =
    busy || !groupCreateScopeLoaded || !membershipRecoveryReady || membershipRecoveryError !== "" || currentPendingGroupCreate !== null || pendingMembership !== null || foreignMembershipScope !== null || profileRecoveryBlocked || familyRecoveryBlocked || archiveRecoveryBlocked || writesBlocked;
  const baseCommandsLocked = nonFamilyCommandsLocked || profileRecoveryBlocked || familyRecoveryBlocked;
  const commandsLocked = baseCommandsLocked;
  const canManageAthleteArchive = (bundle.member.role === "owner" || bundle.member.role === "admin") && bundle.member.locationScopeMode === "all";
  const pendingArchiveInOriginalContext = Boolean(
    canManageAthleteArchive && selectedGroup && pendingAthleteArchive &&
    pendingAthleteArchive.organizationId === organizationId &&
    pendingAthleteArchive.locationId === selectedGroup.locationId &&
    pendingAthleteArchive.groupId === selectedGroup.id
  );
  const pendingArchiveAthleteVisible = Boolean(pendingArchiveInOriginalContext && pendingAthleteArchive &&
    bundle.memberships.some((membership) => membership.athleteId === pendingAthleteArchive.athleteId));
  const detachedPendingArchiveVisible = Boolean(pendingArchiveInOriginalContext && pendingAthleteArchive && !pendingArchiveAthleteVisible);
  const pendingArchiveIsForeign = pendingAthleteArchive !== null && !pendingArchiveInOriginalContext;

  function athleteArchiveEditorDisabled(
    scope: { organizationId: string; locationId: string; groupId: string; athleteId: string },
    editorKey: string
  ) {
    const pendingMatches = pendingOwnerAthleteArchiveMatches(pendingAthleteArchive, scope);
    return !canManageAthleteArchive || !archiveRecoveryReady || archiveRecoveryIssue !== null ||
      busy || !membershipRecoveryReady || membershipRecoveryError !== "" ||
      pendingMembershipRef.current !== null || membershipSendingRef.current ||
      groupCreateRequestRef.current || currentPendingGroupCreate !== null ||
      profilePendingRef.current !== null || activeAthleteProfileKeyRef.current !== null ||
      !profileRecoveryReady || profileRecoveryIssue !== null || pendingAthleteProfile !== null ||
      familyPendingRef.current !== null || activeAthleteFamilyAssociationKeyRef.current !== null ||
      !familyRecoveryReady || familyRecoveryIssue !== null || pendingAthleteFamilyAssociation !== null ||
      (pendingAthleteArchive !== null && !pendingMatches) ||
      (activeAthleteArchiveKey !== null && activeAthleteArchiveKey !== editorKey);
  }

  function groupHref(groupId?: string, nextLocationId?: string) {
    const params = new URLSearchParams({ organizationId });
    if (nextLocationId) params.set("locationId", nextLocationId);
    if (groupId) params.set("groupId", groupId);
    return `/owner/groups?${params.toString()}`;
  }

  function toggleGroupCreateForm() {
    if (createOpen) {
      setCreateOpen(false);
      setGroupCreateValidation({ fieldErrors: {}, summary: "" });
    } else if (writesAllowed && !familyRecoveryBlocked && !archiveRecoveryBlocked) {
      setCreateOpen(true);
    }
  }

  async function sendGroupCreate(command: PendingGroupCreate, previouslyUncertain = false) {
    if (
      command.organizationId !== organizationId ||
      groupCreateRequestRef.current || membershipSendingRef.current || pendingMembershipRef.current ||
      archivePendingRef.current !== null || activeAthleteArchiveKeyRef.current !== null ||
      !archiveRecoveryReady || archiveRecoveryIssue !== null ||
      profilePendingRef.current !== null || activeAthleteProfileKeyRef.current !== null ||
      !profileRecoveryReady || profileRecoveryIssue !== null || pendingAthleteProfile !== null ||
      familyPendingRef.current !== null || activeAthleteFamilyAssociationKeyRef.current !== null ||
      !familyRecoveryReady || familyRecoveryIssue !== null || pendingAthleteFamilyAssociation !== null
    ) {
      return;
    }
    groupCreateRequestRef.current = true;
    const scopeVersion = scopeVersionRef.current;
    setError("");
    setNotice("");
    try {
      window.sessionStorage.setItem(createStorageKey, JSON.stringify(command));
    } catch {
      groupCreateRequestRef.current = false;
      setError(
        "No se pudo guardar la solicitud pendiente en esta sesión. No se ha enviado; inténtalo de nuevo cuando el almacenamiento esté disponible."
      );
      return;
    }

    setPendingGroupCreate({
      kind: "replayable",
      organizationId,
      command,
    });
    setBusy(true);
    let confirmed = false;
    try {
      const response = await fetch("/api/v1/owner/groups", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": command.idempotencyKey,
        },
        body: command.body,
      });
      const payload = await response.json().catch(() => null);
      const outcome = groupCommandOutcome(response, payload, {
        kind: "group",
        commandBody: command.body,
        previouslyUncertain,
      });
      if (outcome.status !== "confirmed") {
        if (outcome.status === "rejected") clearPendingGroupCreate();
        setError(outcome.message);
        return;
      }
      confirmed = true;
      clearPendingGroupCreate();
      if (scopeVersionRef.current === scopeVersion) {
        if (outcome.id === bundle.selectedGroupId) {
          router.refresh();
        } else {
          router.push(groupHref(outcome.id, outcome.locationId));
        }
      }
    } catch {
      setError(confirmed
        ? "El grupo está confirmado, pero no se pudo actualizar la vista. Actualiza la página para consultar el resultado."
        : uncertainGroupCommandMessage);
    } finally {
      setBusy(false);
      groupCreateRequestRef.current = false;
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      writesBlocked ||
      currentPendingGroupCreate ||
      pendingMembershipRef.current || membershipSendingRef.current ||
      archivePendingRef.current || activeAthleteArchiveKeyRef.current ||
      !archiveRecoveryReady || archiveRecoveryIssue !== null ||
      profilePendingRef.current || activeAthleteProfileKeyRef.current ||
      !profileRecoveryReady || profileRecoveryIssue !== null || pendingAthleteProfile !== null ||
      familyPendingRef.current || activeAthleteFamilyAssociationKeyRef.current ||
      !familyRecoveryReady || familyRecoveryIssue !== null || pendingAthleteFamilyAssociation !== null ||
      pendingGroupCreateLoadedFor !== organizationId
    ) {
      return;
    }
    const incompleteFieldErrors: GroupCreateFieldErrors = {};
    if (!groupName.trim()) {
      incompleteFieldErrors.name = "Escribe el nombre del grupo.";
    }
    if (!programId) {
      incompleteFieldErrors.programId = "Selecciona una actividad.";
    }
    if (!locationId) {
      incompleteFieldErrors.locationId = "Selecciona una sede.";
    }
    if (Object.keys(incompleteFieldErrors).length > 0) {
      setGroupCreateValidation({
        fieldErrors: incompleteFieldErrors,
        summary: summarizeGroupCreateFieldErrors(incompleteFieldErrors),
      });
      return;
    }
    const programIsInScope = bundle.programs.some((program) => program.id === programId);
    const locationIsInScope = bundle.locations.some((location) => location.id === locationId);
    if (!programIsInScope || !locationIsInScope) {
      const scopeFieldErrors: GroupCreateFieldErrors = {};
      if (!programIsInScope) {
        scopeFieldErrors.programId = "La actividad seleccionada ya no pertenece a esta academia.";
      }
      if (!locationIsInScope) {
        scopeFieldErrors.locationId = "La sede seleccionada ya no pertenece a esta academia.";
      }
      setGroupCreateValidation({
        fieldErrors: scopeFieldErrors,
        summary: summarizeGroupCreateFieldErrors(scopeFieldErrors),
      });
      return;
    }
    const parsedCapacity = capacity.trim() ? Number(capacity) : null;
    if (
      parsedCapacity !== null &&
      (!Number.isInteger(parsedCapacity) || parsedCapacity < 1)
    ) {
      const fieldErrors: GroupCreateFieldErrors = {
        capacity: "La capacidad debe ser un número entero mayor que cero.",
      };
      setGroupCreateValidation({
        fieldErrors,
        summary: summarizeGroupCreateFieldErrors(fieldErrors),
      });
      return;
    }

    setGroupCreateValidation({ fieldErrors: {}, summary: "" });
    const payload: GroupCreatePayload = {
      organizationId,
      locationId,
      programId,
      name: groupName.trim(),
      capacity: parsedCapacity,
    };
    await sendGroupCreate({
      version: 1,
      organizationId,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify(payload),
    });
  }

  async function retryPendingGroupCreate() {
    if (
      currentPendingGroupCreate?.kind !== "replayable" ||
      currentPendingGroupCreate.command.organizationId !== organizationId ||
      busy
    ) {
      return;
    }
    await sendGroupCreate(currentPendingGroupCreate.command, true);
  }

  async function searchAthletes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commandsLocked || pendingMembershipRef.current || membershipSendingRef.current || groupCreateRequestRef.current || athleteArchiveMutationBlocked() || profilePendingRef.current || activeAthleteProfileKeyRef.current || !profileRecoveryReady || profileRecoveryIssue !== null || pendingAthleteProfile !== null || familyPendingRef.current || activeAthleteFamilyAssociationKeyRef.current || !familyRecoveryReady || familyRecoveryIssue !== null || pendingAthleteFamilyAssociation !== null) return;
    setError("");
    setNotice("");
    if (!selectedGroup || candidateQuery.trim().length < 2) {
      setError("Escribe al menos dos letras para buscar.");
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams({
        organizationId,
        q: candidateQuery.trim(),
      });
      const response = await fetch(
        `/api/v1/owner/groups/${selectedGroup.id}/memberships?${params.toString()}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => null);
      const data = responseData<{ items: Candidate[] }>(payload);
      if (!response.ok || !data) {
        setCandidates([]);
        setError(responseError(payload));
        return;
      }
      setCandidates(data.items);
      if (data.items.length === 0) {
        setNotice("No hay coincidencias disponibles para añadir a este grupo.");
      }
    } catch {
      setError(
        "No se pudo buscar. Comprueba la conexión e inténtalo de nuevo."
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendMembershipCommand(command: PendingMembershipCommand) {
    if (
      command.organizationId !== organizationId ||
      command.groupId !== bundle.selectedGroupId ||
      membershipSendingRef.current || groupCreateRequestRef.current ||
      athleteArchiveMutationBlocked() ||
      !membershipRecoveryReady || membershipRecoveryError !== "" || foreignMembershipScope !== null ||
      currentPendingGroupCreate ||
      profilePendingRef.current || activeAthleteProfileKeyRef.current ||
      !profileRecoveryReady || profileRecoveryIssue !== null || pendingAthleteProfile !== null ||
      familyPendingRef.current || activeAthleteFamilyAssociationKeyRef.current ||
      !familyRecoveryReady || familyRecoveryIssue !== null || pendingAthleteFamilyAssociation !== null ||
      (pendingMembershipRef.current !== null && pendingMembershipRef.current !== command)
    ) return;
    let activeCommand = command;
    if (command.kind !== "create") {
      const snapshot = snapshotFromGroupMembershipCommand(command);
      const canonicalCommand = snapshot ? commandFromGroupMembershipSnapshot(snapshot) : null;
      let persisted = false;
      try { persisted = Boolean(snapshot && canonicalCommand && persistPendingGroupMembership(window.sessionStorage, canonicalCommand)); }
      catch { persisted = false; }
      if (!snapshot || !canonicalCommand || !persisted) {
        setMembershipRecoveryFailure({
          scope: membershipScope,
          message: "No se pudo guardar y verificar la intención pendiente. No se ha enviado el cambio; restaura el acceso al almacenamiento y vuelve a comprobarlo.",
        });
        setError("No se pudo preparar el cambio. No se ha enviado nada.");
        return;
      }
      activeCommand = canonicalCommand;
    }
    membershipSendingRef.current = true;
    if (pendingMembershipRef.current === null) membershipUncertainRef.current = false;
    pendingMembershipRef.current = activeCommand;
    setPendingMembership(activeCommand);
    const scopeVersion = scopeVersionRef.current;
    setError("");
    setNotice("");
    setBusy(true);
    let confirmed = false;
    try {
      const response = await fetch(activeCommand.endpoint, {
        method: activeCommand.method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": activeCommand.idempotencyKey,
        },
        body: activeCommand.body,
      });
      const payload = await response.json().catch(() => null);
      const outcome = groupCommandOutcome(response, payload, {
        kind: activeCommand.kind,
        groupId: activeCommand.groupId,
        ...(activeCommand.kind === "add"
          ? { athleteId: activeCommand.athleteId }
          : activeCommand.kind === "transition"
            ? { membershipId: activeCommand.membershipId }
            : {}),
        previouslyUncertain: membershipUncertainRef.current,
      });
      if (outcome.status === "uncertain") {
        membershipUncertainRef.current = true;
        setError(outcome.message);
        return;
      }
      const createIntent = activeCommand.kind === "create"
        ? {
            version: 1 as const,
            organizationId: activeCommand.organizationId,
            groupId: activeCommand.groupId,
            kind: "create-athlete-and-membership" as const,
            idempotencyKey: activeCommand.idempotencyKey,
          }
        : null;
      const recovery = createIntent && outcome.status === "confirmed"
        ? decodeGroupAthleteRecovery({
            ok: true,
            data: {
              status: "complete",
              receipt: responseData(payload),
            },
          })
        : null;
      let pendingCleared = activeCommand.kind === "create";
      if (activeCommand.kind !== "create") {
        try { pendingCleared = clearPendingGroupMembership(window.sessionStorage, activeCommand); }
        catch { pendingCleared = false; }
      }
      if (!pendingCleared) {
        membershipUncertainRef.current = true;
        setError("Hubo respuesta, pero falta terminar. Vuelve a comprobarlo: no se repetirá el cambio.");
        return;
      }
      if (pendingMembershipRef.current === activeCommand) {
        pendingMembershipRef.current = null;
        membershipUncertainRef.current = false;
        setPendingMembership(null);
      }
      if (outcome.status === "rejected") {
        if (createIntent) clearCreateAthleteIntent(createIntent);
        setError(outcome.message);
        return;
      }
      confirmed = true;
      if (activeCommand.kind === "create") {
        setNewAthleteGivenName("");
        setNewAthleteFamilyName("");
        setCandidates([]);
        if (createIntent && recovery?.status === "complete") {
          clearCreateAthleteIntent(createIntent, recovery.receipt);
          setNotice("Ficha creada y añadida al grupo.");
        } else {
          setCreateAthleteRecovery({
            scope: membershipScope,
            status: "blocked",
            intent: createIntent ?? undefined,
            detail: "Se hizo el alta, pero no pudimos comprobarla. No se enviará otra vez.",
          });
        }
      } else if (activeCommand.kind === "add") {
        setCandidates((current) => current.filter((item) => item.id !== activeCommand.athleteId));
        setNotice("Gimnasta añadida al grupo.");
      } else {
        setNotice("Pertenencia actualizada.");
      }
      // A late response must not refresh a different academy or a new visit to this group.
      if (scopeVersionRef.current === scopeVersion) router.refresh();
    } catch {
      if (!confirmed) membershipUncertainRef.current = true;
      setError(confirmed
        ? "La operación está confirmada, pero no se pudo actualizar la vista. Actualiza la página para consultar el resultado."
        : uncertainGroupCommandMessage);
    } finally {
      membershipSendingRef.current = false;
      setBusy(false);
    }
  }

  function membershipCommandBlocked() {
    return writesBlocked || !membershipRecoveryReady || membershipRecoveryError !== "" || foreignMembershipScope !== null || busy || pendingMembershipRef.current !== null || membershipSendingRef.current || groupCreateRequestRef.current || athleteArchiveMutationBlocked() || currentPendingGroupCreate !== null || profilePendingRef.current !== null || activeAthleteProfileKeyRef.current !== null || !profileRecoveryReady || profileRecoveryIssue !== null || pendingAthleteProfile !== null || familyPendingRef.current !== null || activeAthleteFamilyAssociationKeyRef.current !== null || !familyRecoveryReady || familyRecoveryIssue !== null || pendingAthleteFamilyAssociation !== null;
  }

  async function addAthlete(athleteId: string) {
    if (!selectedGroup || membershipCommandBlocked()) return;
    await sendMembershipCommand({
      organizationId, groupId: selectedGroup.id, kind: "add", athleteId,
      endpoint: `/api/v1/owner/groups/${selectedGroup.id}/memberships`, method: "POST",
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ organizationId, athleteId, startsOn: selectedToday, status: "active" }),
    });
  }

  async function createAthleteForGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || membershipCommandBlocked() || createAthleteBlocked) return;
    setError("");
    setNotice("");
    const givenName = newAthleteGivenName.trim();
    const familyName = newAthleteFamilyName.trim();
    if (!givenName || !familyName) {
      setError("Indica el nombre y los apellidos.");
      return;
    }

    const existing = scopedCreateAthleteRecovery?.status === "needs-input"
      ? scopedCreateAthleteRecovery.intent
      : null;
    const createIntent: PendingGroupAthleteCreate = existing ?? {
      version: 1,
      organizationId,
      groupId: selectedGroup.id,
      kind: "create-athlete-and-membership",
      idempotencyKey: `owner-create-athlete:${crypto.randomUUID()}`,
    };
    let persisted = false;
    try {
      persisted = createIntent.organizationId === organizationId &&
        createIntent.groupId === selectedGroup.id &&
        persistPendingGroupAthleteCreate(window.sessionStorage, createAthleteStorageKey, createIntent);
    } catch {
      persisted = false;
    }
    if (!persisted) {
      setCreateAthleteRecovery({
        scope: membershipScope,
        status: "blocked",
        detail: "No se pudo guardar y verificar la clave de la operación. No se ha enviado el alta.",
      });
      return;
    }
    setCreateAthleteRecovery({ scope: membershipScope, status: "needs-input", intent: createIntent });

    await sendMembershipCommand({
      organizationId, groupId: selectedGroup.id, kind: "create",
      endpoint: `/api/v1/owner/groups/${selectedGroup.id}/memberships`, method: "POST",
      idempotencyKey: createIntent.idempotencyKey,
      body: JSON.stringify({ organizationId, newAthlete: { givenName, familyName } }),
    });
  }

  function confirmRecoveredAthleteReceipt() {
    if (scopedCreateAthleteRecovery?.status !== "complete" || !scopedCreateAthleteRecovery.intent || !scopedCreateAthleteRecovery.receipt) return;
    if (clearCreateAthleteIntent(scopedCreateAthleteRecovery.intent, scopedCreateAthleteRecovery.receipt)) {
      setNotice("El alta ya estaba confirmada. Se ha limpiado la clave pendiente.");
      router.refresh();
    }
  }

  async function changeMembership(
    membership: GroupsBundle["memberships"][number],
    toStatus: "active" | "paused" | "ended"
  ) {
    if (!selectedGroup || membershipCommandBlocked()) return;
    if (
      toStatus === "ended" &&
      !window.confirm(
        `¿Dar de baja a ${membership.athleteName} de este grupo? El historial se conservará.`
      )
    ) {
      return;
    }
    await sendMembershipCommand({
      organizationId, groupId: selectedGroup.id, kind: "transition", membershipId: membership.id,
      endpoint: `/api/v1/owner/groups/${selectedGroup.id}/memberships/${membership.id}`, method: "PATCH",
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ organizationId, expectedStatus: membership.status, toStatus, effectiveOn: selectedToday }),
    });
  }

  return (
    <main className={ownerUi.pageWide}>
      <div className="mx-auto max-w-[92rem]">
        <Link
          href={ownerDashboardScopeHref(
            "/owner",
            organizationId,
            bundle.selectedLocationId
          )}
          aria-disabled={commandsLocked}
          tabIndex={commandsLocked ? -1 : undefined}
          onClick={(event) => {
            if (commandsLocked) event.preventDefault();
          }}
          className="touch-target inline-flex items-center gap-2 text-sm font-semibold text-z-soft underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-z-brand-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al resumen
        </Link>
        <PageHeader
          title="Grupos y equipos"
          description="Organiza cada actividad por sede. Una gimnasta puede pertenecer a varios grupos."
          className="mt-5"
          actions={
            <button
              type="button"
              className={primaryButtonClassName}
              disabled={(!writesAllowed && !createOpen) || busy || !groupCreateScopeLoaded || !membershipRecoveryReady || membershipRecoveryError !== "" || currentPendingGroupCreate !== null || pendingMembership !== null || foreignMembershipScope !== null || profileRecoveryBlocked || familyRecoveryBlocked || archiveRecoveryBlocked}
              onClick={toggleGroupCreateForm}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {createOpen ? "Cerrar formulario" : "Crear grupo"}
            </button>
          }
        />

        <OwnerOperationalReadOnlyNotice organizationId={organizationId} />

        {membershipRecoveryFailure?.scope === membershipScope && (
          <OwnerGroupsRecoveryAlert
            message={membershipRecoveryFailure.message}
            retryLabel="Volver a comprobar operación pendiente"
            onRetry={() => setMembershipRecoveryAttempt((attempt) => attempt + 1)}
          />
        )}
        {profileRecoveryIssue && profileRecoveryReady && (
          <OwnerGroupsRecoveryAlert
            message={profileRecoveryIssue}
            retryLabel="Volver a comprobar ficha pendiente"
            onRetry={() => setProfileRecoveryAttempt((attempt) => attempt + 1)}
          />
        )}
        {familyRecoveryIssue && familyRecoveryReady && (
          <OwnerGroupsRecoveryAlert
            message={familyRecoveryIssue}
            retryLabel="Volver a comprobar asociación familiar pendiente"
            onRetry={() => setFamilyRecoveryAttempt((attempt) => attempt + 1)}
          />
        )}
        {!archiveRecoveryLoaded && (
          <p role="status" className="mt-5 text-sm text-z-soft">Comprobando si hay un archivo pendiente…</p>
        )}
        {archiveRecoveryIssue && archiveRecoveryLoaded && (
          <OwnerGroupsRecoveryAlert
            message={archiveRecoveryIssue}
            retryLabel="Volver a comprobar archivo pendiente"
            onRetry={() => setArchiveRecoveryAttempt((attempt) => attempt + 1)}
          />
        )}
        {pendingAthleteArchive && (
          <OwnerGroupsPendingArchiveNotice
            pendingAthleteArchive={pendingAthleteArchive}
            isForeign={pendingArchiveIsForeign}
          />
        )}
        {archiveRecoveryReady && detachedPendingArchiveVisible && pendingAthleteArchive && selectedGroup && (
          <OwnerGroupsDetachedArchiveResolver
            pendingAthleteArchive={pendingAthleteArchive}
            disabled={athleteArchiveEditorDisabled({
              organizationId: pendingAthleteArchive.organizationId,
              locationId: pendingAthleteArchive.locationId,
              groupId: pendingAthleteArchive.groupId,
              athleteId: pendingAthleteArchive.athleteId,
            }, `archive:${pendingAthleteArchive.organizationId}:${pendingAthleteArchive.locationId}:${pendingAthleteArchive.groupId}:${pendingAthleteArchive.athleteId}`)}
            onActiveChange={(active) => updateActiveAthleteArchive(`archive:${pendingAthleteArchive.organizationId}:${pendingAthleteArchive.locationId}:${pendingAthleteArchive.groupId}:${pendingAthleteArchive.athleteId}`, active)}
            onPendingCommandChange={updatePendingAthleteArchive}
            onArchived={(receipt) => refreshAfterAthleteArchive(receipt, pendingAthleteArchive.athleteId)}
          />
        )}
        {!familyRecoveryReady && (
          <p role="status" className="mt-5 text-sm text-z-soft">Comprobando si hay una asociación familiar pendiente…</p>
        )}
        {pendingAthleteFamilyAssociation && (
          <OwnerGroupsPendingFamilyAssociationNotice
            pendingAthleteFamilyAssociation={pendingAthleteFamilyAssociation}
            visibleHere={pendingFamilyAssociationVisible}
          />
        )}
        {pendingAthleteProfile && !bundle.memberships.some((membership) =>
          Boolean(selectedGroup && pendingOwnerAthleteProfileMatches(pendingAthleteProfile, {
            organizationId,
            locationId: selectedGroup.locationId,
            groupId: selectedGroup.id,
            athleteId: membership.athleteId,
          }))
        ) && (
          <OwnerGroupsForeignProfileNotice pendingAthleteProfile={pendingAthleteProfile} />
        )}
        {!profileRecoveryReady && (
          <p role="status" className="mt-5 text-sm text-z-soft">Comprobando si hay una ficha pendiente…</p>
        )}
        {foreignMembershipScope && !pendingMembership && (
          <OwnerGroupsForeignMembershipNotice foreignMembershipScope={foreignMembershipScope} />
        )}

        {!groupCreateScopeLoaded && (
          <p role="status" className="mt-5 text-sm text-z-soft">
            Comprobando si hay una creación pendiente…
          </p>
        )}

        {error && (
          <p
            role="alert"
            className={`mt-5 ${ownerTone.noticeError}`}
          >
            {error}
          </p>
        )}
        {groupCreateValidationSummary && (
          <p
            role="alert"
            className={`mt-5 ${ownerTone.noticeError}`}
          >
            {groupCreateValidationSummary}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className={`mt-5 ${ownerTone.noticeInfo}`}
          >
            {notice}
          </p>
        )}

        {pendingMembership && (
          <OwnerGroupsPendingMembershipNotice
            pendingMembership={pendingMembership}
            canRetryMembership={canRetryMembership}
            busy={busy}
            retryMembershipRef={retryMembershipRef}
            onRetry={() => void sendMembershipCommand(pendingMembership)}
          />
        )}

        {currentPendingGroupCreate && (
          <OwnerGroupCreatePendingNotice
            currentPendingGroupCreate={currentPendingGroupCreate}
            replayableGroupCreate={replayableGroupCreate}
            replayableGroupPayload={replayableGroupPayload}
            busy={busy}
            retryDisabled={busy || familyRecoveryBlocked || profileRecoveryBlocked}
            onRetry={retryPendingGroupCreate}
            onReadAgain={() =>
              setPendingGroupCreateReadAttempt((attempt) => attempt + 1)
            }
            onRefresh={() => router.refresh()}
          />
        )}

        {createOpen && groupCreateScopeLoaded && (
          <OwnerGroupCreateForm
            programs={bundle.programs}
            locations={bundle.locations}
            groupName={groupName}
            programId={programId}
            locationId={locationId}
            capacity={capacity}
            fieldErrors={groupCreateFieldErrors}
            locked={groupCreateLocked}
            busy={busy}
            onSubmit={createGroup}
            onInvalidCapture={markNativeGroupCreateFieldInvalid}
            onGroupNameChange={setGroupName}
            onProgramIdChange={setProgramId}
            onLocationIdChange={setLocationId}
            onCapacityChange={setCapacity}
            onFieldEdited={clearGroupCreateFieldError}
          />
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <OwnerGroupsSidebar
            groups={bundle.groups}
            selectedGroupId={selectedGroup?.id}
            commandsLocked={commandsLocked}
            groupHref={groupHref}
          />

          <section
            aria-labelledby="selected-group-title"
            className={`min-w-0 ${ownerUi.card}`}
          >
            {!selectedGroup ? (
              <div className={ownerUi.emptyState}>
                <span className={ownerUi.emptyIcon}>
                  <UsersRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className={ownerUi.sectionTitle}>Aún no hay grupos</h2>
                <p className={`mx-auto mt-2 max-w-md ${ownerUi.muted}`}>
                  Crea el primero para organizar las actividades de tu academia.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 border-b border-z-line pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2
                      id="selected-group-title"
                      className={ownerUi.cardTitle}
                    >
                      {selectedGroup.name}
                    </h2>
                    <p className={`mt-2 ${ownerUi.muted}`}>
                      {selectedGroup.programName ?? "Actividad sin clasificar"}{" "}
                      · {selectedGroup.locationName}
                    </p>
                  </div>
                  <span className={`${ownerTone.chipOutline} shrink-0 self-start tabular-nums`}>
                    {selectedGroup.memberCount} de{" "}
                    {selectedGroup.capacity ?? "∞"} plazas
                  </span>
                </div>

                {selectedGroup.status !== "active" ? (
                  <p className={`mt-4 ${ownerTone.noticeWarning}`}>
                    Este grupo no está activo. Puedes ver sus gimnastas, pero no añadir más.
                  </p>
                ) : (
                  <>
                    <OwnerGroupAthleteSearchForm
                      candidateQuery={candidateQuery}
                      candidates={candidates}
                      commandsLocked={commandsLocked}
                      writesBlocked={writesBlocked}
                      onSubmit={searchAthletes}
                      onCandidateQueryChange={setCandidateQuery}
                      onAddAthlete={(athleteId) => void addAthlete(athleteId)}
                    />
                    <OwnerGroupAthleteCreateDetails
                      recovery={scopedCreateAthleteRecovery}
                      newAthleteGivenName={newAthleteGivenName}
                      newAthleteFamilyName={newAthleteFamilyName}
                      commandsLocked={commandsLocked}
                      createAthleteBlocked={createAthleteBlocked}
                      writesBlocked={writesBlocked}
                      busy={busy}
                      onSubmit={createAthleteForGroup}
                      onGivenNameChange={setNewAthleteGivenName}
                      onFamilyNameChange={setNewAthleteFamilyName}
                      onConfirmRecoveredReceipt={confirmRecoveredAthleteReceipt}
                      onRetryRecoveryCheck={() => setCreateAthleteRecoveryAttempt((attempt) => attempt + 1)}
                      onRefresh={() => router.refresh()}
                    />
                  </>
                )}

                <div className="mt-7">
                  <h3 className="font-display text-lg font-black uppercase leading-none text-z-ink">Pertenencias actuales</h3>
                  {bundle.memberships.length === 0 ? (
                    <p className={`mt-3 ${ownerUi.emptyState} text-sm text-z-soft`}>
                      {selectedGroup.status === "active"
                        ? "Este grupo todavía no tiene gimnastas. Puedes añadir una ficha activa desde el buscador."
                        : "Este grupo no tiene gimnastas ahora. Está inactivo y no admite nuevas gimnastas."}
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-z-line border-y border-z-line border-t-[3px] border-t-z-ink">
                      {bundle.memberships.map((membership) => {
                        const profileEditorKey = `${organizationId}:${selectedGroup.locationId}:${selectedGroup.id}:${membership.athleteId}`;
                        const profileCommandMatches = pendingOwnerAthleteProfileMatches(pendingAthleteProfile, {
                          organizationId,
                          locationId: selectedGroup.locationId,
                          groupId: selectedGroup.id,
                          athleteId: membership.athleteId,
                        });
                        const profileEditorDisabled = nonFamilyCommandsLocked || familyRecoveryBlocked || !profileRecoveryReady || profileRecoveryIssue !== null ||
                          (pendingAthleteProfile !== null && !profileCommandMatches) ||
                          (activeAthleteProfileKey !== null && activeAthleteProfileKey !== profileEditorKey);
                        const familyAssociationKey = `${organizationId}:${selectedGroup.locationId}:${selectedGroup.id}:${membership.athleteId}`;
                        const familyAssociationCommandMatches = pendingOwnerAthleteFamilyAssociationMatches(pendingAthleteFamilyAssociation, {
                          organizationId,
                          locationId: selectedGroup.locationId,
                          groupId: selectedGroup.id,
                          athleteId: membership.athleteId,
                        });
                        const familyAssociationEditorDisabled = nonFamilyCommandsLocked || profileRecoveryBlocked ||
                          !familyRecoveryReady || familyRecoveryIssue !== null ||
                          (pendingAthleteFamilyAssociation !== null && !familyAssociationCommandMatches) ||
                          (activeAthleteFamilyAssociationKey !== null && activeAthleteFamilyAssociationKey !== familyAssociationKey);
                        const archiveScope = {
                          organizationId,
                          locationId: selectedGroup.locationId,
                          groupId: selectedGroup.id,
                          athleteId: membership.athleteId,
                        };
                        const archiveEditorKey = `archive:${organizationId}:${selectedGroup.locationId}:${selectedGroup.id}:${membership.athleteId}`;
                        const archiveCommandMatches = pendingOwnerAthleteArchiveMatches(pendingAthleteArchive, archiveScope);
                        const archiveEditorDisabled = athleteArchiveEditorDisabled(archiveScope, archiveEditorKey) ||
                          (pendingAthleteArchive !== null && !archiveCommandMatches);
                        const profileScopeVersion = scopeVersionRef.current;
                        return (
                          <OwnerGroupMembershipRow
                            key={membership.id}
                            membership={membership}
                            organizationId={organizationId}
                            locationId={selectedGroup.locationId}
                            groupId={selectedGroup.id}
                            effectiveFrom={selectedToday}
                            allowExistingFamilies={bundle.member.locationScopeMode === "all"}
                            commandsLocked={commandsLocked}
                            writesBlocked={writesBlocked}
                            showProgress={progressAvailable}
                            profileEditorKey={profileEditorKey}
                            profileEditorDisabled={profileEditorDisabled}
                            pendingAthleteProfile={pendingAthleteProfile}
                            onProfileActiveChange={(active) => updateActiveAthleteProfile(profileEditorKey, active)}
                            onProfilePendingCommandChange={updatePendingAthleteProfile}
                            familyAssociationKey={familyAssociationKey}
                            familyAssociationEditorDisabled={familyAssociationEditorDisabled}
                            pendingAthleteFamilyAssociation={pendingAthleteFamilyAssociation}
                            onFamilyActiveChange={updateActiveAthleteFamilyAssociation}
                            onFamilyPendingCommandChange={updatePendingAthleteFamilyAssociation}
                            onSaved={() => {
                              if (scopeVersionRef.current === profileScopeVersion) router.refresh();
                            }}
                            showArchiveEditor={canManageAthleteArchive && archiveRecoveryReady &&
                              (pendingAthleteArchive === null || archiveCommandMatches)}
                            archiveEditorKey={archiveEditorKey}
                            archiveEditorDisabled={archiveEditorDisabled}
                            pendingAthleteArchive={pendingAthleteArchive}
                            onArchiveActiveChange={(active) => updateActiveAthleteArchive(archiveEditorKey, active)}
                            onArchivePendingCommandChange={updatePendingAthleteArchive}
                            onArchived={(receipt) => refreshAfterAthleteArchive(receipt, membership.athleteId)}
                            onChangeMembership={(toStatus) => void changeMembership(membership, toStatus)}
                          />
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
