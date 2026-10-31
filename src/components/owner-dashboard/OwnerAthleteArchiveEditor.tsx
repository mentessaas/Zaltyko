"use client";

import { useEffect, useRef, useState } from "react";

export const PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY =
  "zaltyko:pending-owner-athlete-archive:v1";

export type PendingOwnerAthleteArchive = Readonly<{
  version: 1;
  organizationId: string;
  locationId: string;
  groupId: string;
  athleteId: string;
  idempotencyKey: string;
  body: string;
}>;

export type OwnerAthleteArchiveReceipt = Readonly<{
  athleteId: string;
  isActive: false;
  replayed: boolean;
}>;

export type PendingOwnerAthleteArchiveRead =
  | { kind: "none" }
  | { kind: "pending"; command: PendingOwnerAthleteArchive }
  | { kind: "invalid" }
  | { kind: "unavailable" };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,150}$/u.test(value);
}

function decodePendingArchive(raw: string): PendingOwnerAthleteArchive | null {
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
      !isIdempotencyKey(value.idempotencyKey) ||
      typeof value.body !== "string"
    ) return null;

    const body: unknown = JSON.parse(value.body);
    if (!isRecord(body) || !exactKeys(body, ["organizationId", "locationId"]) ||
      body.organizationId !== value.organizationId || body.locationId !== value.locationId) {
      return null;
    }
    return value as PendingOwnerAthleteArchive;
  } catch {
    return null;
  }
}

export function readPendingOwnerAthleteArchive(
  storage?: StorageLike
): PendingOwnerAthleteArchiveRead {
  try {
    const target = storage ?? window.sessionStorage;
    const raw = target.getItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY);
    if (raw === null) return { kind: "none" };
    const command = decodePendingArchive(raw);
    return command ? { kind: "pending", command } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

export function pendingOwnerAthleteArchiveMatches(
  command: PendingOwnerAthleteArchive | null,
  scope: { organizationId: string; locationId: string; groupId: string; athleteId: string }
): boolean {
  return Boolean(command &&
    command.organizationId === scope.organizationId &&
    command.locationId === scope.locationId &&
    command.groupId === scope.groupId &&
    command.athleteId === scope.athleteId);
}

function persistPendingArchive(command: PendingOwnerAthleteArchive): boolean {
  const encoded = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    const existing = storage.getItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY);
    if (existing !== null && existing !== encoded) return false;
    storage.setItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY, encoded);
    return storage.getItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY) === encoded &&
      decodePendingArchive(storage.getItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY) ?? "") !== null;
  } catch {
    return false;
  }
}

function clearPendingArchive(command: PendingOwnerAthleteArchive): boolean {
  const expected = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    if (storage.getItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY) !== expected) return false;
    storage.removeItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY);
    return storage.getItem(PENDING_OWNER_ATHLETE_ARCHIVE_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

function readArchiveReceipt(payload: unknown, athleteId: string): OwnerAthleteArchiveReceipt | null {
  if (!isRecord(payload) || !exactKeys(payload, ["ok", "data"]) || payload.ok !== true || !isRecord(payload.data) ||
    !exactKeys(payload.data, ["athleteId", "isActive", "replayed"])) return null;
  const data = payload.data;
  if (data.athleteId !== athleteId || data.isActive !== false || typeof data.replayed !== "boolean") {
    return null;
  }
  return { athleteId, isActive: false, replayed: data.replayed };
}

function isDefinitiveClientProblem(status: number, payload: unknown): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429 &&
    isRecord(payload) && payload.ok === undefined && payload.data === undefined &&
    payload.status === status && typeof payload.title === "string" && typeof payload.detail === "string";
}

function problemMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.detail === "string" && payload.detail.length <= 240) {
    return payload.detail;
  }
  return "No se pudo archivar la ficha. Comprueba la conexión e inténtalo de nuevo.";
}

const buttonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const dangerButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center bg-red-800 px-4 py-2 text-sm font-bold text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:cursor-not-allowed disabled:opacity-50";

export function OwnerAthleteArchiveEditor({
  organizationId,
  locationId,
  groupId,
  athleteId,
  athleteName,
  disabled = false,
  pendingCommand = null,
  onActiveChange,
  onPendingCommandChange,
  onArchived,
}: {
  organizationId: string;
  locationId: string;
  groupId: string;
  athleteId: string;
  athleteName: string;
  disabled?: boolean;
  pendingCommand?: PendingOwnerAthleteArchive | null;
  onActiveChange?: (active: boolean) => void;
  onPendingCommandChange?: (command: PendingOwnerAthleteArchive | null) => void;
  onArchived?: (receipt: OwnerAthleteArchiveReceipt) => void;
}) {
  const scope = { organizationId, locationId, groupId, athleteId };
  const scopeKey = `${organizationId}:${locationId}:${groupId}:${athleteId}`;
  const scopeKeyRef = useRef(scopeKey);
  const scopeGenerationRef = useRef(0);
  if (scopeKeyRef.current !== scopeKey) {
    scopeKeyRef.current = scopeKey;
    scopeGenerationRef.current += 1;
  }
  const mountedRef = useRef(false);
  const sendingRef = useRef(false);
  const uncertainRef = useRef(false);
  const callbackRef = useRef({ onActiveChange, onPendingCommandChange, onArchived });
  callbackRef.current = { onActiveChange, onPendingCommandChange, onArchived };

  const [storageRead, setStorageRead] = useState<PendingOwnerAthleteArchiveRead>({ kind: "unavailable" });
  const [localPending, setLocalPending] = useState<PendingOwnerAthleteArchive | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "status">("error");
  const [completedKey, setCompletedKey] = useState<string | null>(null);

  const matchingLocalPending = pendingOwnerAthleteArchiveMatches(localPending, scope) ? localPending : null;
  const matchingExternalPending = pendingOwnerAthleteArchiveMatches(pendingCommand, scope) ? pendingCommand : null;
  const activePending = matchingLocalPending ?? matchingExternalPending;
  const foreignStoragePending = storageRead.kind === "pending" &&
    !pendingOwnerAthleteArchiveMatches(storageRead.command, scope);
  const foreignExternalPending = pendingCommand !== null && !matchingExternalPending;
  const storageBlocked = storageRead.kind === "invalid" || storageRead.kind === "unavailable" ||
    foreignStoragePending || foreignExternalPending;

  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmationOpen(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage("");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompletedKey(null);
    const current = readPendingOwnerAthleteArchive();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageRead(current);
    if (current.kind === "pending" && pendingOwnerAthleteArchiveMatches(current.command, scope)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalPending(current.command);
      // A persisted command may have reached the server before the page closed.
      // Treat its outcome as uncertain until the user explicitly retries it.
      uncertainRef.current = true;
      callbackRef.current.onPendingCommandChange?.(current.command);
    } else if (current.kind !== "pending") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalPending(null);
    }
    return () => {
      mountedRef.current = false;
      sendingRef.current = false;
      callbackRef.current.onActiveChange?.(false);
    };
    // Scope changes remount the logical editor and re-read the single durable command.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  function setActive(active: boolean) {
    callbackRef.current.onActiveChange?.(active);
  }

  function openConfirmation() {
    if (disabled || storageBlocked || completedKey === activePending?.idempotencyKey) return;
    setConfirmationOpen(true);
    setMessage("");
    setActive(true);
  }

  function closeConfirmation() {
    if (saving) return;
    setConfirmationOpen(false);
    setActive(false);
  }

  async function confirmArchive() {
    if (disabled || saving || sendingRef.current || storageBlocked) return;
    let command = activePending;
    if (!command) {
      uncertainRef.current = false;
      let idempotencyKey: string;
      try {
        idempotencyKey = crypto.randomUUID();
      } catch {
        setMessage("No se pudo preparar una clave segura. No se ha enviado el archivo.");
        setMessageKind("error");
        return;
      }
      command = {
        version: 1,
        ...scope,
        idempotencyKey,
        body: JSON.stringify({ organizationId, locationId }),
      };
    } else {
      // A supplied or restored command predates this explicit click, so its
      // server outcome is ambiguous until this exact-key retry returns a receipt.
      uncertainRef.current = true;
    }

    // A pending command may be retried only after an explicit click. New and
    // recovered commands are both persisted and read back before any POST.
    if (!persistPendingArchive(command)) {
      setStorageRead({ kind: "unavailable" });
      setMessage("No se pudo guardar y verificar la operación pendiente. No se ha enviado el archivo.");
      setMessageKind("error");
      return;
    }
    setStorageRead({ kind: "pending", command });
    setLocalPending(command);
    setCompletedKey(null);
    callbackRef.current.onPendingCommandChange?.(command);
    sendingRef.current = true;
    setSaving(true);
    setMessage("");
    const requestScope = scopeKey;
    const requestGeneration = scopeGenerationRef.current;
    let responseConfirmed = false;
    try {
      const response = await fetch(
        `/api/v1/owner/athletes/${encodeURIComponent(athleteId)}/archive`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": command.idempotencyKey,
          },
          body: command.body,
        }
      );
      const payload = await response.json().catch(() => null);
      const receipt = response.ok && (response.status === 200 || response.status === 201)
        ? readArchiveReceipt(payload, athleteId)
        : null;
      const sameScope = mountedRef.current && scopeKeyRef.current === requestScope &&
        scopeGenerationRef.current === requestGeneration;

      if (receipt && sameScope) {
        if (!clearPendingArchive(command)) {
          uncertainRef.current = true;
          setMessage("El servidor confirmó el archivo, pero no se pudo limpiar el reintento. Conservamos la misma operación para volver a comprobarla.");
          setMessageKind("error");
          return;
        }
        responseConfirmed = true;
        uncertainRef.current = false;
        setLocalPending(null);
        setStorageRead({ kind: "none" });
        setCompletedKey(command.idempotencyKey);
        setMessage("Ficha archivada. Se conserva el historial y las cuotas pendientes.");
        setMessageKind("status");
        callbackRef.current.onPendingCommandChange?.(null);
        callbackRef.current.onArchived?.(receipt);
        setConfirmationOpen(false);
        setActive(false);
        return;
      }

      if (!sameScope) {
        uncertainRef.current = true;
        return;
      }

      if (!uncertainRef.current && isDefinitiveClientProblem(response.status, payload)) {
        if (!clearPendingArchive(command)) {
          uncertainRef.current = true;
          setMessage("El servidor rechazó el archivo, pero no se pudo verificar la limpieza del reintento. Conservamos la misma operación.");
          setMessageKind("error");
          return;
        }
        setLocalPending(null);
        setStorageRead({ kind: "none" });
        callbackRef.current.onPendingCommandChange?.(null);
        setMessage(problemMessage(payload));
        setMessageKind("error");
        return;
      }

      uncertainRef.current = true;
      setMessage(response.ok
        ? "La respuesta no confirmó el archivo. Conservamos la misma operación; puedes volver a comprobarla manualmente."
        : problemMessage(payload));
      setMessageKind("error");
    } catch {
      if (!responseConfirmed && mountedRef.current && scopeKeyRef.current === requestScope &&
        scopeGenerationRef.current === requestGeneration) {
        uncertainRef.current = true;
        setMessage("No sabemos si se archivó. Reintenta manualmente la misma operación; conservaremos su cuerpo y clave para evitar duplicados.");
        setMessageKind("error");
      }
    } finally {
      sendingRef.current = false;
      if (mountedRef.current && scopeKeyRef.current === requestScope &&
        scopeGenerationRef.current === requestGeneration) setSaving(false);
    }
  }

  const triggerLabel = activePending
    ? `Resolver archivo pendiente de ${athleteName}`
    : `Archivar ficha de ${athleteName}`;

  return (
    <section aria-label={`Archivo de ficha de ${athleteName}`} className="space-y-3">
      <button type="button" className={buttonClassName} disabled={disabled || storageBlocked || completedKey !== null} onClick={openConfirmation}>
        {triggerLabel}
      </button>
      {!confirmationOpen && storageRead.kind === "invalid" && <p role="alert">Hay una operación de archivo no válida en el almacenamiento. No se iniciará otra.</p>}
      {!confirmationOpen && storageRead.kind === "unavailable" && <p role="alert">No se puede comprobar el almacenamiento seguro de esta operación. No se ha enviado nada.</p>}
      {(foreignStoragePending || foreignExternalPending) && <p role="alert">Hay un archivo pendiente de otra ficha o sede. Resuélvelo antes de iniciar otra operación.</p>}
      {confirmationOpen && (
        <div role="group" className="space-y-3 rounded border border-red-300 bg-red-50 p-4" aria-label="Confirmación de archivo">
          <p className="text-sm text-slate-900">
            Archivar no borra la ficha. Termina sus pertenencias a grupos y clases futuras, y conserva su historial y las cuotas pendientes.
          </p>
          {activePending && <p role="status">Hay una respuesta pendiente de confirmar. El reintento usará exactamente el mismo cuerpo y la misma clave; no se enviará automáticamente.</p>}
          {message && <p role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={dangerButtonClassName} disabled={disabled || saving || storageBlocked} onClick={() => void confirmArchive()}>
              {saving ? "Comprobando archivo…" : activePending ? "Reintentar archivo" : "Confirmar archivo"}
            </button>
            <button type="button" className={buttonClassName} disabled={saving} onClick={closeConfirmation}>Cancelar</button>
          </div>
        </div>
      )}
      {!confirmationOpen && message && <p role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
    </section>
  );
}
