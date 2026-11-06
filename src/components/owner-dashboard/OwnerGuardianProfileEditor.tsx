"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

export const PENDING_OWNER_GUARDIAN_PROFILE_STORAGE_KEY =
  "zaltyko:pending-owner-guardian-profile:v1";

export type OwnerGuardianProfileDto = Readonly<{
  guardianId: string;
  givenName: string;
  familyName: string;
  updatedAt: string;
}>;

export type OwnerGuardianProfileBody = Readonly<{
  organizationId: string;
  locationId: string;
  expectedGivenName: string;
  expectedFamilyName: string;
  expectedUpdatedAt: string;
  givenName: string;
  familyName: string;
}>;

export type PendingOwnerGuardianProfile = Readonly<{
  version: 1;
  organizationId: string;
  locationId: string;
  guardianId: string;
  method: "PATCH";
  endpoint: string;
  idempotencyKey: string;
  body: string;
}>;

type PendingRead =
  | { kind: "none" }
  | { kind: "pending"; command: PendingOwnerGuardianProfile }
  | { kind: "invalid" }
  | { kind: "unavailable" };
type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ProfileScope = Readonly<{
  organizationId: string;
  locationId: string;
  guardianId: string;
}>;

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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value));
}

function endpoint(guardianId: string): string {
  return `/api/v1/owner/guardians/${encodeURIComponent(guardianId)}/profile`;
}

function storageKey(scope: ProfileScope): string {
  return `${PENDING_OWNER_GUARDIAN_PROFILE_STORAGE_KEY}:${scope.organizationId}:${scope.locationId}:${scope.guardianId}`;
}

export function normalizeGuardianProfileName(value: string): string | null {
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > 100 || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}

function parseBody(raw: string, scope: ProfileScope): OwnerGuardianProfileBody | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !exactKeys(value, [
      "organizationId", "locationId", "expectedGivenName", "expectedFamilyName",
      "expectedUpdatedAt", "givenName", "familyName",
    ]) || value.organizationId !== scope.organizationId || value.locationId !== scope.locationId ||
      typeof value.expectedGivenName !== "string" || value.expectedGivenName.length > 500 ||
      typeof value.expectedFamilyName !== "string" || value.expectedFamilyName.length > 500 ||
      !isVersion(value.expectedUpdatedAt) || typeof value.givenName !== "string" ||
      typeof value.familyName !== "string") return null;
    const givenName = normalizeGuardianProfileName(value.givenName);
    const familyName = normalizeGuardianProfileName(value.familyName);
    if (givenName !== value.givenName || familyName !== value.familyName) return null;
    return {
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      expectedGivenName: value.expectedGivenName,
      expectedFamilyName: value.expectedFamilyName,
      expectedUpdatedAt: value.expectedUpdatedAt,
      givenName,
      familyName,
    };
  } catch {
    return null;
  }
}

function decodePending(raw: string, scope: ProfileScope): PendingOwnerGuardianProfile | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !exactKeys(value, [
      "version", "organizationId", "locationId", "guardianId", "method", "endpoint",
      "idempotencyKey", "body",
    ]) || value.version !== 1 || value.organizationId !== scope.organizationId ||
      value.locationId !== scope.locationId || value.guardianId !== scope.guardianId ||
      value.method !== "PATCH" || value.endpoint !== endpoint(scope.guardianId) ||
      !isUuid(value.idempotencyKey) || typeof value.body !== "string" ||
      !parseBody(value.body, scope)) return null;
    return {
      version: 1,
      organizationId: scope.organizationId,
      locationId: scope.locationId,
      guardianId: scope.guardianId,
      method: "PATCH",
      endpoint: endpoint(scope.guardianId),
      idempotencyKey: value.idempotencyKey,
      body: value.body,
    };
  } catch {
    return null;
  }
}

export function readPendingOwnerGuardianProfile(
  scope: ProfileScope,
  storage?: SessionStorageLike
): PendingRead {
  try {
    const raw = (storage ?? window.sessionStorage).getItem(storageKey(scope));
    if (raw === null) return { kind: "none" };
    const command = decodePending(raw, scope);
    return command ? { kind: "pending", command } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

function persistPending(command: PendingOwnerGuardianProfile): boolean {
  const encoded = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    const key = storageKey(command);
    const current = storage.getItem(key);
    if (current !== null) return current === encoded;
    storage.setItem(key, encoded);
    return storage.getItem(key) === encoded && Boolean(decodePending(encoded, command));
  } catch {
    return false;
  }
}

function clearPending(command: PendingOwnerGuardianProfile): boolean {
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

function readProfile(payload: unknown, guardianId: string): OwnerGuardianProfileDto | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data) ||
    !exactKeys(payload.data, ["guardianId", "givenName", "familyName", "updatedAt"]) ||
    payload.data.guardianId !== guardianId || typeof payload.data.givenName !== "string" ||
    typeof payload.data.familyName !== "string" || !isVersion(payload.data.updatedAt)) return null;
  return {
    guardianId,
    givenName: payload.data.givenName,
    familyName: payload.data.familyName,
    updatedAt: payload.data.updatedAt,
  };
}

function readUpdate(
  status: number,
  payload: unknown,
  command: PendingOwnerGuardianProfile
): (OwnerGuardianProfileDto & { replayed: boolean }) | null {
  if (status !== 200 || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data) ||
    !exactKeys(payload.data, ["guardianId", "givenName", "familyName", "updatedAt", "replayed"]) ||
    payload.data.guardianId !== command.guardianId || typeof payload.data.givenName !== "string" ||
    typeof payload.data.familyName !== "string" || !isVersion(payload.data.updatedAt) ||
    typeof payload.data.replayed !== "boolean") return null;
  const body = parseBody(command.body, command);
  if (!body || (!payload.data.replayed &&
    (payload.data.givenName !== body.givenName || payload.data.familyName !== body.familyName))) return null;
  return {
    guardianId: command.guardianId,
    givenName: payload.data.givenName,
    familyName: payload.data.familyName,
    updatedAt: payload.data.updatedAt,
    replayed: payload.data.replayed,
  };
}

function problemType(status: number, payload: unknown): string | null {
  if (status < 400 || status >= 500 || !isRecord(payload) || payload.status !== status ||
    typeof payload.type !== "string" || !payload.type.startsWith("https://zaltyko.com/problems/")) return null;
  return payload.type.slice("https://zaltyko.com/problems/".length);
}

function problemMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail.length <= 240 ? payload.detail : "No se pudo guardar el perfil del tutor.";
  }
  return "No se pudo cargar el perfil del tutor. Comprueba la conexión e inténtalo otra vez.";
}

export function OwnerGuardianProfileEditor({
  organizationId,
  locationId,
  guardianId,
  disabled = false,
  onSaved,
  onLockChange,
  onClose,
}: {
  organizationId: string;
  locationId: string;
  guardianId: string;
  disabled?: boolean;
  onSaved?: (profile: OwnerGuardianProfileDto) => void;
  onLockChange?: (scopeKey: string, locked: boolean) => void;
  onClose?: () => void;
}) {
  const scope: ProfileScope = { organizationId, locationId, guardianId };
  const scopeKey = `${organizationId}:${locationId}:${guardianId}`;
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;
  const mountedRef = useRef(false);
  const sendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const onLockChangeRef = useRef(onLockChange);
  onLockChangeRef.current = onLockChange;
  const [profile, setProfile] = useState<OwnerGuardianProfileDto | null>(null);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [pending, setPending] = useState<PendingOwnerGuardianProfile | null>(null);
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loadRevision, setLoadRevision] = useState(0);

  function setCurrentProfile(next: OwnerGuardianProfileDto) {
    setProfile(next);
    setGivenName(next.givenName);
    setFamilyName(next.familyName);
  }

  async function fetchProfile(signal?: AbortSignal): Promise<OwnerGuardianProfileDto | null> {
    const requestScope = scopeKey;
    const query = new URLSearchParams({ organizationId, locationId });
    try {
      const response = await fetch(`${endpoint(guardianId)}?${query.toString()}`, {
        cache: "no-store",
        ...(signal ? { signal } : {}),
      });
      const payload = await response.json().catch(() => null);
      if (signal?.aborted || scopeKeyRef.current !== requestScope) return null;
      if (response.status !== 200) {
        setError(problemMessage(payload));
        return null;
      }
      const next = readProfile(payload, guardianId);
      if (!next) {
        setError("El perfil recibido no tiene el formato esperado. No se permitirán cambios.");
        return null;
      }
      setCurrentProfile(next);
      setError("");
      return next;
    } catch {
      if (!signal?.aborted) setError("No se pudo cargar el perfil del tutor. Comprueba la conexión e inténtalo otra vez.");
      return null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    const requestScope = scopeKey;
    // Presence in the contacts editor is itself an active shared-profile
    // operation. Its parent holds this guard until this exact scope unmounts.
    onLockChangeRef.current?.(requestScope, true);
    const restored = readPendingOwnerGuardianProfile(scope);
    const markerError = restored.kind === "invalid" || restored.kind === "unavailable"
      ? "No se pudo verificar el marcador de una operación anterior. Se bloquean los envíos hasta recargar la sesión."
      : "";
    if (restored.kind === "pending") {
      // A restored request is never sent on mount. The only retry path is the
      // explicit button below, which performs a fresh GET before reusing it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(restored.command);
    } else if (restored.kind === "invalid" || restored.kind === "unavailable") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingBlocked(true);
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void fetchProfile(controller.signal).finally(() => {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoading(false);
        if (markerError) setError(markerError);
      }
    });
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      onLockChangeRef.current?.(requestScope, false);
    };
    // Scope changes must re-read the matching per-scope pending marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, loadRevision]);

  async function preflight(command: PendingOwnerGuardianProfile, retry: boolean): Promise<boolean> {
    const current = await fetchProfile();
    if (!current || scopeKeyRef.current !== `${command.organizationId}:${command.locationId}:${command.guardianId}`) {
      return false;
    }
    const body = parseBody(command.body, command);
    if (!body) return false;
    const snapshotMatches = current.givenName === body.expectedGivenName &&
      current.familyName === body.expectedFamilyName && current.updatedAt === body.expectedUpdatedAt;
    if (!snapshotMatches && !retry) {
      if (clearPending(command)) {
        setPending(null);
        setError("El perfil cambió antes de guardar. Se muestran los nombres actuales; revisa y vuelve a preparar el cambio.");
      } else {
        setPendingBlocked(true);
        setError("El perfil cambió, pero no se pudo limpiar el marcador. La operación permanece bloqueada para evitar un reenvío distinto.");
      }
      return false;
    }
    return true;
  }

  async function sendCommand(command: PendingOwnerGuardianProfile, retry: boolean) {
    // A previously persisted command must remain manually replayable even if
    // the parent has since become read-only. The server re-checks current
    // authorization, and this path reuses the exact scoped key and body.
    if (sendingRef.current || (disabled && !retry) || scopeKeyRef.current !== `${command.organizationId}:${command.locationId}:${command.guardianId}`) return;
    sendingRef.current = true;
    setSaving(true);
    setError("");
    setStatus("");
    let keepPending = false;
    try {
      if (!await preflight(command, retry)) {
        keepPending = readPendingOwnerGuardianProfile(command).kind === "pending";
        return;
      }
      const response = await fetch(command.endpoint, {
        method: command.method,
        headers: { "content-type": "application/json", "Idempotency-Key": command.idempotencyKey },
        body: command.body,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!mountedRef.current || scopeKeyRef.current !== `${command.organizationId}:${command.locationId}:${command.guardianId}`) return;
      const receipt = readUpdate(response.status, payload, command);
      if (receipt) {
        if (!clearPending(command)) {
          keepPending = true;
          setPending(command);
          setPendingBlocked(false);
          setError("El servidor confirmó el perfil, pero no se pudo limpiar el marcador. Conservamos la misma operación para comprobarla otra vez.");
          return;
        }
        setPending(null);
        setPendingBlocked(false);
        const { replayed: _replayed, ...currentProfile } = receipt;
        setCurrentProfile(currentProfile);
        setStatus(receipt.replayed
          ? "La operación ya estaba registrada; se muestran los nombres actuales del tutor."
          : "Perfil del tutor actualizado.");
        onSaved?.(currentProfile);
        return;
      }

      const type = problemType(response.status, payload);
      if (response.status === 409 && type === "version-conflict") {
        const fresh = await fetchProfile();
        if (fresh && clearPending(command)) {
          setPending(null);
          setPendingBlocked(false);
          setError("El perfil cambió desde la última lectura. Se muestran los nombres actuales; revisa antes de preparar otro cambio.");
        } else {
          keepPending = true;
          setPending(command);
          setPendingBlocked(true);
          setError("Hubo un conflicto de versión y no se pudo confirmar la lectura actual. Conservamos el comando exacto y bloqueamos nuevos envíos.");
        }
        return;
      }
      if (response.status === 409 && type === "idempotency-conflict") {
        keepPending = true;
        setPending(command);
        setPendingBlocked(true);
        setError("La clave ya pertenece a otra operación. Conservamos este marcador y bloqueamos los reintentos.");
        return;
      }
      const definitive = response.status >= 400 && response.status < 500 &&
        ![408, 425, 429].includes(response.status) && isRecord(payload) &&
        payload.status === response.status && typeof payload.title === "string" && typeof payload.type === "string";
      if (definitive && !retry) {
        if (clearPending(command)) {
          setPending(null);
          setPendingBlocked(false);
          setError(problemMessage(payload));
        } else {
          keepPending = true;
          setPending(command);
          setError("El servidor rechazó el cambio, pero el marcador no se pudo limpiar. No prepararemos otra operación.");
        }
        return;
      }
      keepPending = true;
      setPending(command);
      setError("No se sabe si se guardó el perfil. Conservamos exactamente el cuerpo y la clave; comprueba y reintenta solo desde este botón.");
    } catch {
      if (!mountedRef.current || scopeKeyRef.current !== `${command.organizationId}:${command.locationId}:${command.guardianId}`) return;
      keepPending = true;
      setPending(command);
      setError("No se sabe si se guardó el perfil. Conservamos exactamente el cuerpo y la clave; comprueba y reintenta solo desde este botón.");
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSaving(false);
      if (!keepPending && pending) setPendingBlocked(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving || loading || pending || pendingBlocked || !profile) return;
    const nextGivenName = normalizeGuardianProfileName(givenName);
    const nextFamilyName = normalizeGuardianProfileName(familyName);
    if (!nextGivenName || !nextFamilyName) {
      setError("Escribe un nombre y apellidos válidos.");
      return;
    }
    if (nextGivenName === profile.givenName && nextFamilyName === profile.familyName) {
      setError("Indica un cambio en el nombre o los apellidos.");
      return;
    }
    let idempotencyKey: string;
    try {
      idempotencyKey = crypto.randomUUID();
    } catch {
      setError("No se pudo generar una clave segura. No se enviará el cambio.");
      return;
    }
    const body: OwnerGuardianProfileBody = {
      organizationId,
      locationId,
      expectedGivenName: profile.givenName,
      expectedFamilyName: profile.familyName,
      expectedUpdatedAt: profile.updatedAt,
      givenName: nextGivenName,
      familyName: nextFamilyName,
    };
    const command: PendingOwnerGuardianProfile = {
      version: 1,
      organizationId,
      locationId,
      guardianId,
      method: "PATCH",
      endpoint: endpoint(guardianId),
      idempotencyKey,
      body: JSON.stringify(body),
    };
    if (readPendingOwnerGuardianProfile(scope).kind !== "none" || !persistPending(command)) {
      setPendingBlocked(true);
      setError("No se pudo verificar el almacenamiento del comando exacto. No se enviará el cambio.");
      return;
    }
    setPending(command);
    await sendCommand(command, false);
  }

  const operationLocked = Boolean(pending || pendingBlocked || saving);
  return (
    <section className="mt-3 w-full border border-slate-300 bg-white p-4" aria-label="Perfil del tutor">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-bold">Nombre del tutor</h4>
          <p className="mt-1 text-sm text-slate-700">El perfil se comparte entre las familias de esta academia. No se envían correos ni se cambian cuentas.</p>
        </div>
        {onClose && <button type="button" className={secondaryButtonClassName} onClick={onClose} disabled={operationLocked}>Cerrar perfil</button>}
      </div>

      {loading && <p role="status" className="mt-3 text-sm text-slate-700">Cargando perfil…</p>}
      {error && <p role="alert" className="mt-3 border border-red-300 bg-red-50 p-3 text-sm text-red-950">{error}</p>}
      {status && <p role="status" className="mt-3 border border-teal-300 bg-teal-50 p-3 text-sm text-slate-900">{status}</p>}

      {pending ? (
        <div className="mt-4 border border-amber-400 bg-amber-50 p-3">
          <p className="text-sm text-amber-950">Hay un cambio pendiente. Antes de cada intento se volverán a leer los nombres y la versión actuales; el formulario no enviará nada automáticamente al abrirse.</p>
          <button type="button" className={`${secondaryButtonClassName} mt-2`} onClick={() => void sendCommand(pending, true)} disabled={saving || pendingBlocked || loading}>
            {saving ? "Comprobando y guardando…" : "Comprobar y reintentar el mismo cambio"}
          </button>
        </div>
      ) : profile && !loading ? (
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-semibold" htmlFor={`guardian-given-name-${guardianId}`}>
            Nombre
            <input id={`guardian-given-name-${guardianId}`} className={`${fieldClassName} mt-2`} value={givenName} onChange={(event) => setGivenName(event.target.value)} maxLength={100} autoComplete="given-name" disabled={disabled || operationLocked} required />
          </label>
          <label className="block text-sm font-semibold" htmlFor={`guardian-family-name-${guardianId}`}>
            Apellidos
            <input id={`guardian-family-name-${guardianId}`} className={`${fieldClassName} mt-2`} value={familyName} onChange={(event) => setFamilyName(event.target.value)} maxLength={100} autoComplete="family-name" disabled={disabled || operationLocked} required />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className={primaryButtonClassName} disabled={disabled || operationLocked || loading}>Guardar nombre del tutor</button>
            <button type="button" className={secondaryButtonClassName} onClick={() => setLoadRevision((value) => value + 1)} disabled={operationLocked}>Volver a leer</button>
          </div>
        </form>
      ) : !loading ? (
        <button type="button" className={`${secondaryButtonClassName} mt-3`} onClick={() => setLoadRevision((value) => value + 1)} disabled={operationLocked}>Volver a cargar el perfil</button>
      ) : null}
    </section>
  );
}
