"use client";

import { useEffect, useRef, useState } from "react";
import {
  OwnerGuardianProfileEditor,
  readPendingOwnerGuardianProfile,
} from "@/components/owner-dashboard/OwnerGuardianProfileEditor";

export const PENDING_OWNER_GUARDIAN_CONTACT_STORAGE_KEY =
  "zaltyko:pending-owner-guardian-contact:v1";

export type OwnerGuardianContactKind = "email" | "phone";
export type OwnerGuardianContact = Readonly<{
  contactId: string;
  value: string;
  verifiedAt: string | null;
  updatedAt: string;
}>;
export type OwnerGuardianContacts = Readonly<{
  email: OwnerGuardianContact | null;
  phone: OwnerGuardianContact | null;
}>;
export type OwnerGuardianContactBody = Readonly<{
  organizationId: string;
  locationId: string;
  kind: OwnerGuardianContactKind;
  expectedContactId: string | null;
  expectedValue: string | null;
  expectedUpdatedAt: string | null;
  value: string;
}>;
export type PendingOwnerGuardianContact = Readonly<{
  version: 1;
  organizationId: string;
  locationId: string;
  guardianId: string;
  kind: OwnerGuardianContactKind;
  method: "PATCH";
  endpoint: string;
  idempotencyKey: string;
  body: string;
}>;
export type PendingOwnerGuardianContactRead =
  | { kind: "none" }
  | { kind: "pending"; command: PendingOwnerGuardianContact }
  | { kind: "invalid" }
  | { kind: "unavailable" };

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type OwnerGuardianContactScope = Readonly<{ organizationId: string; locationId: string; guardianId: string }>;
type ContactsReceipt = Readonly<{ contacts: OwnerGuardianContacts; replayed: boolean }>;

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:bg-slate-100";
const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-teal-800 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

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

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function contactEndpoint(guardianId: string): string {
  return `/api/v1/owner/guardians/${encodeURIComponent(guardianId)}/contacts`;
}

function storageKey(scope: OwnerGuardianContactScope): string {
  return `${PENDING_OWNER_GUARDIAN_CONTACT_STORAGE_KEY}:${scope.organizationId}:${scope.locationId}:${scope.guardianId}`;
}

function parseContact(value: unknown): OwnerGuardianContact | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["contactId", "value", "verifiedAt", "updatedAt"]) ||
    !isUuid(value.contactId) || typeof value.value !== "string" || value.value.length === 0 ||
    value.value.length > 254 ||
    !(value.verifiedAt === null || isIsoDateTime(value.verifiedAt)) ||
    !isIsoDateTime(value.updatedAt)) return undefined;
  return {
    contactId: value.contactId,
    value: value.value,
    verifiedAt: value.verifiedAt,
    updatedAt: value.updatedAt,
  };
}

function parseContacts(value: unknown): OwnerGuardianContacts | null {
  if (!isRecord(value) || !exactKeys(value, ["email", "phone"])) return null;
  const email = parseContact(value.email);
  const phone = parseContact(value.phone);
  if (email === undefined || phone === undefined) return null;
  return { email, phone };
}

function parseContactBody(raw: string, scope: OwnerGuardianContactScope, kind: OwnerGuardianContactKind): OwnerGuardianContactBody | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !exactKeys(value, [
      "organizationId", "locationId", "kind", "expectedContactId", "expectedValue", "expectedUpdatedAt", "value",
    ]) || value.organizationId !== scope.organizationId || value.locationId !== scope.locationId ||
      value.kind !== kind ||
      !(value.expectedContactId === null || isUuid(value.expectedContactId)) ||
      !(value.expectedValue === null || (typeof value.expectedValue === "string" && value.expectedValue.length <= 254)) ||
      !(value.expectedUpdatedAt === null || isIsoDateTime(value.expectedUpdatedAt)) ||
      typeof value.value !== "string") return null;
    const normalized = kind === "email" ? normalizeEmail(value.value) : normalizePhone(value.value);
    if (!normalized || normalized !== value.value) return null;
    return {
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      kind,
      expectedContactId: value.expectedContactId as string | null,
      expectedValue: value.expectedValue as string | null,
      expectedUpdatedAt: value.expectedUpdatedAt as string | null,
      value: value.value,
    };
  } catch {
    return null;
  }
}

function decodePending(raw: string, scope: OwnerGuardianContactScope): PendingOwnerGuardianContact | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !exactKeys(value, [
      "version", "organizationId", "locationId", "guardianId", "kind", "method", "endpoint", "idempotencyKey", "body",
    ]) || value.version !== 1 || value.organizationId !== scope.organizationId ||
      value.locationId !== scope.locationId || value.guardianId !== scope.guardianId ||
      (value.kind !== "email" && value.kind !== "phone") || value.method !== "PATCH" ||
      value.endpoint !== contactEndpoint(scope.guardianId) || !isUuid(value.idempotencyKey) ||
      typeof value.body !== "string" || !parseContactBody(value.body, scope, value.kind)) return null;
    return {
      version: 1,
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      guardianId: scope.guardianId,
      kind: value.kind,
      method: "PATCH",
      endpoint: contactEndpoint(scope.guardianId),
      idempotencyKey: value.idempotencyKey,
      body: value.body,
    };
  } catch {
    return null;
  }
}

export function readPendingOwnerGuardianContact(
  scope: OwnerGuardianContactScope,
  storage?: SessionStorageLike,
): PendingOwnerGuardianContactRead {
  try {
    const target = storage ?? window.sessionStorage;
    const raw = target.getItem(storageKey(scope));
    if (raw === null) return { kind: "none" };
    const command = decodePending(raw, scope);
    return command ? { kind: "pending", command } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

function persistPending(command: PendingOwnerGuardianContact): boolean {
  const scope = command;
  const key = storageKey(scope);
  const encoded = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    const current = storage.getItem(key);
    if (current !== null) return current === encoded;
    storage.setItem(key, encoded);
    return storage.getItem(key) === encoded && Boolean(decodePending(encoded, scope));
  } catch {
    return false;
  }
}

function clearPending(command: PendingOwnerGuardianContact): boolean {
  const key = storageKey(command);
  const encoded = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    if (storage.getItem(key) !== encoded) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

function readGetReceipt(payload: unknown, guardianId: string): OwnerGuardianContacts | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data) ||
    !exactKeys(payload.data, ["guardianId", "contacts"]) || payload.data.guardianId !== guardianId) return null;
  return parseContacts(payload.data.contacts);
}

function readPatchReceipt(
  status: number,
  payload: unknown,
  guardianId: string,
  body: OwnerGuardianContactBody,
): ContactsReceipt | null {
  if (status !== 200 || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data) ||
    !exactKeys(payload.data, ["guardianId", "contacts", "replayed"]) || payload.data.guardianId !== guardianId ||
    typeof payload.data.replayed !== "boolean") return null;
  const contacts = parseContacts(payload.data.contacts);
  const current = contacts?.[body.kind];
  if (!contacts || (!payload.data.replayed && current?.value !== body.value) ||
    (!payload.data.replayed && body.expectedValue !== body.value && current?.verifiedAt !== null)) return null;
  return { contacts, replayed: payload.data.replayed };
}

function readDefinitiveProblem(status: number, payload: unknown): string | null {
  if (status < 400 || status >= 500 || [408, 425, 429].includes(status) || !isRecord(payload) ||
    payload.status !== status || typeof payload.title !== "string" || payload.title.trim().length === 0 ||
    typeof payload.type !== "string" || !payload.type.startsWith("https://zaltyko.com/problems/") ||
    typeof payload.detail !== "string" || payload.detail.trim().length === 0 || "ok" in payload || "data" in payload) return null;
  return payload.detail.length <= 240 ? payload.detail : "No se pudo guardar este contacto. Revisa los datos.";
}

function problemType(status: number, payload: unknown): string | null {
  if (status < 400 || status >= 500 || !isRecord(payload) ||
    typeof payload.type !== "string" || !payload.type.startsWith("https://zaltyko.com/problems/")) return null;
  return payload.type.slice("https://zaltyko.com/problems/".length);
}

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+") || /[^+\d\s().-]/.test(trimmed)) return null;
  const normalized = `+${trimmed.slice(1).replace(/[\s().-]/g, "")}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function problemMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.detail === "string" && payload.detail.trim().length > 0) {
    return payload.detail.length <= 240 ? payload.detail : "No se pudieron cargar los contactos.";
  }
  return "No se pudieron cargar los contactos de esta persona. Comprueba la conexión y vuelve a intentarlo.";
}

export function OwnerGuardianContactsEditor({
  organizationId,
  locationId,
  guardianId,
  displayName,
  disabled = false,
  onPendingChange,
  onClose,
}: {
  organizationId: string;
  locationId: string;
  guardianId: string;
  displayName: string;
  disabled?: boolean;
  onPendingChange?: (scopeKey: string, active: boolean) => void;
  onClose?: () => void;
}) {
  const scope: OwnerGuardianContactScope = { organizationId, locationId, guardianId };
  const scopeKey = `${organizationId}:${locationId}:${guardianId}`;
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;
  const contactLockRef = useRef({ scopeKey, locked: false });
  const profileLockRef = useRef({ scopeKey, locked: false });
  if (contactLockRef.current.scopeKey !== scopeKey) contactLockRef.current = { scopeKey, locked: false };
  if (profileLockRef.current.scopeKey !== scopeKey) profileLockRef.current = { scopeKey, locked: false };
  const mountedRef = useRef(false);
  const sendingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const callbackRef = useRef(onPendingChange);
  callbackRef.current = onPendingChange;
  const refreshNoticeRef = useRef<string | null>(null);
  const [contacts, setContacts] = useState<OwnerGuardianContacts | null>(null);
  const contactsRef = useRef<OwnerGuardianContacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<PendingOwnerGuardianContact | null>(null);
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingKind, setEditingKind] = useState<OwnerGuardianContactKind | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "status">("error");
  const [loadRevision, setLoadRevision] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileActive, setProfileActive] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState(displayName);

  function setCurrentContacts(next: OwnerGuardianContacts) {
    contactsRef.current = next;
    setContacts(next);
    setEmailValue(next.email?.value ?? "");
    setPhoneValue(next.phone?.value ?? "");
  }

  function notifyPending(active: boolean, key = scopeKey) {
    if (key !== scopeKeyRef.current) return;
    contactLockRef.current = { scopeKey: key, locked: active };
    const profileLocked = profileLockRef.current.scopeKey === key && profileLockRef.current.locked;
    callbackRef.current?.(key, active || profileLocked);
  }

  function notifyProfileLock(key: string, locked: boolean) {
    if (key !== scopeKeyRef.current) return;
    profileLockRef.current = { scopeKey: key, locked };
    setProfileActive(locked);
    const contactLocked = contactLockRef.current.scopeKey === key && contactLockRef.current.locked;
    callbackRef.current?.(key, locked || contactLocked);
  }

  useEffect(() => {
    mountedRef.current = true;
    // Restore only a command bound to this organization, location, and guardian.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContacts(null);
    contactsRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadError("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditingKind(null);
    sendingRef.current = false;
    const restoredProfile = readPendingOwnerGuardianProfile(scope);
    if (restoredProfile.kind !== "none") {
      // Keep the recovery editor mounted for pending, corrupt, or unavailable
      // markers. It owns the exact-command recovery UI and must not be hidden.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileOpen(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileActive(true);
      profileLockRef.current = { scopeKey, locked: true };
      notifyProfileLock(scopeKey, true);
    }
    const restored = readPendingOwnerGuardianContact(scope);
    if (restored.kind === "pending") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(restored.command);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingBlocked(false);
      notifyPending(true, scopeKey);
    } else if (restored.kind === "invalid" || restored.kind === "unavailable") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingBlocked(true);
      notifyPending(true, scopeKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage("No se puede verificar el marcador de esta operación en esta sesión. No se enviarán cambios de contacto.");
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingBlocked(false);
      notifyPending(false, scopeKey);
    }

    const controller = new AbortController();
    requestRef.current = controller;
    const requestScope = scopeKey;
    const query = new URLSearchParams({ organizationId, locationId });
    void (async () => {
      try {
        const response = await fetch(`${contactEndpoint(guardianId)}?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!mountedRef.current || controller.signal.aborted || scopeKeyRef.current !== requestScope) return;
        const data = response.status === 200 ? readGetReceipt(payload, guardianId) : null;
        if (!data) {
          setLoadError(response.status === 200
            ? "Los contactos recibidos no tienen el formato esperado. No se permitirán cambios."
            : problemMessage(payload));
          return;
        }
        setCurrentContacts(data);
        setLoadError("");
        const refreshNotice = refreshNoticeRef.current;
        if (refreshNotice) {
          setMessage(refreshNotice);
          setMessageKind("status");
          refreshNoticeRef.current = null;
        }
      } catch {
        if (!controller.signal.aborted && mountedRef.current && scopeKeyRef.current === requestScope) {
          setLoadError("No se pudieron cargar los contactos de esta persona. Comprueba la conexión y vuelve a intentarlo.");
        }
      } finally {
        if (!controller.signal.aborted && mountedRef.current && scopeKeyRef.current === requestScope) setLoading(false);
      }
    })();

    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      notifyPending(false, requestScope);
    };
    // scope identifies the payload and must trigger a fresh read when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, loadRevision]);

  const contactOperationLocked = Boolean(pending || pendingBlocked || saving);
  const profileOperationLocked = profileOpen || profileActive;
  const operationLocked = contactOperationLocked || profileOperationLocked;

  async function sendPending(command: PendingOwnerGuardianContact, previouslyUncertain: boolean) {
    if (sendingRef.current || !mountedRef.current || scopeKeyRef.current !== `${command.organizationId}:${command.locationId}:${command.guardianId}`) return;
    const body = parseContactBody(command.body, command, command.kind);
    const stored = readPendingOwnerGuardianContact(command);
    if (!body || stored.kind !== "pending" ||
      JSON.stringify(stored.command) !== JSON.stringify(command)) {
      setPendingBlocked(true);
      setPending(command);
      notifyPending(true);
      setMessage("No se pudo verificar el cuerpo, la ruta y la clave guardados. Conservamos el estado y no enviaremos otra solicitud.");
      return;
    }

    sendingRef.current = true;
    setSaving(true);
    setMessage("");
    setMessageKind("error");
    notifyPending(true);
    requestRef.current?.abort();
    setLoading(false);
    const requestScope = scopeKey;
    let uncertain = false;
    try {
      const response = await fetch(command.endpoint, {
        method: command.method,
        headers: { "content-type": "application/json", "Idempotency-Key": command.idempotencyKey },
        body: command.body,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!mountedRef.current || scopeKeyRef.current !== requestScope) return;

      const receipt = readPatchReceipt(response.status, payload, command.guardianId, body);
      if (receipt) {
        if (!clearPending(command)) {
          uncertain = true;
          setPending(command);
          setPendingBlocked(false);
          setMessage("El servidor confirmó el cambio, pero no se pudo limpiar el marcador guardado. Conservamos la misma operación para comprobarla otra vez.");
          return;
        }
        setPending(null);
        setPendingBlocked(false);
        setCurrentContacts(receipt.contacts);
        setMessageKind("status");
        setMessage(receipt.replayed
          ? "La operación ya estaba registrada. Se muestran los contactos actuales. No se ha enviado correo ni verificado la dirección."
          : "Contacto actualizado. No se ha enviado correo ni verificado la dirección o el teléfono.");
        setEditingKind(null);
        notifyPending(false, requestScope);
        return;
      }

      if (response.status === 409 && problemType(response.status, payload) === "version-conflict" &&
        readDefinitiveProblem(response.status, payload)) {
        if (!clearPending(command)) {
          uncertain = true;
          setPending(command);
          setPendingBlocked(false);
          setMessage("El contacto cambió, pero no se pudo limpiar el marcador. Conservamos la misma operación sin repetirla automáticamente.");
          notifyPending(true, requestScope);
        } else {
          setPending(null);
          setPendingBlocked(false);
          setEditingKind(null);
          refreshNoticeRef.current = "El contacto cambió desde la última lectura. Se muestran los datos actualizados; revisa antes de guardar otro cambio.";
          notifyPending(false, requestScope);
          setLoadRevision((revision) => revision + 1);
        }
        return;
      }

      const definitiveProblem = readDefinitiveProblem(response.status, payload);
      const idempotencyConflict = problemType(response.status, payload) === "idempotency-conflict";
      if (idempotencyConflict) {
        uncertain = true;
        setPending(command);
        setPendingBlocked(true);
        setMessage("La clave de esta operación ya pertenece a otro cambio. Conservamos el marcador y bloqueamos nuevos intentos para no duplicar ni sustituir la operación.");
        notifyPending(true, requestScope);
        return;
      }
      if (definitiveProblem && !previouslyUncertain) {
        if (clearPending(command)) {
          setPending(null);
          setPendingBlocked(false);
          setMessage(definitiveProblem);
          notifyPending(false, requestScope);
        } else {
          uncertain = true;
          setPending(command);
          setPendingBlocked(false);
          setMessage("El servidor rechazó la solicitud, pero no se pudo limpiar el marcador guardado. No iniciaremos otra operación.");
          notifyPending(true, requestScope);
        }
        return;
      }

      uncertain = true;
      setPending(command);
      notifyPending(true, requestScope);
      setMessage("No sabemos si se guardó el contacto. Conservamos exactamente el cuerpo y la clave; reintenta solo con el botón de esta operación.");
    } catch {
      if (mountedRef.current && scopeKeyRef.current === requestScope) {
        uncertain = true;
        setPending(command);
        notifyPending(true, requestScope);
        setMessage("No sabemos si se guardó el contacto. Conservamos exactamente el cuerpo y la clave; reintenta solo con el botón de esta operación.");
      }
    } finally {
      sendingRef.current = false;
      if (mountedRef.current && scopeKeyRef.current === requestScope) setSaving(false);
      if (uncertain) notifyPending(true, requestScope);
    }
  }

  function submit(kind: OwnerGuardianContactKind) {
    if (disabled || operationLocked || loading || loadError || !contactsRef.current) return;
    const rawValue = kind === "email" ? emailValue : phoneValue;
    const normalizedValue = kind === "email" ? normalizeEmail(rawValue) : normalizePhone(rawValue);
    if (!normalizedValue) {
      setMessage(kind === "email"
        ? "Escribe un correo válido. Se normalizará con espacios exteriores eliminados y minúsculas."
        : "Escribe el teléfono en formato internacional E.164, con + y prefijo de país explícito.");
      setMessageKind("error");
      return;
    }
    let idempotencyKey: string;
    try {
      idempotencyKey = crypto.randomUUID();
    } catch {
      setMessage("No se pudo generar una clave segura. No se enviará el cambio.");
      return;
    }
    const current = contactsRef.current[kind];
    const body: OwnerGuardianContactBody = {
      organizationId,
      locationId,
      kind,
      expectedContactId: current?.contactId ?? null,
      expectedValue: current?.value ?? null,
      expectedUpdatedAt: current?.updatedAt ?? null,
      value: normalizedValue,
    };
    const command: PendingOwnerGuardianContact = {
      version: 1,
      organizationId,
      locationId,
      guardianId,
      kind,
      method: "PATCH",
      endpoint: contactEndpoint(guardianId),
      idempotencyKey,
      body: JSON.stringify(body),
    };
    const stored = readPendingOwnerGuardianContact(scope);
    if (stored.kind !== "none" || !persistPending(command)) {
      setPending(stored.kind === "pending" ? stored.command : null);
      setPendingBlocked(stored.kind !== "pending");
      notifyPending(true);
      setMessage(stored.kind === "pending"
        ? "Ya existe una operación de contacto pendiente para esta persona. Revisa y reintenta esa misma operación antes de iniciar otra."
        : "No se pudo guardar y verificar el cuerpo y la clave de esta operación. No se ha enviado el cambio.");
      return;
    }
    setPending(command);
    setPendingBlocked(false);
    setMessage("");
    setMessageKind("error");
    notifyPending(true);
    void sendPending(command, false);
  }

  function retryPending() {
    if (!pending || pendingBlocked || saving || disabled) return;
    setMessage("");
    void sendPending(pending, true);
  }

  const inputDisabled = disabled || operationLocked || loading || Boolean(loadError);
  const editingValue = editingKind === "email" ? emailValue : phoneValue;

  return (
    <section aria-label={`Contactos de ${profileDisplayName}`} className="mt-4 w-full border border-slate-300 bg-slate-50 p-4 sm:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-bold">Contactos del pagador</h4>
          <p className="mt-1 text-sm text-slate-700">Editar estos datos no crea una cuenta, no envía mensajes y no verifica el contacto.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClassName} aria-expanded={profileOpen} onClick={() => {
            if (profileOpen || disabled || contactOperationLocked) return;
            notifyProfileLock(scopeKey, true);
            setProfileOpen(true);
          }} disabled={disabled || operationLocked || saving}>
            {profileOpen ? "Perfil abierto" : "Editar nombre del tutor"}
          </button>
          {onClose && <button type="button" className={secondaryButtonClassName} onClick={onClose} disabled={operationLocked || saving}>Cerrar contactos</button>}
        </div>
      </div>

      {profileOpen && (
        <OwnerGuardianProfileEditor
          key={`${organizationId}:${locationId}:${guardianId}`}
          organizationId={organizationId}
          locationId={locationId}
          guardianId={guardianId}
          // Do not feed the profile's own lock back into this prop: an exact
          // manual replay must remain available while the parent is locked.
          disabled={disabled || contactOperationLocked}
          onLockChange={notifyProfileLock}
          onSaved={(profile) => {
            setProfileDisplayName(`${profile.givenName} ${profile.familyName}`.trim());
          }}
          onClose={() => {
            notifyProfileLock(scopeKey, false);
            setProfileOpen(false);
          }}
        />
      )}

      {loading && <p role="status" className="mt-3 text-sm text-slate-700">Cargando contactos…</p>}
      {loadError && (
        <div className="mt-3 border border-red-300 bg-white p-3">
          <p role="alert" className="text-sm text-red-900">{loadError}</p>
          <button type="button" className={`${secondaryButtonClassName} mt-2`} onClick={() => setLoadRevision((revision) => revision + 1)} disabled={operationLocked}>Volver a cargar</button>
        </div>
      )}
      {message && <p role={messageKind === "error" ? "alert" : "status"} className="mt-3 border border-slate-300 bg-white p-3 text-sm">{message}</p>}

      {contacts && !loading && !loadError && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(["email", "phone"] as const).map((kind) => {
            const current = contacts[kind];
            const editing = editingKind === kind;
            const label = kind === "email" ? "Correo electrónico" : "Teléfono";
            const inputId = `guardian-contact-${kind}-${guardianId}`;
            return (
              <div key={kind} className="border border-slate-300 bg-white p-3">
                <h5 className="font-semibold">{label}</h5>
                <p className="mt-1 break-all text-sm text-slate-800">{current?.value ?? "Sin dato guardado"}</p>
                <p className="mt-1 text-xs text-slate-600">{current?.verifiedAt ? "Verificado por el sistema" : "No verificado"}</p>
                {editing ? (
                  <div className="mt-3 grid gap-2">
                    <label className="text-sm font-semibold" htmlFor={inputId}>{label}
                      <input
                        id={inputId}
                        className={`${fieldClassName} mt-2`}
                        type={kind === "email" ? "email" : "tel"}
                        inputMode={kind === "phone" ? "tel" : "email"}
                        autoComplete={kind === "email" ? "email" : "tel"}
                        maxLength={kind === "email" ? 254 : 32}
                        value={editingValue}
                        onChange={(event) => kind === "email" ? setEmailValue(event.target.value) : setPhoneValue(event.target.value)}
                        disabled={inputDisabled}
                      />
                    </label>
                    {kind === "phone" && <p className="text-xs text-slate-600">Usa + y el prefijo internacional explícito, por ejemplo +34…</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={primaryButtonClassName} onClick={() => submit(kind)} disabled={inputDisabled}>
                        Guardar {kind === "email" ? "correo" : "teléfono"}
                      </button>
                      {!operationLocked && <button type="button" className={secondaryButtonClassName} onClick={() => setEditingKind(null)}>Cancelar</button>}
                    </div>
                  </div>
                ) : (
                  <button type="button" className={`${secondaryButtonClassName} mt-3`} onClick={() => { setEditingKind(kind); setMessage(""); }} disabled={inputDisabled || (editingKind !== null && editingKind !== kind)}>
                    Editar {kind === "email" ? "correo" : "teléfono"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending && (
        <div className="mt-4 border border-amber-400 bg-amber-50 p-3">
          <p className="text-sm text-amber-950">La operación de {pending.kind === "email" ? "correo" : "teléfono"} sigue pendiente. No se volverá a enviar automáticamente.</p>
          <button type="button" className={`${secondaryButtonClassName} mt-2`} onClick={retryPending} disabled={disabled || saving || pendingBlocked}>
            {saving ? "Comprobando contacto…" : "Reintentar la misma operación"}
          </button>
        </div>
      )}
    </section>
  );
}
