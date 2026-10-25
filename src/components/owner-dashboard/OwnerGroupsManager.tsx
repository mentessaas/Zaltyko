"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Plus, Search, UsersRound } from "lucide-react";
import { groupCommandOutcome, uncertainGroupCommandMessage } from "./owner-group-command-response";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";
import { useOrganizationDraftField } from "./use-organization-draft-field";
import { OwnerOperationalReadOnlyNotice } from "./OwnerOperationalReadOnlyNotice";
import { useOwnerPlanPolicy } from "./owner-plan-usage-store";
import { ownerDashboardScopeHref } from "./owner-dashboard-scope-url";
import {
  clearPendingGroupAthleteCreate,
  decodeGroupAthleteRecovery,
  decodePendingGroupAthleteCreate,
  encodePendingGroupAthleteCreate,
  persistPendingGroupAthleteCreate,
  type GroupAthleteReceipt,
  type PendingGroupAthleteCreate,
} from "./owner-pending-group-athlete";
import {
  clearPendingGroupMembership,
  commandFromGroupMembershipSnapshot,
  persistPendingGroupMembership,
  readPendingGroupMembership,
  snapshotFromGroupMembershipCommand,
  type GroupMembershipCommand,
} from "./owner-pending-group-membership";

type GroupsBundle = Awaited<
  ReturnType<
    typeof import("@/modules/groups/application/group-management-service").getOwnerGroupsPageData
  >
>;

type Candidate = { id: string; name: string };
type GroupCreateField = "name" | "programId" | "locationId" | "capacity";
type GroupCreateFieldErrors = Partial<Record<GroupCreateField, string>>;
type GroupCreateValidationState = {
  fieldErrors: GroupCreateFieldErrors;
  summary: string;
};

const GROUP_CREATE_FIELD_ERROR_IDS: Record<GroupCreateField, string> = {
  name: "group-create-name-error",
  programId: "group-create-program-error",
  locationId: "group-create-location-error",
  capacity: "group-create-capacity-error",
};

const GROUP_CREATE_NATIVE_FIELD_ERRORS: Record<GroupCreateField, string> = {
  name: "Escribe el nombre del grupo.",
  programId: "Selecciona una actividad.",
  locationId: "Selecciona una sede.",
  capacity: "Introduce un número entero entre 1 y 5000.",
};

function summarizeGroupCreateFieldErrors(errors: GroupCreateFieldErrors): string {
  const fields = (Object.keys(GROUP_CREATE_FIELD_ERROR_IDS) as GroupCreateField[])
    .filter((field) => Boolean(errors[field]));
  return [...new Set(fields.map((field) => errors[field]).filter(Boolean))].join(" ");
}

type PendingMembershipCommand = GroupMembershipCommand | Readonly<{
  organizationId: string;
  groupId: string;
  kind: "create";
  endpoint: string;
  method: "POST";
  body: string;
  idempotencyKey: string;
}>;

type CreateAthleteRecoveryState = {
  scope: string;
  status: "checking" | "needs-input" | "complete" | "blocked" | "none";
  intent?: PendingGroupAthleteCreate;
  receipt?: GroupAthleteReceipt;
  detail?: string;
};

type GroupCreatePayload = {
  organizationId: string;
  locationId: string;
  programId: string;
  name: string;
  capacity: number | null;
};

type PendingGroupCreate = {
  version: 1;
  organizationId: string;
  idempotencyKey: string;
  body: string;
};

type PendingGroupCreateState =
  | {
      kind: "replayable";
      organizationId: string;
      command: PendingGroupCreate;
    }
  | { kind: "legacy"; organizationId: string }
  | { kind: "invalid"; organizationId: string }
  | { kind: "unavailable"; organizationId: string };

type PendingAthleteProfileUpdate = {
  organizationId: string;
  groupId: string;
  athleteId: string;
  idempotencyKey: string;
  body: string;
};

function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

function responseError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "No se pudo completar el cambio. Inténtalo de nuevo.";
  }
  const detail = "detail" in payload ? payload.detail : undefined;
  const message = "message" in payload ? payload.message : undefined;
  return typeof detail === "string"
    ? detail
    : typeof message === "string"
      ? message
      : "No se pudo completar el cambio. Inténtalo de nuevo.";
}

function parsePendingGroupCreate(
  value: string,
  organizationId: string
): PendingGroupCreate | null {
  try {
    const parsed = JSON.parse(value) as Partial<PendingGroupCreate>;
    if (
      parsed.version !== 1 ||
      parsed.organizationId !== organizationId ||
      typeof parsed.idempotencyKey !== "string" ||
      parsed.idempotencyKey.length === 0 ||
      typeof parsed.body !== "string"
    ) {
      return null;
    }
    const body = JSON.parse(parsed.body) as Partial<GroupCreatePayload>;
    if (
      body.organizationId !== organizationId ||
      typeof body.locationId !== "string" ||
      typeof body.programId !== "string" ||
      typeof body.name !== "string" ||
      !(body.capacity === null || typeof body.capacity === "number")
    ) {
      return null;
    }
    return {
      version: 1,
      organizationId,
      idempotencyKey: parsed.idempotencyKey,
      body: parsed.body,
    };
  } catch {
    return null;
  }
}

function readPendingGroupCreate(
  storageKey: string,
  legacyStorageKey: string,
  organizationId: string
): PendingGroupCreateState | null {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored !== null) {
      const command = parsePendingGroupCreate(stored, organizationId);
      return command
        ? { kind: "replayable", organizationId, command }
        : { kind: "invalid", organizationId };
    }
    return window.sessionStorage.getItem(legacyStorageKey)
      ? { kind: "legacy", organizationId }
      : null;
  } catch {
    return { kind: "unavailable", organizationId };
  }
}

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800";
const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

function statusLabel(status: string): string {
  if (status === "pending") return "Pendiente";
  if (status === "paused") return "En pausa";
  if (status === "ended") return "Finalizada";
  return "Activa";
}

export function OwnerGroupsManager({ bundle }: { bundle: GroupsBundle }) {
  const router = useRouter();
  const organizationId = bundle.organization.id;
  const planPolicy = useOwnerPlanPolicy(organizationId);
  const writesAllowed = planPolicy.status === "ready" && !planPolicy.readOnly;
  const writesBlocked = !writesAllowed;
  const membershipScope = `${organizationId}:${bundle.selectedGroupId ?? "none"}`;
  const defaultProgramId = bundle.programs[0]?.id ?? "";
  const defaultLocationId =
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
  const [candidateQuery, setCandidateQuery] = useOrganizationDraftField(membershipScope, "");
  const [candidates, setCandidates] = useOrganizationDraftField<Candidate[]>(membershipScope, []);
  const [newAthleteGivenName, setNewAthleteGivenName] = useOrganizationDraftField(membershipScope, "");
  const [newAthleteFamilyName, setNewAthleteFamilyName] = useOrganizationDraftField(membershipScope, "");
  const [busy, setBusy] = useState(false);
  const [pendingGroupCreate, setPendingGroupCreate] =
    useState<PendingGroupCreateState | null>(null);
  const [pendingGroupCreateLoadedFor, setPendingGroupCreateLoadedFor] =
    useState<string | null>(null);
  const [pendingGroupCreateReadAttempt, setPendingGroupCreateReadAttempt] = useState(0);
  const [error, setError] = useOrganizationDraftField(membershipScope, "");
  const [notice, setNotice] = useOrganizationDraftField(membershipScope, "");
  const groupCreateRequestRef = useRef(false);
  const pendingMembershipRef = useRef<PendingMembershipCommand | null>(null);
  const pendingAthleteProfileRef = useRef<PendingAthleteProfileUpdate | null>(null);
  const membershipSendingRef = useRef(false);
  const athleteProfileSendingRef = useRef(false);
  const membershipUncertainRef = useRef(false);
  const [pendingMembership, setPendingMembership] = useState<PendingMembershipCommand | null>(null);
  const [pendingAthleteProfile, setPendingAthleteProfile] = useState<PendingAthleteProfileUpdate | null>(null);
  const [editingAthleteId, setEditingAthleteId] = useState<string | null>(null);
  const [editingGivenName, setEditingGivenName] = useState("");
  const [editingFamilyName, setEditingFamilyName] = useState("");
  const [editingPreferredName, setEditingPreferredName] = useState("");
  const [membershipRecoveryLoadedFor, setMembershipRecoveryLoadedFor] = useState<string | null>(null);
  const [membershipRecoveryFailure, setMembershipRecoveryFailure] = useState<{ scope: string; message: string } | null>(null);
  const [foreignMembershipScope, setForeignMembershipScope] = useState<{ organizationId: string; groupId: string } | null>(null);
  const [membershipRecoveryAttempt, setMembershipRecoveryAttempt] = useState(0);
  const [createAthleteRecovery, setCreateAthleteRecovery] = useState<CreateAthleteRecoveryState | null>(null);
  const [createAthleteRecoveryAttempt, setCreateAthleteRecoveryAttempt] = useState(0);
  const retryMembershipRef = useRef<HTMLButtonElement | null>(null);
  const scopeVersionRef = useRef(0);
  useEffect(() => { scopeVersionRef.current += 1; }, [membershipScope]);
  usePendingCommandExitWarning(pendingMembership !== null, pendingMembershipRef);
  usePendingCommandExitWarning(pendingAthleteProfile !== null, pendingAthleteProfileRef);
  const selectedGroup = bundle.groups.find(
    (group) => group.id === bundle.selectedGroupId
  );
  const selectedToday = selectedGroup
    ? (bundle.localTodayByLocation[selectedGroup.locationId] ?? "")
    : "";
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
  const membershipRecoveryReady = membershipRecoveryLoadedFor === membershipScope && membershipRecoveryFailure?.scope !== membershipScope;
  const membershipRecoveryError = membershipRecoveryFailure?.scope === membershipScope ? membershipRecoveryFailure.message : "";
  const groupCreateLocked =
    busy || editingAthleteId !== null || !groupCreateScopeLoaded || !membershipRecoveryReady || membershipRecoveryError !== "" || currentPendingGroupCreate !== null || pendingMembership !== null || pendingAthleteProfile !== null || foreignMembershipScope !== null || writesBlocked;
  const commandsLocked = busy || editingAthleteId !== null || !membershipRecoveryReady || membershipRecoveryError !== "" || pendingMembership !== null || pendingAthleteProfile !== null || foreignMembershipScope !== null || currentPendingGroupCreate !== null;
  const canRetryMembership = pendingMembership?.organizationId === organizationId && pendingMembership.groupId === bundle.selectedGroupId;
  const scopedCreateAthleteRecovery = createAthleteRecovery?.scope === membershipScope ? createAthleteRecovery : null;
  const createAthleteBlocked = !scopedCreateAthleteRecovery ||
    ["checking", "complete", "blocked"].includes(scopedCreateAthleteRecovery.status);
  const createStorageKey = `zaltyko:pending-group-create:v2:${organizationId}`;
  const legacyCreateStorageKey = `zaltyko:pending-group-create:${organizationId}`;
  const createAthleteStorageKey = `zaltyko:pending-group-athlete:${organizationId}:${bundle.selectedGroupId ?? "none"}`;

  useEffect(() => {
    if (canRetryMembership && !busy) retryMembershipRef.current?.focus();
  }, [canRetryMembership, pendingMembership, busy]);

  useEffect(() => {
    let result: ReturnType<typeof readPendingGroupMembership>;
    try { result = readPendingGroupMembership(window.sessionStorage); }
    catch { result = { status: "unavailable" }; }
    if (result.status === "invalid" || result.status === "unavailable") {
      setMembershipRecoveryFailure({
        scope: membershipScope,
        message: result.status === "invalid"
          ? "Hay una operación de pertenencia local dañada. No se permitirán cambios hasta recuperar su estado."
          : "No se pudo consultar el almacenamiento de esta sesión. No se permitirán cambios hasta poder verificar la operación pendiente.",
      });
      setForeignMembershipScope(null);
      setMembershipRecoveryLoadedFor(membershipScope);
      return;
    }
    setMembershipRecoveryFailure(null);
    if (result.status === "pending") {
      const snapshot = result.snapshot;
      if (snapshot.organizationId === organizationId && snapshot.groupId === (bundle.selectedGroupId ?? "")) {
        const restored = commandFromGroupMembershipSnapshot(snapshot);
        pendingMembershipRef.current = restored;
        membershipUncertainRef.current = true;
        setPendingMembership(restored);
        setForeignMembershipScope(null);
      } else {
        setForeignMembershipScope({ organizationId: snapshot.organizationId, groupId: snapshot.groupId });
      }
    } else {
      setForeignMembershipScope(null);
      if (pendingMembershipRef.current === null) {
        membershipUncertainRef.current = false;
        setPendingMembership(null);
      }
    }
    setMembershipRecoveryLoadedFor(membershipScope);
  }, [organizationId, bundle.selectedGroupId, membershipScope, membershipRecoveryAttempt]);

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

  useEffect(() => {
    const controller = new AbortController();
    const recoveryScope = membershipScope;
    const blockRecovery = (detail: string) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!controller.signal.aborted) setCreateAthleteRecovery({ scope: recoveryScope, status: "blocked", detail });
    };
    try {
      const raw = window.sessionStorage.getItem(createAthleteStorageKey);
      const intent = decodePendingGroupAthleteCreate(raw, organizationId, bundle.selectedGroupId ?? "");
      if (intent === false) {
        blockRecovery("No se pudo validar el marcador local del alta. No se enviará otra solicitud.");
      } else if (!intent) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCreateAthleteRecovery({ scope: recoveryScope, status: "none" });
      } else {
        const encoded = encodePendingGroupAthleteCreate(intent);
        if (raw !== encoded && !persistPendingGroupAthleteCreate(window.sessionStorage, createAthleteStorageKey, intent)) {
          blockRecovery("No se pudo migrar y verificar la clave anterior. No se enviará otra solicitud.");
        } else {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCreateAthleteRecovery({ scope: recoveryScope, status: "checking", intent });
          const params = new URLSearchParams({ organizationId, idempotencyKey: intent.idempotencyKey });
          void fetch(`/api/v1/owner/groups/${intent.groupId}/memberships/receipt?${params}`, {
            cache: "no-store",
            signal: controller.signal,
          }).then(async (response) => {
            const payload = await response.json().catch(() => null);
            if (controller.signal.aborted) return;
            const recovery = response.ok ? decodeGroupAthleteRecovery(payload) : null;
            if (!recovery) {
              blockRecovery("No se pudo verificar el recibo. La operación permanece bloqueada para evitar duplicados.");
            } else if (recovery.status === "none") {
              setCreateAthleteRecovery({ scope: recoveryScope, status: "needs-input", intent });
            } else if (recovery.receipt.groupId !== intent.groupId) {
              blockRecovery("El recibo pertenece a otro grupo. No se enviará otra solicitud.");
            } else {
              setCreateAthleteRecovery({ scope: recoveryScope, status: "complete", intent, receipt: recovery.receipt });
            }
          }).catch(() => {
            blockRecovery("No se pudo consultar el recibo. Vuelve a intentarlo cuando haya conexión.");
          });
        }
      }
    } catch {
      blockRecovery("No se pudo leer el almacenamiento de la operación pendiente.");
    }
    return () => controller.abort();
  }, [organizationId, bundle.selectedGroupId, membershipScope, createAthleteStorageKey, createAthleteRecoveryAttempt]);

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

  function groupHref(groupId?: string, nextLocationId?: string) {
    const params = new URLSearchParams({ organizationId });
    if (nextLocationId) params.set("locationId", nextLocationId);
    if (groupId) params.set("groupId", groupId);
    return `/owner/groups?${params.toString()}`;
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

  function toggleGroupCreateForm() {
    if (createOpen) {
      setCreateOpen(false);
      setGroupCreateValidation({ fieldErrors: {}, summary: "" });
    } else if (writesAllowed) {
      setCreateOpen(true);
    }
  }

  async function sendGroupCreate(command: PendingGroupCreate, previouslyUncertain = false) {
    if (
      command.organizationId !== organizationId ||
      groupCreateRequestRef.current || membershipSendingRef.current || pendingMembershipRef.current
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
        router.push(groupHref(outcome.id, outcome.locationId));
        router.refresh();
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

  function clearCreateAthleteIntent(
    intent: PendingGroupAthleteCreate,
    receipt?: GroupAthleteReceipt
  ) {
    try {
      if (clearPendingGroupAthleteCreate(window.sessionStorage, createAthleteStorageKey, intent)) {
        setCreateAthleteRecovery({ scope: membershipScope, status: "none" });
        return true;
      }
    } catch {
      // Preserve the receipt and block another operation when storage is unreadable.
    }
    if (receipt) {
      setCreateAthleteRecovery({ scope: membershipScope, status: "complete", intent, receipt });
    } else {
      setCreateAthleteRecovery({
        scope: membershipScope,
        status: "blocked",
        detail: "El servidor confirmó que no se creó la ficha, pero no se pudo limpiar su clave pendiente. No generaremos otra clave.",
      });
    }
    return false;
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      writesBlocked ||
      currentPendingGroupCreate ||
      pendingMembershipRef.current || membershipSendingRef.current ||
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
    if (commandsLocked || pendingMembershipRef.current || membershipSendingRef.current || groupCreateRequestRef.current) return;
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
      pendingAthleteProfileRef.current !== null || athleteProfileSendingRef.current ||
      !membershipRecoveryReady || membershipRecoveryError !== "" || foreignMembershipScope !== null ||
      currentPendingGroupCreate ||
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
        setError("No se pudo guardar la clave idempotente. No se ha enviado el cambio.");
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
        setError("El servidor respondió, pero no se pudo verificar la limpieza del reintento. Conservamos la misma operación para volver a comprobarla.");
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
            detail: "El servidor confirmó el alta, pero el recibo no pudo validarse. No se enviará otra solicitud.",
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
    return writesBlocked || !membershipRecoveryReady || membershipRecoveryError !== "" || foreignMembershipScope !== null || busy || editingAthleteId !== null || pendingMembershipRef.current !== null || membershipSendingRef.current || pendingAthleteProfileRef.current !== null || athleteProfileSendingRef.current || groupCreateRequestRef.current || currentPendingGroupCreate !== null;
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

  function beginAthleteProfileEdit(
    membership: GroupsBundle["memberships"][number]
  ) {
    if (commandsLocked || writesBlocked || !membership.profileVersion) return;
    setError("");
    setNotice("");
    setEditingAthleteId(membership.athleteId);
    setEditingGivenName(membership.givenName);
    setEditingFamilyName(membership.familyName);
    setEditingPreferredName(membership.preferredName ?? "");
  }

  async function sendAthleteProfileUpdate(
    command: PendingAthleteProfileUpdate,
    allowReplay = false
  ) {
    const pending = pendingAthleteProfileRef.current;
    if (
      !selectedGroup ||
      command.organizationId !== organizationId ||
      command.groupId !== selectedGroup.id ||
      (pending !== null && pending !== command) ||
      athleteProfileSendingRef.current ||
      busy ||
      !membershipRecoveryReady ||
      membershipRecoveryError !== "" ||
      foreignMembershipScope !== null ||
      pendingMembershipRef.current !== null ||
      membershipSendingRef.current ||
      groupCreateRequestRef.current ||
      currentPendingGroupCreate !== null ||
      (!allowReplay && writesBlocked)
    ) {
      return;
    }

    athleteProfileSendingRef.current = true;
    const scopeVersion = scopeVersionRef.current;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/owner/groups/${command.groupId}/athletes/${command.athleteId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": command.idempotencyKey,
          },
          body: command.body,
        }
      );
      const payload = await response.json().catch(() => null);
      const receipt = responseData<{
        athleteId: string;
        givenName: string;
        familyName: string;
        preferredName: string | null;
        profileVersion: string;
      }>(payload);
      if (
        response.ok &&
        receipt?.athleteId === command.athleteId &&
        typeof receipt.givenName === "string" &&
        typeof receipt.familyName === "string" &&
        (typeof receipt.preferredName === "string" || receipt.preferredName === null) &&
        typeof receipt.profileVersion === "string"
      ) {
        pendingAthleteProfileRef.current = null;
        setPendingAthleteProfile(null);
        setEditingAthleteId(null);
        setNotice("Datos de la ficha actualizados.");
        if (scopeVersionRef.current === scopeVersion) router.refresh();
        return;
      }

      if (response.status >= 500 || response.status === 408 || response.ok) {
        setError(
          "No sabemos si se guardó la edición. Reintenta la misma operación para confirmar el resultado; no vuelvas a introducir los datos."
        );
        return;
      }

      pendingAthleteProfileRef.current = null;
      setPendingAthleteProfile(null);
      if (response.status === 409 && scopeVersionRef.current === scopeVersion) {
        router.refresh();
      }
      setError(responseError(payload));
    } catch {
      setError(
        "No sabemos si se guardó la edición. Reintenta la misma operación para confirmar el resultado; no vuelvas a introducir los datos."
      );
    } finally {
      athleteProfileSendingRef.current = false;
      setBusy(false);
    }
  }

  function submitAthleteProfileEdit(
    event: FormEvent<HTMLFormElement>,
    membership: GroupsBundle["memberships"][number]
  ) {
    event.preventDefault();
    if (!selectedGroup) return;
    const pending = pendingAthleteProfileRef.current;
    if (pending) {
      if (
        pending.organizationId === organizationId &&
        pending.groupId === selectedGroup.id &&
        pending.athleteId === membership.athleteId
      ) {
        void sendAthleteProfileUpdate(pending, true);
      }
      return;
    }
    if (
      writesBlocked ||
      !membershipRecoveryReady ||
      membershipRecoveryError !== "" ||
      foreignMembershipScope !== null ||
      busy ||
      pendingMembershipRef.current !== null ||
      membershipSendingRef.current ||
      groupCreateRequestRef.current ||
      currentPendingGroupCreate !== null
    ) return;

    const givenName = editingGivenName.trim();
    const familyName = editingFamilyName.trim();
    const preferredName = editingPreferredName.trim() || null;
    if (!givenName || !familyName) {
      setError("Indica el nombre y los apellidos.");
      return;
    }
    const command: PendingAthleteProfileUpdate = {
      organizationId,
      groupId: selectedGroup.id,
      athleteId: membership.athleteId,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        organizationId,
        givenName,
        familyName,
        preferredName,
        expectedProfileVersion: membership.profileVersion,
      }),
    };
    pendingAthleteProfileRef.current = command;
    setPendingAthleteProfile(command);
    void sendAthleteProfileUpdate(command);
  }

  return (
    <main className="min-h-[100dvh] bg-[#F1F3EF] px-4 py-6 text-slate-950 sm:px-6 lg:px-10">
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
          className="touch-target inline-flex items-center gap-2 text-sm font-semibold text-slate-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al resumen
        </Link>
        <header className="mt-5 flex flex-col gap-4 border-b border-slate-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Grupos y equipos
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Organiza cada actividad por sede. Una gimnasta puede pertenecer a
              varios grupos.
            </p>
          </div>
          <button
            type="button"
            className={primaryButtonClassName}
            disabled={(!writesAllowed && !createOpen) || busy || !groupCreateScopeLoaded || !membershipRecoveryReady || membershipRecoveryError !== "" || currentPendingGroupCreate !== null || pendingMembership !== null || foreignMembershipScope !== null}
            onClick={toggleGroupCreateForm}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {createOpen ? "Cerrar formulario" : "Crear grupo"}
          </button>
        </header>

        <OwnerOperationalReadOnlyNotice organizationId={organizationId} />

        {membershipRecoveryFailure?.scope === membershipScope && (
          <section role="alert" className="mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-slate-950">
            <p>{membershipRecoveryFailure.message}</p>
            <button type="button" className={`${secondaryButtonClassName} mt-3`} onClick={() => setMembershipRecoveryAttempt((attempt) => attempt + 1)}>
              Volver a comprobar operación pendiente
            </button>
          </section>
        )}
        {foreignMembershipScope && !pendingMembership && (
          <p role="status" className="mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-slate-950">
            Hay un cambio de pertenencia pendiente en otra academia o grupo. No iniciaremos otra escritura hasta resolverlo.{" "}
            <Link className="font-bold underline" href={`/owner/groups?organizationId=${encodeURIComponent(foreignMembershipScope.organizationId)}&groupId=${encodeURIComponent(foreignMembershipScope.groupId)}`}>
              Volver al grupo original
            </Link>
          </p>
        )}

        {!groupCreateScopeLoaded && (
          <p role="status" className="mt-5 text-sm text-slate-700">
            Comprobando si hay una creación pendiente…
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-5 border border-red-700 bg-red-50 p-3 text-sm text-red-950"
          >
            {error}
          </p>
        )}
        {groupCreateValidationSummary && (
          <p
            role="alert"
            className="mt-5 border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950"
          >
            {groupCreateValidationSummary}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mt-5 border border-teal-700 bg-white p-3 text-sm text-slate-900"
          >
            {notice}
          </p>
        )}

        {pendingMembership && (
          <section
            role="status"
            aria-labelledby="pending-membership-title"
            className="mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-slate-950"
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
              onClick={() => void sendMembershipCommand(pendingMembership)}
            >
              {busy ? "Comprobando resultado…" : "Reintentar operación pendiente"}
            </button>
          </section>
        )}

        {currentPendingGroupCreate && (
          <section
            aria-labelledby="pending-group-create-title"
            className="mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-slate-950"
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
                  disabled={busy}
                  onClick={retryPendingGroupCreate}
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
                    onClick={() =>
                      setPendingGroupCreateReadAttempt((attempt) => attempt + 1)
                    }
                  >
                    Volver a comprobar borrador
                  </button>
                ) : (
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={() => router.refresh()}
                  >
                    Actualizar lista de grupos
                  </button>
                )}
                <Link
                  href="/contact?type=support"
                  className="touch-target inline-flex min-h-11 items-center font-semibold text-teal-900 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800"
                >
                  Contactar soporte
                </Link>
              </div>
            )}
          </section>
        )}

        {createOpen && groupCreateScopeLoaded && (
          <section
            aria-labelledby="create-group-title"
            className="mt-6 border border-slate-300 bg-white p-5 sm:p-6"
          >
            <h2 id="create-group-title" className="text-xl font-bold">
              Crear un grupo
            </h2>
            {bundle.programs.length === 0 || bundle.locations.length === 0 ? (
              <p className="mt-3 text-sm text-slate-700">
                Para crear un grupo hace falta al menos una actividad y una sede
                activa en la academia.
              </p>
            ) : (
              <form
                className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                onSubmit={createGroup}
                onInvalidCapture={markNativeGroupCreateFieldInvalid}
              >
                <label className="block text-sm font-semibold">
                  Nombre del grupo
                  <input
                    id="group-create-name"
                    className={`${fieldClassName} mt-2`}
                    value={groupName}
                    disabled={groupCreateLocked}
                    onChange={(event) => {
                      setGroupName(event.target.value);
                      clearGroupCreateFieldError("name");
                    }}
                    maxLength={120}
                    required
                    aria-invalid={groupCreateFieldErrors.name ? true : undefined}
                    aria-describedby={
                      groupCreateFieldErrors.name
                        ? GROUP_CREATE_FIELD_ERROR_IDS.name
                        : undefined
                    }
                  />
                </label>
                {groupCreateFieldErrors.name && (
                  <span id={GROUP_CREATE_FIELD_ERROR_IDS.name} className="sr-only">
                    {groupCreateFieldErrors.name}
                  </span>
                )}
                <label className="block text-sm font-semibold">
                  Actividad
                  <select
                    id="group-create-program"
                    className={`${fieldClassName} mt-2`}
                    value={programId}
                    disabled={groupCreateLocked}
                    onChange={(event) => {
                      setProgramId(event.target.value);
                      clearGroupCreateFieldError("programId");
                    }}
                    required
                    aria-invalid={groupCreateFieldErrors.programId ? true : undefined}
                    aria-describedby={
                      groupCreateFieldErrors.programId
                        ? GROUP_CREATE_FIELD_ERROR_IDS.programId
                        : undefined
                    }
                  >
                    {bundle.programs.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                </label>
                {groupCreateFieldErrors.programId && (
                  <span id={GROUP_CREATE_FIELD_ERROR_IDS.programId} className="sr-only">
                    {groupCreateFieldErrors.programId}
                  </span>
                )}
                <label className="block text-sm font-semibold">
                  Sede
                  <select
                    id="group-create-location"
                    className={`${fieldClassName} mt-2`}
                    value={locationId}
                    disabled={groupCreateLocked}
                    onChange={(event) => {
                      setLocationId(event.target.value);
                      clearGroupCreateFieldError("locationId");
                    }}
                    required
                    aria-invalid={groupCreateFieldErrors.locationId ? true : undefined}
                    aria-describedby={
                      groupCreateFieldErrors.locationId
                        ? GROUP_CREATE_FIELD_ERROR_IDS.locationId
                        : undefined
                    }
                  >
                    {bundle.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                {groupCreateFieldErrors.locationId && (
                  <span id={GROUP_CREATE_FIELD_ERROR_IDS.locationId} className="sr-only">
                    {groupCreateFieldErrors.locationId}
                  </span>
                )}
                <label className="block text-sm font-semibold">
                  Plazas (opcional)
                  <input
                    id="group-create-capacity"
                    className={`${fieldClassName} mt-2`}
                    disabled={groupCreateLocked}
                    type="number"
                    min="1"
                    max="5000"
                    step="1"
                    inputMode="numeric"
                    value={capacity}
                    onChange={(event) => {
                      setCapacity(event.target.value);
                      clearGroupCreateFieldError("capacity");
                    }}
                    aria-invalid={groupCreateFieldErrors.capacity ? true : undefined}
                    aria-describedby={
                      groupCreateFieldErrors.capacity
                        ? GROUP_CREATE_FIELD_ERROR_IDS.capacity
                        : undefined
                    }
                  />
                </label>
                {groupCreateFieldErrors.capacity && (
                  <span id={GROUP_CREATE_FIELD_ERROR_IDS.capacity} className="sr-only">
                    {groupCreateFieldErrors.capacity}
                  </span>
                )}
                <div className="sm:col-span-2 lg:col-span-4">
                  <button
                    type="submit"
                    className={primaryButtonClassName}
                    disabled={groupCreateLocked}
                  >
                    {busy ? "Guardando…" : "Guardar grupo"}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <nav
            aria-label="Grupos de la academia"
            className="border border-slate-300 bg-white p-4"
          >
            <h2 className="mb-3 text-sm font-bold">Grupos de la academia</h2>
            {bundle.groups.length === 0 ? (
              <p className="text-sm leading-6 text-slate-700">
                Todavía no hay grupos. Crea uno y asígnalo a una actividad y a
                una sede.
              </p>
            ) : (
              <ul className="space-y-1">
                {bundle.groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      href={groupHref(group.id, group.locationId)}
                      aria-disabled={commandsLocked}
                      tabIndex={commandsLocked ? -1 : undefined}
                      onClick={(event) => {
                        if (commandsLocked) event.preventDefault();
                      }}
                      aria-current={
                        group.id === selectedGroup?.id ? "page" : undefined
                      }
                      className={`touch-target flex min-h-14 items-center justify-between gap-3 border-l-4 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 ${group.id === selectedGroup?.id ? "border-teal-800 bg-teal-50" : "border-transparent hover:bg-slate-50"}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {group.name}
                        </span>
                        <span className="block truncate text-xs text-slate-600">
                          {group.programName ?? "Actividad sin clasificar"} ·{" "}
                          {group.locationName}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-700">
                        {group.memberCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          <section
            aria-labelledby="selected-group-title"
            className="min-w-0 border border-slate-300 bg-white p-4 sm:p-6"
          >
            {!selectedGroup ? (
              <div className="py-8 text-center">
                <UsersRound
                  className="mx-auto h-8 w-8 text-slate-500"
                  aria-hidden="true"
                />
                <h2 className="mt-3 text-lg font-bold">Aún no hay grupos</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-700">
                  Crea el primero para organizar las actividades de tu academia.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 border-b border-slate-300 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2
                      id="selected-group-title"
                      className="text-2xl font-bold"
                    >
                      {selectedGroup.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-700">
                      {selectedGroup.programName ?? "Actividad sin clasificar"}{" "}
                      · {selectedGroup.locationName}
                    </p>
                  </div>
                  <span className="inline-flex min-h-9 items-center border border-slate-300 px-3 text-sm font-semibold">
                    {selectedGroup.memberCount} de{" "}
                    {selectedGroup.capacity ?? "∞"} plazas
                  </span>
                </div>

                {selectedGroup.status !== "active" ? (
                  <p className="mt-4 border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">
                    Este grupo no está activo. Puedes consultar sus
                    pertenencias, pero no añadir gimnastas.
                  </p>
                ) : (
                  <>
                    <form className="mt-5" onSubmit={searchAthletes}>
                      <label
                        htmlFor="athlete-search"
                        className="block text-sm font-bold"
                      >
                        Añadir una gimnasta
                      </label>
                      <p className="mt-1 text-xs text-slate-600">
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
                            setCandidateQuery(event.target.value)
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
                        <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
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
                                onClick={() => void addAthlete(candidate.id)}
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Añadir
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </form>
                    <details className="mt-4 border-t border-slate-200 pt-4">
                      <summary className="touch-target inline-flex min-h-11 cursor-pointer items-center font-semibold text-teal-900 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800">
                        ¿No aparece? Crear ficha y añadir
                      </summary>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                        Busca primero para evitar duplicados. Solo pedimos
                        nombre y apellidos; no crea una cuenta familiar ni un
                        cobro.
                      </p>
                      {scopedCreateAthleteRecovery?.status === "checking" && (
                        <p role="status" className="mt-3 border border-amber-700 bg-amber-50 p-3 text-sm">
                          Comprobando el recibo del alta pendiente. No se enviará otra operación mientras se valida.
                        </p>
                      )}
                      {scopedCreateAthleteRecovery?.status === "needs-input" && (
                        <p role="status" className="mt-3 border border-amber-700 bg-amber-50 p-3 text-sm">
                          No aparece ningún recibo para la clave pendiente. Reintroduce exactamente el mismo nombre y apellidos para reintentar; se conservará la misma clave y no se creará otra.
                        </p>
                      )}
                      {scopedCreateAthleteRecovery?.status === "complete" && scopedCreateAthleteRecovery.receipt && (
                        <div role="status" className="mt-3 border border-teal-700 bg-teal-50 p-3 text-sm">
                          <p>El recibo confirma el alta y la pertenencia al grupo. Estado actual: {statusLabel(scopedCreateAthleteRecovery.receipt.status)}.</p>
                          <button type="button" disabled={commandsLocked} className={`${secondaryButtonClassName} mt-3`} onClick={confirmRecoveredAthleteReceipt}>
                            Confirmar resultado y limpiar clave pendiente
                          </button>
                        </div>
                      )}
                      {scopedCreateAthleteRecovery?.status === "blocked" && (
                        <div role="alert" className="mt-3 border border-amber-700 bg-amber-50 p-3 text-sm">
                          <p>{scopedCreateAthleteRecovery.detail ?? "No se pudo validar el alta anterior. No se enviará otra operación."}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button type="button" disabled={commandsLocked} className={secondaryButtonClassName} onClick={() => setCreateAthleteRecoveryAttempt((attempt) => attempt + 1)}>Reintentar comprobación</button>
                            <button type="button" disabled={commandsLocked} className={secondaryButtonClassName} onClick={() => router.refresh()}>Actualizar pertenencias</button>
                            <Link href="/contact?type=support" aria-disabled={commandsLocked} tabIndex={commandsLocked ? -1 : undefined}
                              onClick={(event) => { if (commandsLocked) event.preventDefault(); }}
                              className="touch-target inline-flex min-h-11 items-center font-semibold text-teal-900 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800">Contactar soporte</Link>
                          </div>
                        </div>
                      )}
                      <form
                        className="mt-4 grid gap-4 sm:grid-cols-2"
                        onSubmit={createAthleteForGroup}
                      >
                        <label className="block text-sm font-semibold">
                          Nombre
                          <input
                            className={`${fieldClassName} mt-2`}
                            value={newAthleteGivenName}
                            disabled={commandsLocked || createAthleteBlocked || writesBlocked}
                            onChange={(changeEvent) => {
                              setNewAthleteGivenName(changeEvent.target.value);
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
                              setNewAthleteFamilyName(changeEvent.target.value);
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
                  </>
                )}

                <div className="mt-7">
                  <h3 className="text-lg font-bold">Pertenencias actuales</h3>
                  {bundle.memberships.length === 0 ? (
                    <p className="mt-3 border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
                      {selectedGroup.status === "active"
                        ? "Este grupo todavía no tiene gimnastas. Puedes añadir una ficha activa desde el buscador."
                        : "Este grupo no tiene pertenencias actuales. Está inactivo y no admite nuevas gimnastas."}
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                      {bundle.memberships.map((membership) => (
                        <li
                          key={membership.id}
                          className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-semibold">
                              {membership.athleteName}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {statusLabel(membership.status)} desde{" "}
                              {membership.startsOn}
                            </p>
                            {editingAthleteId === membership.athleteId && (
                              <form
                                className="mt-4 grid gap-3 border-l-2 border-teal-800 pl-4 sm:grid-cols-2"
                                aria-label={`Editar datos de ${membership.athleteName}`}
                                onSubmit={(event) => submitAthleteProfileEdit(event, membership)}
                              >
                                <p className="text-sm leading-6 text-slate-700 sm:col-span-2">
                                  El nombre preferido es el que se muestra en los grupos. El cambio afecta a esta ficha en toda la academia y no modifica la familia asociada.
                                </p>
                                <label className="block text-sm font-semibold">
                                  Nombre de {membership.athleteName}
                                  <input
                                    className={`${fieldClassName} mt-2`}
                                    value={editingGivenName}
                                    disabled={busy || writesBlocked || pendingAthleteProfile !== null}
                                    onChange={(event) => setEditingGivenName(event.target.value)}
                                    maxLength={100}
                                    autoComplete="given-name"
                                    required
                                  />
                                </label>
                                <label className="block text-sm font-semibold">
                                  Apellidos de {membership.athleteName}
                                  <input
                                    className={`${fieldClassName} mt-2`}
                                    value={editingFamilyName}
                                    disabled={busy || writesBlocked || pendingAthleteProfile !== null}
                                    onChange={(event) => setEditingFamilyName(event.target.value)}
                                    maxLength={100}
                                    autoComplete="family-name"
                                    required
                                  />
                                </label>
                                <label className="block text-sm font-semibold sm:col-span-2">
                                  Nombre preferido de {membership.athleteName} (opcional)
                                  <input
                                    className={`${fieldClassName} mt-2`}
                                    value={editingPreferredName}
                                    disabled={busy || writesBlocked || pendingAthleteProfile !== null}
                                    onChange={(event) => setEditingPreferredName(event.target.value)}
                                    maxLength={100}
                                    autoComplete="nickname"
                                  />
                                </label>
                                <div className="flex flex-wrap gap-2 sm:col-span-2">
                                  <button
                                    type="submit"
                                    className={primaryButtonClassName}
                                    disabled={busy || (!pendingAthleteProfile && (writesBlocked || !membershipRecoveryReady || membershipRecoveryError !== "" || foreignMembershipScope !== null || pendingMembership !== null || currentPendingGroupCreate !== null))}
                                  >
                                    {pendingAthleteProfile
                                      ? busy
                                        ? "Guardando…"
                                        : "Reintentar el mismo guardado"
                                      : busy
                                        ? "Guardando…"
                                        : "Guardar cambios"}
                                  </button>
                                  {!pendingAthleteProfile && (
                                    <button
                                      type="button"
                                      className={secondaryButtonClassName}
                                      disabled={busy}
                                      onClick={() => setEditingAthleteId(null)}
                                    >
                                      Cancelar
                                    </button>
                                  )}
                                </div>
                                {pendingAthleteProfile && (
                                  <p className="text-sm text-amber-950 sm:col-span-2" role="status">
                                    Conservamos la misma operación en esta sesión hasta confirmar su resultado.
                                  </p>
                                )}
                              </form>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {editingAthleteId !== membership.athleteId && (
                              <button
                                type="button"
                                className={secondaryButtonClassName}
                                aria-label={`Editar datos de ${membership.athleteName}`}
                                disabled={commandsLocked || writesBlocked || !membership.profileVersion}
                                onClick={() => beginAthleteProfileEdit(membership)}
                              >
                                Editar datos
                              </button>
                            )}
                            {editingAthleteId !== membership.athleteId && membership.status === "pending" && (
                              <button
                                type="button"
                                className={secondaryButtonClassName}
                                aria-label={`Activar a ${membership.athleteName}`}
                                disabled={commandsLocked || writesBlocked}
                                onClick={() =>
                                  void changeMembership(membership, "active")
                                }
                              >
                                <Check className="h-4 w-4" aria-hidden="true" />
                                Activar
                              </button>
                            )}
                            {editingAthleteId !== membership.athleteId && membership.status === "active" && (
                              <button
                                type="button"
                                className={secondaryButtonClassName}
                                aria-label={`Poner en pausa a ${membership.athleteName}`}
                                disabled={commandsLocked || writesBlocked}
                                onClick={() =>
                                  void changeMembership(membership, "paused")
                                }
                              >
                                Poner en pausa
                              </button>
                            )}
                            {editingAthleteId !== membership.athleteId && membership.status === "paused" && (
                              <button
                                type="button"
                                className={secondaryButtonClassName}
                                aria-label={`Reactivar a ${membership.athleteName}`}
                                disabled={commandsLocked || writesBlocked}
                                onClick={() =>
                                  void changeMembership(membership, "active")
                                }
                              >
                                Reactivar
                              </button>
                            )}
                            {editingAthleteId !== membership.athleteId && <button
                              type="button"
                              className="touch-target inline-flex min-h-11 items-center justify-center border border-red-700 bg-white px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-800 disabled:opacity-50"
                              aria-label={`Dar de baja a ${membership.athleteName}`}
                              disabled={commandsLocked || writesBlocked}
                              onClick={() =>
                                void changeMembership(membership, "ended")
                              }
                            >
                              Dar de baja
                            </button>}
                          </div>
                        </li>
                      ))}
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
