"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { OwnerGuardianContactsEditor } from "@/components/owner-dashboard/OwnerGuardianContactsEditor";

export const PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY =
  "zaltyko:pending-owner-athlete-family-association:v1";

export type OwnerAthleteFamilyAssociationBody = Readonly<{
  organizationId: string;
  locationId: string;
  familyId?: string;
  athleteIds: readonly [string];
  effectiveFrom: string;
  payer:
    | Readonly<{ familyPayerId: string; confirmPrimaryPayerChange?: boolean }>
    | Readonly<{
        givenName: string;
        familyName: string;
        relationship: "parent" | "legal_guardian" | "foster_guardian" | "other";
      }>;
}>;

export type PendingOwnerAthleteFamilyAssociation = Readonly<{
  version: 1;
  organizationId: string;
  locationId: string;
  groupId: string;
  athleteId: string;
  idempotencyKey: string;
  body: string;
}>;

export type PendingOwnerAthleteFamilyAssociationRead =
  | { kind: "none" }
  | { kind: "pending"; command: PendingOwnerAthleteFamilyAssociation }
  | { kind: "invalid" }
  | { kind: "unavailable" };

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type FamilyRelationship = "parent" | "legal_guardian" | "foster_guardian" | "other";
type FamilyPayerOption = {
  familyPayerId: string;
  guardianId?: string;
  displayName: string | null;
  isPrimary: boolean;
};
type FamilyOption = {
  familyId: string;
  athletes: Array<{ athleteId: string; athleteName: string | null }>;
  payers: FamilyPayerOption[];
};
type AssociationReceipt = { familyId: string; familyPayerId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isDateValue(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function decodeAssociationBody(
  raw: string,
  command: Pick<PendingOwnerAthleteFamilyAssociation, "organizationId" | "locationId" | "athleteId">
): OwnerAthleteFamilyAssociationBody | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const hasFamilyId = Object.hasOwn(value, "familyId");
    if (!exactKeys(value, hasFamilyId
      ? ["organizationId", "locationId", "familyId", "athleteIds", "effectiveFrom", "payer"]
      : ["organizationId", "locationId", "athleteIds", "effectiveFrom", "payer"])) return null;
    if (
      value.organizationId !== command.organizationId ||
      value.locationId !== command.locationId ||
      (hasFamilyId && !isUuid(value.familyId)) ||
      !Array.isArray(value.athleteIds) || value.athleteIds.length !== 1 ||
      value.athleteIds[0] !== command.athleteId ||
      !isDateValue(value.effectiveFrom) ||
      !isRecord(value.payer)
    ) return null;

    const payer = value.payer;
    if (hasFamilyId && Object.hasOwn(payer, "familyPayerId")) {
      const hasPayerConfirmation = Object.hasOwn(payer, "confirmPrimaryPayerChange");
      if (!exactKeys(payer, hasPayerConfirmation
        ? ["familyPayerId", "confirmPrimaryPayerChange"]
        : ["familyPayerId"]) ||
        !isUuid(payer.familyPayerId) ||
        (hasPayerConfirmation && typeof payer.confirmPrimaryPayerChange !== "boolean")) return null;
      return {
        organizationId: command.organizationId,
        locationId: command.locationId,
        familyId: value.familyId as string,
        athleteIds: [command.athleteId],
        effectiveFrom: value.effectiveFrom,
        payer: {
          familyPayerId: payer.familyPayerId,
          ...(hasPayerConfirmation ? { confirmPrimaryPayerChange: payer.confirmPrimaryPayerChange as boolean } : {}),
        },
      };
    }

    if (
      !exactKeys(payer, ["givenName", "familyName", "relationship"]) ||
      typeof payer.givenName !== "string" || payer.givenName.trim().length === 0 ||
      payer.givenName.length > 100 ||
      typeof payer.familyName !== "string" || payer.familyName.trim().length === 0 ||
      payer.familyName.length > 100 ||
      !["parent", "legal_guardian", "foster_guardian", "other"].includes(String(payer.relationship))
    ) return null;
    return {
      organizationId: command.organizationId,
      locationId: command.locationId,
      ...(hasFamilyId ? { familyId: value.familyId as string } : {}),
      athleteIds: [command.athleteId],
      effectiveFrom: value.effectiveFrom,
      payer: {
        givenName: payer.givenName,
        familyName: payer.familyName,
        relationship: payer.relationship as FamilyRelationship,
      },
    };
  } catch {
    return null;
  }
}

function decodePendingOwnerAthleteFamilyAssociation(
  raw: string
): PendingOwnerAthleteFamilyAssociation | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !exactKeys(value, [
      "version", "organizationId", "locationId", "groupId", "athleteId", "idempotencyKey", "body",
    ])) return null;
    if (
      value.version !== 1 ||
      !isUuid(value.organizationId) ||
      !isUuid(value.locationId) ||
      !isUuid(value.groupId) ||
      !isUuid(value.athleteId) ||
      typeof value.idempotencyKey !== "string" ||
      value.idempotencyKey.trim().length < 8 || value.idempotencyKey.length > 180 ||
      typeof value.body !== "string"
    ) return null;
    const command = {
      version: 1 as const,
      organizationId: value.organizationId,
      locationId: value.locationId,
      groupId: value.groupId,
      athleteId: value.athleteId,
      idempotencyKey: value.idempotencyKey,
      body: value.body,
    };
    return decodeAssociationBody(command.body, command) ? command : null;
  } catch {
    return null;
  }
}

export function readPendingOwnerAthleteFamilyAssociation(
  storage?: SessionStorageLike
): PendingOwnerAthleteFamilyAssociationRead {
  try {
    const target = storage ?? window.sessionStorage;
    const raw = target.getItem(PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY);
    if (raw === null) return { kind: "none" };
    const command = decodePendingOwnerAthleteFamilyAssociation(raw);
    return command ? { kind: "pending", command } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

function persistPendingOwnerAthleteFamilyAssociation(
  command: PendingOwnerAthleteFamilyAssociation
): boolean {
  const encoded = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    const current = storage.getItem(PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY);
    if (current !== null) return current === encoded;
    storage.setItem(PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY, encoded);
    return storage.getItem(PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY) === encoded;
  } catch {
    return false;
  }
}

function clearPendingOwnerAthleteFamilyAssociation(
  command: PendingOwnerAthleteFamilyAssociation
): boolean {
  const encoded = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    if (storage.getItem(PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY) !== encoded) return false;
    storage.removeItem(PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY);
    return storage.getItem(PENDING_OWNER_ATHLETE_FAMILY_ASSOCIATION_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

export function pendingOwnerAthleteFamilyAssociationMatches(
  command: PendingOwnerAthleteFamilyAssociation | null,
  scope: { organizationId: string; locationId: string; groupId: string; athleteId: string }
): boolean {
  return Boolean(command &&
    command.organizationId === scope.organizationId &&
    command.locationId === scope.locationId &&
    command.groupId === scope.groupId &&
    command.athleteId === scope.athleteId);
}

function readFamilyOptions(payload: unknown): FamilyOption[] | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data) ||
    !exactKeys(payload.data, ["families"]) || !Array.isArray(payload.data.families) || payload.data.families.length > 1000) return null;

  const families: FamilyOption[] = [];
  const familyIds = new Set<string>();
  for (const value of payload.data.families) {
    if (!isRecord(value) || !exactKeys(value, ["familyId", "athletes", "payers"]) ||
      !isUuid(value.familyId) || !Array.isArray(value.athletes) || !Array.isArray(value.payers) ||
      familyIds.has(value.familyId)) return null;
    familyIds.add(value.familyId);

    const athletes: FamilyOption["athletes"] = [];
    const athleteIds = new Set<string>();
    for (const athlete of value.athletes) {
      if (!isRecord(athlete) || !exactKeys(athlete, ["athleteId", "athleteName"]) ||
        !isUuid(athlete.athleteId) ||
        !(athlete.athleteName === null || typeof athlete.athleteName === "string") ||
        athleteIds.has(athlete.athleteId)) return null;
      athleteIds.add(athlete.athleteId);
      athletes.push({ athleteId: athlete.athleteId, athleteName: athlete.athleteName });
    }

    const payers: FamilyPayerOption[] = [];
    const payerIds = new Set<string>();
    for (const payer of value.payers) {
      const hasGuardianId = isRecord(payer) && Object.hasOwn(payer, "guardianId");
      if (!isRecord(payer) || !exactKeys(payer, hasGuardianId
        ? ["familyPayerId", "guardianId", "displayName", "isPrimary"]
        : ["familyPayerId", "displayName", "isPrimary"]) ||
        !isUuid(payer.familyPayerId) ||
        (hasGuardianId && !isUuid(payer.guardianId)) ||
        !(payer.displayName === null || typeof payer.displayName === "string") ||
        typeof payer.isPrimary !== "boolean" || payerIds.has(payer.familyPayerId)) return null;
      payerIds.add(payer.familyPayerId);
      payers.push({
        familyPayerId: payer.familyPayerId,
        ...(hasGuardianId ? { guardianId: payer.guardianId as string } : {}),
        displayName: payer.displayName,
        isPrimary: payer.isPrimary,
      });
    }
    families.push({ familyId: value.familyId, athletes, payers });
  }
  return families;
}

function readAssociationReceipt(
  response: { status: number },
  payload: unknown,
  body: OwnerAthleteFamilyAssociationBody
): AssociationReceipt | null {
  if ((response.status !== 200 && response.status !== 201) || !isRecord(payload) ||
    payload.ok !== true || !isRecord(payload.data) ||
    !exactKeys(payload.data, ["familyId", "familyPayerId"]) ||
    !isUuid(payload.data.familyId) || !isUuid(payload.data.familyPayerId)) return null;
  if (body.familyId && payload.data.familyId !== body.familyId) return null;
  if ("familyPayerId" in body.payer && payload.data.familyPayerId !== body.payer.familyPayerId) return null;
  return { familyId: payload.data.familyId, familyPayerId: payload.data.familyPayerId };
}

function readDefinitiveProblem(status: number, payload: unknown): string | null {
  if (status < 400 || status >= 500 || [408, 425, 429].includes(status) || !isRecord(payload)) return null;
  if (
    payload.status !== status ||
    typeof payload.title !== "string" || payload.title.trim().length === 0 ||
    typeof payload.type !== "string" || !payload.type.startsWith("https://zaltyko.com/problems/") ||
    typeof payload.detail !== "string" || payload.detail.trim().length === 0 ||
    "ok" in payload || "data" in payload
  ) return null;
  return payload.detail.length <= 240 ? payload.detail : "La operación fue rechazada. Comprueba los datos antes de volver a intentarlo.";
}

function problemMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.detail === "string" && payload.detail.trim()
    ? payload.detail.slice(0, 240)
    : "No se pudo completar la asociación. Comprueba la conexión e inténtalo de nuevo.";
}

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:bg-slate-100";
const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-teal-800 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

export function OwnerAthleteFamilyAssociationEditor({
  organizationId,
  locationId,
  groupId,
  athleteId,
  athleteName,
  effectiveFrom,
  allowExistingFamilies,
  disabled = false,
  readOnly = false,
  pendingCommand = null,
  onActiveChange,
  onPendingCommandChange,
  onSaved,
}: {
  organizationId: string;
  locationId: string;
  groupId: string;
  athleteId: string;
  athleteName: string;
  effectiveFrom: string;
  allowExistingFamilies: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  pendingCommand?: PendingOwnerAthleteFamilyAssociation | null;
  onActiveChange?: (key: string, active: boolean) => void;
  onPendingCommandChange?: (command: PendingOwnerAthleteFamilyAssociation | null) => void;
  onSaved?: () => void;
}) {
  const scopeKey = `${organizationId}:${locationId}:${groupId}:${athleteId}`;
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;
  const controllerRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const sendingRef = useRef(false);
  const mountedRef = useRef(false);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const [isOpen, setIsOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [families, setFamilies] = useState<FamilyOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [mode, setMode] = useState<"create" | "existing" | "complete">("create");
  const [familyId, setFamilyId] = useState("");
  const [familyPayerId, setFamilyPayerId] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [relationship, setRelationship] = useState<"parent" | "legal_guardian" | "foster_guardian" | "other">("parent");
  const [effectiveDate, setEffectiveDate] = useState(effectiveFrom);
  const [confirmPrimaryPayerChange, setConfirmPrimaryPayerChange] = useState(false);
  const [guardianContactsOpen, setGuardianContactsOpen] = useState(false);
  const [contactPendingScopeKey, setContactPendingScopeKey] = useState<string | null>(null);
  const [localPending, setLocalPending] = useState<PendingOwnerAthleteFamilyAssociation | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "status">("error");
  const [completedNotice, setCompletedNotice] = useState("");
  const scope = { organizationId, locationId, groupId, athleteId };
  const matchingLocalPending = pendingOwnerAthleteFamilyAssociationMatches(localPending, scope)
    ? localPending
    : null;
  const recoveredCommand = pendingOwnerAthleteFamilyAssociationMatches(pendingCommand, scope)
    ? pendingCommand
    : null;
  const activePending = matchingLocalPending ?? recoveredCommand;
  const incompleteFamilies = families.filter((family) => family.payers.length === 0 && family.athletes.some((athlete) => athlete.athleteId === athleteId));
  const incompleteFamily = allowExistingFamilies && optionsLoaded && incompleteFamilies.length === 1 ? incompleteFamilies[0] : null;
  const selectedFamily = families.find((item) => item.familyId === familyId) ?? null;
  const selectedPayer = selectedFamily?.payers.find((payer) => payer.familyPayerId === familyPayerId) ?? null;
  const selectedPayerWillBePromoted = Boolean(selectedPayer && !selectedPayer.isPrimary);
  const selectedGuardianId = selectedPayer?.guardianId && isUuid(selectedPayer.guardianId) ? selectedPayer.guardianId : null;
  const selectedContactScopeKey = selectedGuardianId ? `${organizationId}:${locationId}:${selectedGuardianId}` : "";
  const contactCommandPending = Boolean(selectedContactScopeKey && contactPendingScopeKey === selectedContactScopeKey);
  const validEffectiveDate = isDateValue(effectiveDate);
  const titleId = `athlete-family-association-title-${athleteId}`;
  const idPrefix = `athlete-family-association-${athleteId}`;

  useEffect(() => {
    mountedRef.current = true;
    // A changed route scope discards only this editor state; any written intent
    // stays in sessionStorage and remains fenced by the manager.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOpen(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingOptions(false);
    loadingRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFamilies([]);
    setOptionsLoaded(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuardianContactsOpen(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContactPendingScopeKey(null);
    // A previous request may still resolve after this scope changes. Its
    // durable session marker continues to fence writes, but it must not leave
    // this editor's new scope stuck in a visual saving state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false);
    sendingRef.current = false;
    setEffectiveDate(effectiveFrom);
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      onActiveChangeRef.current?.(scopeKey, false);
    };
  }, [scopeKey, effectiveFrom]);

  async function loadFamilyOptions() {
    if (!allowExistingFamilies) {
      setFamilies([]);
      setOptionsLoaded(true);
      return;
    }
    if (loadingRef.current || optionsLoaded) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestScope = scopeKey;
    loadingRef.current = true;
    setLoadingOptions(true);
    setMessage("");
    setMessageKind("error");
    try {
      const query = new URLSearchParams({ organizationId, locationId });
      const response = await fetch(`/api/v1/owner/families/options?${query.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (controller.signal.aborted || scopeKeyRef.current !== requestScope || !mountedRef.current) return;
      const options = response.status === 200 ? readFamilyOptions(payload) : null;
      if (!options) {
        setFamilies([]);
        setOptionsLoaded(false);
        setMessage(response.status === 200
          ? "Las familias recibidas no tienen el formato esperado. No se enviará la asociación."
          : problemMessage(payload));
        return;
      }
      setFamilies(options);
      setOptionsLoaded(true);
      setFamilyId((current) => options.some((item) => item.familyId === current) ? current : "");
      setFamilyPayerId((current) => {
        const family = options.find((item) => item.familyId === familyId);
        return family?.payers.some((payer) => payer.familyPayerId === current) ? current : "";
      });
      setMessage("");
    } catch {
      if (!controller.signal.aborted && scopeKeyRef.current === requestScope && mountedRef.current) {
        setFamilies([]);
        setOptionsLoaded(false);
        setMessage("No se pudieron cargar las familias de esta sede. Comprueba la conexión y vuelve a intentarlo.");
      }
    } finally {
      if (scopeKeyRef.current === requestScope && !controller.signal.aborted && mountedRef.current) {
        loadingRef.current = false;
        setLoadingOptions(false);
      }
    }
  }

  function openEditor() {
    setCompletedNotice("");
    setIsOpen(true);
    setMessage("");
    onActiveChangeRef.current?.(scopeKey, true);
    void loadFamilyOptions();
  }

  function closeEditor() {
    if (activePending || contactCommandPending || saving) return;
    controllerRef.current?.abort();
    loadingRef.current = false;
    setLoadingOptions(false);
    setIsOpen(false);
    setMessage("");
    onActiveChangeRef.current?.(scopeKey, false);
  }

  function changeFamily(nextFamilyId: string) {
    if (activePending || contactCommandPending) return;
    const nextFamily = families.find((item) => item.familyId === nextFamilyId);
    setFamilyId(nextFamilyId);
    setFamilyPayerId(nextFamily?.payers.find((payer) => payer.isPrimary)?.familyPayerId ?? nextFamily?.payers[0]?.familyPayerId ?? "");
    setConfirmPrimaryPayerChange(false);
    setGuardianContactsOpen(false);
  }

  function changeMode(nextMode: "create" | "existing" | "complete") {
    if (activePending || contactCommandPending) return;
    setMode(nextMode);
    setMessage("");
    setConfirmPrimaryPayerChange(false);
    setGuardianContactsOpen(false);
    if (nextMode === "existing") void loadFamilyOptions();
  }

  function changePayer(nextPayerId: string) {
    if (activePending || contactCommandPending) return;
    setFamilyPayerId(nextPayerId);
    setConfirmPrimaryPayerChange(false);
    setGuardianContactsOpen(false);
  }

  function handleContactPendingChange(contactScopeKey: string, active: boolean) {
    setContactPendingScopeKey((current) => {
      if (active) return contactScopeKey;
      return current === contactScopeKey ? null : current;
    });
  }

  async function sendAssociation(command: PendingOwnerAthleteFamilyAssociation, previouslyUncertain = false) {
    const commandScopeKey = `${command.organizationId}:${command.locationId}:${command.groupId}:${command.athleteId}`;
    const body = decodeAssociationBody(command.body, command);
    if (
      !body ||
      sendingRef.current ||
      !mountedRef.current ||
      scopeKeyRef.current !== commandScopeKey
    ) return;
    const stored = readPendingOwnerAthleteFamilyAssociation();
    if (stored.kind !== "pending" ||
      stored.command.organizationId !== command.organizationId ||
      stored.command.locationId !== command.locationId ||
      stored.command.groupId !== command.groupId ||
      stored.command.athleteId !== command.athleteId ||
      stored.command.idempotencyKey !== command.idempotencyKey ||
      stored.command.body !== command.body) {
      if (stored.kind === "pending") {
        setLocalPending(stored.command);
        onPendingCommandChange?.(stored.command);
      }
      setMessage("No se pudo verificar el cuerpo y la clave pendientes en esta sesión. No se enviará otra solicitud hasta recuperar el estado guardado.");
      return;
    }
    sendingRef.current = true;
    setSaving(true);
    setMessage("");
    setMessageKind("error");
    onActiveChangeRef.current?.(commandScopeKey, true);
    let uncertain = false;
    try {
      const response = await fetch("/api/v1/owner/families/associations", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": command.idempotencyKey },
        body: command.body,
      });
      const payload = await response.json().catch(() => null);
      if (!mountedRef.current || scopeKeyRef.current !== commandScopeKey) return;

      const receipt = readAssociationReceipt(response, payload, body);
      if (receipt) {
        if (!clearPendingOwnerAthleteFamilyAssociation(command)) {
          uncertain = true;
          setLocalPending(command);
          onPendingCommandChange?.(command);
          setMessage("El servidor confirmó la asociación, pero no se pudo limpiar el marcador de esta sesión. Conservamos la misma operación para comprobarla otra vez.");
          return;
        }
        setLocalPending(null);
        onPendingCommandChange?.(null);
        setMessageKind("status");
        setCompletedNotice("Familia vinculada a esta gimnasta. No se creó una cuenta, no se envió correo y no se registró ningún cobro.");
        setIsOpen(false);
        onActiveChangeRef.current?.(commandScopeKey, false);
        try {
          onSaved?.();
        } catch {
          setCompletedNotice("Familia vinculada a esta gimnasta. No se creó una cuenta, no se envió correo ni se registró ningún cobro. Actualiza la vista para consultar los datos recientes.");
        }
        return;
      }

      const definitiveProblem = readDefinitiveProblem(response.status, payload);
      if (definitiveProblem && !previouslyUncertain) {
        if (!clearPendingOwnerAthleteFamilyAssociation(command)) {
          uncertain = true;
          setLocalPending(command);
          onPendingCommandChange?.(command);
          setMessage("El servidor rechazó la solicitud, pero no se pudo limpiar su marcador. No iniciaremos otra asociación.");
          return;
        }
        setLocalPending(null);
        onPendingCommandChange?.(null);
        setMessage(definitiveProblem);
        return;
      }

      uncertain = true;
      setLocalPending(command);
      onPendingCommandChange?.(command);
      setMessage("No sabemos si se guardó la asociación. Conservamos el mismo cuerpo y su clave; reintenta solo desde el botón de esta operación.");
    } catch {
      if (mountedRef.current && scopeKeyRef.current === commandScopeKey) {
        uncertain = true;
        setLocalPending(command);
        onPendingCommandChange?.(command);
        setMessage("No sabemos si se guardó la asociación. Conservamos el mismo cuerpo y su clave; reintenta solo desde el botón de esta operación.");
      }
    } finally {
      sendingRef.current = false;
      if (mountedRef.current && scopeKeyRef.current === commandScopeKey) {
        setSaving(false);
        if (uncertain) onActiveChangeRef.current?.(commandScopeKey, false);
      } else if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activePending || contactCommandPending || saving || sendingRef.current || readOnly || disabled) return;
    if (!isDateValue(effectiveDate)) {
      setMessage("Selecciona una fecha efectiva válida.");
      return;
    }
    let payer: OwnerAthleteFamilyAssociationBody["payer"];
    let selectedExistingFamilyId: string | undefined;
    if (mode === "existing") {
      if (!allowExistingFamilies || !optionsLoaded || !selectedFamily || !selectedPayer) {
        setMessage("Selecciona una familia activa y una persona pagadora disponible.");
        return;
      }
      if (selectedPayerWillBePromoted && !confirmPrimaryPayerChange) {
        setMessage("Confirma que la persona elegida pasará a ser el pagador principal de toda la familia.");
        return;
      }
      selectedExistingFamilyId = selectedFamily.familyId;
      payer = {
        familyPayerId: selectedPayer.familyPayerId,
        ...(selectedPayerWillBePromoted ? { confirmPrimaryPayerChange: true } : {}),
      };
    } else {
      if (mode === "complete") {
        if (!incompleteFamily) {
          setMessage("No se pudo confirmar una única familia incompleta de esta gimnasta. Actualiza las opciones antes de continuar.");
          return;
        }
        selectedExistingFamilyId = incompleteFamily.familyId;
      }
      const normalizedGivenName = givenName.trim().normalize("NFC").replace(/\s+/gu, " ");
      const normalizedFamilyName = familyName.trim().normalize("NFC").replace(/\s+/gu, " ");
      if (!normalizedGivenName || !normalizedFamilyName) {
        setMessage("Indica el nombre y los apellidos de la persona adulta responsable.");
        return;
      }
      payer = {
        givenName: normalizedGivenName,
        familyName: normalizedFamilyName,
        relationship,
      };
    }

    const body: OwnerAthleteFamilyAssociationBody = {
      organizationId,
      locationId,
      ...(selectedExistingFamilyId ? { familyId: selectedExistingFamilyId } : {}),
      athleteIds: [athleteId],
      effectiveFrom: effectiveDate,
      payer,
    };
    const command: PendingOwnerAthleteFamilyAssociation = {
      version: 1,
      organizationId,
      locationId,
      groupId,
      athleteId,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify(body),
    };
    if (!persistPendingOwnerAthleteFamilyAssociation(command)) {
      setMessage("No se pudo guardar y verificar la clave de esta operación. No se ha enviado la asociación.");
      return;
    }
    setLocalPending(command);
    onPendingCommandChange?.(command);
    await sendAssociation(command);
  }

  function retryPendingAssociation() {
    if (!activePending || saving || disabled) return;
    setIsOpen(true);
    setMessage("");
    void sendAssociation(activePending, true);
  }

  const buttonDisabled = disabled || (!activePending && readOnly);
  const familiesWithPayers = families.filter((family) => family.payers.length > 0);

  return (
    <div className="contents">
      {activePending ? (
        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={disabled || saving}
          onClick={retryPendingAssociation}
        >
          {saving ? "Comprobando familia…" : `Reintentar asociación familiar de ${athleteName}`}
        </button>
      ) : (
        <button
          type="button"
          className={secondaryButtonClassName}
          aria-expanded={isOpen}
          disabled={buttonDisabled}
          onClick={openEditor}
        >
          Vincular familia a {athleteName}
        </button>
      )}

      {!isOpen && completedNotice && (
        <p role="status" className="basis-full border border-teal-700 bg-teal-50 p-3 text-sm text-slate-900">{completedNotice}</p>
      )}

      {isOpen && (
        <section aria-labelledby={titleId} className="mt-3 w-full border border-slate-300 bg-white p-4 sm:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 id={titleId} className="font-bold">Asociar familia</h4>
              <p className="mt-1 text-sm text-slate-700">Vincula a {athleteName} con una familia y una persona adulta responsable.</p>
            </div>
            {!activePending && (
              <button type="button" className={secondaryButtonClassName} onClick={closeEditor} disabled={saving || contactCommandPending}>
                Cerrar asociación
              </button>
            )}
          </div>

          {message && <p role={messageKind === "error" ? "alert" : "status"} className="mt-3 border border-slate-300 bg-slate-50 p-3 text-sm">{message}</p>}

          {activePending ? (
            <p className="mt-3 text-sm text-amber-900">Los datos quedan bloqueados mientras se confirma exactamente la operación original.</p>
          ) : (
            <>
              {loadingOptions && <p role="status" className="mt-3 text-sm text-slate-700">Cargando familias disponibles…</p>}
              {allowExistingFamilies && !loadingOptions && !optionsLoaded && (
                <button type="button" className={`${secondaryButtonClassName} mt-3`} onClick={() => void loadFamilyOptions()} disabled={disabled || readOnly || saving}>
                  Cargar familias de nuevo
                </button>
              )}
              {allowExistingFamilies && !loadingOptions && optionsLoaded && familiesWithPayers.length === 0 && (
                <p className="mt-3 text-sm text-slate-700">No hay familias activas con una persona pagadora disponible en esta sede. Si esta gimnasta tiene una familia incompleta, complétala; crea una nueva solo si todavía no tiene vínculo familiar.</p>
              )}
              {!allowExistingFamilies && (
                <p className="mt-3 border border-sky-300 bg-sky-50 p-3 text-sm text-slate-800">Tu acceso está limitado a una sede. Puedes crear una familia nueva aquí; la selección de familias existentes requiere acceso a todas las sedes porque el pagador es un dato compartido.</p>
              )}

              <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
                {allowExistingFamilies && (
                  <fieldset className="grid gap-2 sm:col-span-2" disabled={loadingOptions || disabled || readOnly || contactCommandPending || Boolean(activePending)}>
                    <legend className="text-sm font-semibold">¿Cómo quieres asociar la familia?</legend>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="radio" name={`${idPrefix}-mode`} value="create" checked={mode === "create"} onChange={() => changeMode("create")} />
                      Crear una familia nueva
                    </label>
                    {incompleteFamily && (
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="radio" name={`${idPrefix}-mode`} value="complete" checked={mode === "complete"} onChange={() => changeMode("complete")} />
                        Completar la familia actual de esta gimnasta
                      </label>
                    )}
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="radio" name={`${idPrefix}-mode`} value="existing" checked={mode === "existing"} onChange={() => changeMode("existing")} />
                      Elegir una familia existente
                    </label>
                  </fieldset>
                )}

                {mode === "existing" && allowExistingFamilies ? (
                  <>
                    <label className="block text-sm font-semibold sm:col-span-2" htmlFor={`${idPrefix}-family`}>
                      Familia existente
                      <select id={`${idPrefix}-family`} className={`${fieldClassName} mt-2`} value={familyId} onChange={(event) => changeFamily(event.target.value)} disabled={disabled || readOnly || loadingOptions || !optionsLoaded || saving || contactCommandPending || Boolean(activePending)} required>
                        <option value="">Selecciona una familia</option>
                        {familiesWithPayers.map((family) => {
                          const names = family.athletes.map((athlete) => athlete.athleteName?.trim()).filter((name): name is string => Boolean(name));
                          const label = names.length > 0 ? names.join(", ") : `${family.athletes.length} gimnastas`;
                          return <option key={family.familyId} value={family.familyId}>Familia: {label}</option>;
                        })}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold sm:col-span-2" htmlFor={`${idPrefix}-payer`}>
                      Persona pagadora de esta familia
                      <select id={`${idPrefix}-payer`} className={`${fieldClassName} mt-2`} value={familyPayerId} onChange={(event) => changePayer(event.target.value)} disabled={disabled || readOnly || loadingOptions || !optionsLoaded || !selectedFamily || saving || contactCommandPending || Boolean(activePending)} required>
                        <option value="">Selecciona una persona pagadora</option>
                        {selectedFamily?.payers.map((payer) => (
                          <option key={payer.familyPayerId} value={payer.familyPayerId}>
                            {payer.displayName?.trim() || "Persona adulta"}{payer.isPrimary ? " · actual principal" : " · pasará a principal"}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedPayerWillBePromoted && (
                      <label className="flex items-start gap-2 border border-amber-400 bg-amber-50 p-3 text-sm text-slate-900 sm:col-span-2">
                        <input type="checkbox" className="mt-1 min-h-6 min-w-6" checked={confirmPrimaryPayerChange} onChange={(event) => setConfirmPrimaryPayerChange(event.target.checked)} disabled={disabled || readOnly || saving || contactCommandPending || Boolean(activePending)} />
                        Confirmo que esta persona pasará a ser el pagador principal de toda la familia.
                      </label>
                    )}
                    <p className="text-sm text-slate-700 sm:col-span-2">No se crea una cuenta ni se envía correo. Esta asociación tampoco registra cuotas ni inicia cobros. La persona elegida quedará como pagador principal de la familia.</p>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-semibold" htmlFor={`${idPrefix}-given-name`}>
                      Nombre de la persona adulta responsable
                      <input id={`${idPrefix}-given-name`} className={`${fieldClassName} mt-2`} value={givenName} onChange={(event) => setGivenName(event.target.value)} autoComplete="off" maxLength={100} disabled={disabled || readOnly || saving || contactCommandPending || Boolean(activePending)} required />
                    </label>
                    <label className="block text-sm font-semibold" htmlFor={`${idPrefix}-family-name`}>
                      Apellidos
                      <input id={`${idPrefix}-family-name`} className={`${fieldClassName} mt-2`} value={familyName} onChange={(event) => setFamilyName(event.target.value)} autoComplete="off" maxLength={100} disabled={disabled || readOnly || saving || contactCommandPending || Boolean(activePending)} required />
                    </label>
                    <label className="block text-sm font-semibold" htmlFor={`${idPrefix}-relationship`}>
                      Relación con la gimnasta
                      <select id={`${idPrefix}-relationship`} className={`${fieldClassName} mt-2`} value={relationship} onChange={(event) => setRelationship(event.target.value as typeof relationship)} disabled={disabled || readOnly || saving || contactCommandPending || Boolean(activePending)} required>
                        <option value="parent">Madre o padre</option>
                        <option value="legal_guardian">Tutor/a legal</option>
                        <option value="foster_guardian">Acogimiento familiar</option>
                        <option value="other">Otra persona responsable</option>
                      </select>
                    </label>
                    <p className="self-end text-sm text-slate-700">{mode === "complete" ? "Esta persona completará la familia ya vinculada y será su pagador principal. Se conserva el vínculo existente." : "Esta persona será el pagador principal de la nueva familia."} No se crea una cuenta ni se envía correo; tampoco se registran cuotas ni se inicia ningún cobro.</p>
                  </>
                )}

                <label className="block text-sm font-semibold sm:col-span-2" htmlFor={`${idPrefix}-effective-from`}>
                  Fecha de inicio de la asociación
                  <input id={`${idPrefix}-effective-from`} type="date" className={`${fieldClassName} mt-2`} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} disabled={disabled || readOnly || saving || contactCommandPending || Boolean(activePending)} required />
                </label>
                {!validEffectiveDate && <p role="alert" className="text-sm text-red-900 sm:col-span-2">No se ha podido determinar una fecha válida para la sede.</p>}
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="submit" className={primaryButtonClassName} disabled={disabled || readOnly || saving || contactCommandPending || Boolean(activePending) || !validEffectiveDate || (mode === "complete" && !incompleteFamily) || (mode === "existing" && (!optionsLoaded || !selectedFamily || !selectedPayer || (selectedPayerWillBePromoted && !confirmPrimaryPayerChange)))}>
                    {saving ? "Guardando…" : "Asociar familia"}
                  </button>
                </div>
              </form>
              {mode === "existing" && allowExistingFamilies && selectedPayer && selectedGuardianId && !activePending && (
                <div className="mt-4 border-t border-slate-200 pt-4 sm:col-span-2">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    aria-expanded={guardianContactsOpen}
                    disabled={disabled || readOnly || saving || contactCommandPending}
                    onClick={() => setGuardianContactsOpen((open) => !open)}
                  >
                    {guardianContactsOpen ? "Ocultar contactos" : `Contactos de ${selectedPayer.displayName?.trim() || "la persona pagadora"}`}
                  </button>
                  {guardianContactsOpen && (
                    <OwnerGuardianContactsEditor
                      key={selectedContactScopeKey}
                      organizationId={organizationId}
                      locationId={locationId}
                      guardianId={selectedGuardianId}
                      displayName={selectedPayer.displayName?.trim() || "la persona pagadora"}
                      disabled={disabled || readOnly || Boolean(activePending)}
                      onPendingChange={handleContactPendingChange}
                      onClose={() => setGuardianContactsOpen(false)}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
