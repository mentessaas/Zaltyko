"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

export const PENDING_OWNER_ATHLETE_PROFILE_STORAGE_KEY =
  "zaltyko:pending-owner-athlete-profile:v1";

export type OwnerAthleteProfileBody = Readonly<{
  organizationId: string;
  locationId: string;
  expectedGivenName: string;
  expectedFamilyName: string;
  givenName: string;
  familyName: string;
}>;

export type PendingOwnerAthleteProfileUpdate = Readonly<{
  version: 1;
  organizationId: string;
  locationId: string;
  groupId: string;
  athleteId: string;
  idempotencyKey: string;
  body: string;
}>;

export type PendingOwnerAthleteProfileRead =
  | { kind: "none" }
  | { kind: "pending"; command: PendingOwnerAthleteProfileUpdate }
  | { kind: "invalid" }
  | { kind: "unavailable" };

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const bodyKeys = [
  "organizationId",
  "locationId",
  "expectedGivenName",
  "expectedFamilyName",
  "givenName",
  "familyName",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function decodePendingOwnerAthleteProfile(
  raw: string
): PendingOwnerAthleteProfileUpdate | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !exactKeys(value, [
      "version", "organizationId", "locationId", "groupId", "athleteId", "idempotencyKey", "body",
    ])) return null;

    if (
      value.version !== 1 ||
      typeof value.organizationId !== "string" || !value.organizationId ||
      typeof value.locationId !== "string" || !value.locationId ||
      typeof value.groupId !== "string" || !value.groupId ||
      typeof value.athleteId !== "string" || !value.athleteId ||
      typeof value.idempotencyKey !== "string" || !value.idempotencyKey ||
      typeof value.body !== "string"
    ) return null;

    const bodyValue: unknown = JSON.parse(value.body);
    if (!isRecord(bodyValue) || !exactKeys(bodyValue, bodyKeys)) return null;
    if (
      bodyValue.organizationId !== value.organizationId ||
      bodyValue.locationId !== value.locationId ||
      !bodyKeys.slice(2).every((key) => typeof bodyValue[key] === "string")
    ) return null;

    return {
      version: 1,
      organizationId: value.organizationId,
      locationId: value.locationId,
      groupId: value.groupId,
      athleteId: value.athleteId,
      idempotencyKey: value.idempotencyKey,
      body: value.body,
    };
  } catch {
    return null;
  }
}

export function readPendingOwnerAthleteProfile(
  storage?: SessionStorageLike
): PendingOwnerAthleteProfileRead {
  try {
    const target = storage ?? window.sessionStorage;
    const raw = target.getItem(PENDING_OWNER_ATHLETE_PROFILE_STORAGE_KEY);
    if (raw === null) return { kind: "none" };
    const command = decodePendingOwnerAthleteProfile(raw);
    return command ? { kind: "pending", command } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

function persistPendingOwnerAthleteProfile(
  command: PendingOwnerAthleteProfileUpdate
): boolean {
  const encoded = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    storage.setItem(PENDING_OWNER_ATHLETE_PROFILE_STORAGE_KEY, encoded);
    return storage.getItem(PENDING_OWNER_ATHLETE_PROFILE_STORAGE_KEY) === encoded;
  } catch {
    return false;
  }
}

function clearPendingOwnerAthleteProfile(
  command: PendingOwnerAthleteProfileUpdate
): boolean {
  const expected = JSON.stringify(command);
  try {
    const storage = window.sessionStorage;
    if (storage.getItem(PENDING_OWNER_ATHLETE_PROFILE_STORAGE_KEY) !== expected) return false;
    storage.removeItem(PENDING_OWNER_ATHLETE_PROFILE_STORAGE_KEY);
    return storage.getItem(PENDING_OWNER_ATHLETE_PROFILE_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

type ProfileDto = { athleteId: string; givenName: string; familyName: string };

function readProfileDto(payload: unknown, athleteId: string): ProfileDto | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) return null;
  const data = payload.data;
  if (!exactKeys(data, ["athleteId", "givenName", "familyName"])) return null;
  if (
    data.athleteId !== athleteId ||
    typeof data.givenName !== "string" ||
    typeof data.familyName !== "string"
  ) return null;
  return { athleteId, givenName: data.givenName, familyName: data.familyName };
}

function readUpdateDto(
  payload: unknown,
  command: PendingOwnerAthleteProfileUpdate
): (ProfileDto & { replayed: boolean }) | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) return null;
  const data = payload.data;
  if (!exactKeys(data, ["athleteId", "givenName", "familyName", "replayed"])) return null;
  const body = JSON.parse(command.body) as OwnerAthleteProfileBody;
  if (
    data.athleteId !== command.athleteId ||
    typeof data.givenName !== "string" ||
    typeof data.familyName !== "string" ||
    typeof data.replayed !== "boolean" ||
    (!data.replayed && (data.givenName !== body.givenName || data.familyName !== body.familyName))
  ) return null;
  // An idempotent replay proves the original command, but the profile may have
  // been edited again since then. Use the server's current names, never stale
  // names from the saved request body.
  return { athleteId: command.athleteId, givenName: data.givenName, familyName: data.familyName, replayed: data.replayed };
}

function isDefinitiveClientProblem(status: number, payload: unknown): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429 &&
    isRecord(payload) && payload.status === status && typeof payload.title === "string";
}

function problemMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.detail === "string" && payload.detail.length <= 240) {
    return payload.detail;
  }
  return "No se pudo guardar la ficha. Comprueba los datos y vuelve a intentarlo.";
}

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:bg-slate-100";
const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

export function pendingOwnerAthleteProfileMatches(
  command: PendingOwnerAthleteProfileUpdate | null,
  scope: { organizationId: string; locationId: string; groupId: string; athleteId: string }
): boolean {
  return Boolean(command &&
    command.organizationId === scope.organizationId &&
    command.locationId === scope.locationId &&
    command.groupId === scope.groupId &&
    command.athleteId === scope.athleteId);
}

export function OwnerAthleteProfileEditor({
  organizationId,
  locationId,
  groupId,
  athleteId,
  athleteName,
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
  /** Display-only; never parsed to initialize the editable fields. */
  athleteName: string;
  disabled?: boolean;
  readOnly?: boolean;
  pendingCommand?: PendingOwnerAthleteProfileUpdate | null;
  onActiveChange?: (active: boolean) => void;
  onPendingCommandChange?: (command: PendingOwnerAthleteProfileUpdate | null) => void;
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<ProfileDto | null>(null);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "status">("error");
  const [completedNotice, setCompletedNotice] = useState("");
  const [localPending, setLocalPending] = useState<PendingOwnerAthleteProfileUpdate | null>(null);

  const scope = { organizationId, locationId, groupId, athleteId };
  const matchingLocalPending = pendingOwnerAthleteProfileMatches(localPending, scope)
    ? localPending
    : null;
  const recoveredCommand = pendingOwnerAthleteProfileMatches(pendingCommand, scope)
    ? pendingCommand
    : null;
  const activePending = matchingLocalPending ?? recoveredCommand;

  useEffect(() => {
    mountedRef.current = true;
    // A changed route scope must discard the old form and abort its GET. A PATCH
    // remains in sessionStorage and is still fenced by the parent manager.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOpen(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(false);
    loadingRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedProfile(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage("");
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      onActiveChangeRef.current?.(false);
    };
  }, [scopeKey]);

  async function loadProfile() {
    if (loadingRef.current) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestScope = scopeKey;
    loadingRef.current = true;
    setLoading(true);
    setMessage("");
    setMessageKind("error");
    onActiveChange?.(true);
    try {
      const query = new URLSearchParams({ organizationId, locationId });
      const response = await fetch(
        `/api/v1/owner/athletes/${encodeURIComponent(athleteId)}?${query.toString()}`,
        { cache: "no-store", signal: controller.signal }
      );
      const payload = await response.json().catch(() => null);
      if (controller.signal.aborted || scopeKeyRef.current !== requestScope) return;
      const profile = response.status === 200 ? readProfileDto(payload, athleteId) : null;
      if (!profile) {
        setLoadedProfile(null);
        setMessage("No se pudo cargar la ficha en esta sede. Comprueba la conexión y vuelve a intentarlo.");
        return;
      }
      setLoadedProfile(profile);
      setGivenName(profile.givenName);
      setFamilyName(profile.familyName);
      setMessage("");
    } catch {
      if (!controller.signal.aborted && scopeKeyRef.current === requestScope) {
        setLoadedProfile(null);
        setMessage("No se pudo cargar la ficha. Comprueba la conexión y vuelve a intentarlo.");
      }
    } finally {
      if (scopeKeyRef.current === requestScope && !controller.signal.aborted) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }

  function closeEditor() {
    if (activePending || saving) return;
    controllerRef.current?.abort();
    setIsOpen(false);
    setLoadedProfile(null);
    setMessage("");
    onActiveChange?.(false);
  }

  async function sendCommand(command: PendingOwnerAthleteProfileUpdate) {
    if (sendingRef.current || scopeKeyRef.current !== `${command.organizationId}:${command.locationId}:${command.groupId}:${command.athleteId}`) return;
    sendingRef.current = true;
    setSaving(true);
    setMessage("");
    onActiveChange?.(true);
    let uncertain = false;
    try {
      const response = await fetch(`/api/v1/owner/athletes/${encodeURIComponent(command.athleteId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "Idempotency-Key": command.idempotencyKey },
        body: command.body,
      });
      const payload = await response.json().catch(() => null);
      if (!mountedRef.current || scopeKeyRef.current !== `${command.organizationId}:${command.locationId}:${command.groupId}:${command.athleteId}`) return;
      const receipt = response.status === 200 ? readUpdateDto(payload, command) : null;
      if (receipt) {
        if (!clearPendingOwnerAthleteProfile(command)) {
          uncertain = true;
          setLocalPending(command);
          onPendingCommandChange?.(command);
          setMessage("El servidor confirmó la ficha, pero no se pudo limpiar el marcador de esta sesión. Conservamos la misma operación para comprobarla otra vez.");
          return;
        }
        setLocalPending(null);
        onPendingCommandChange?.(null);
        setLoadedProfile(receipt);
        setGivenName(receipt.givenName);
        setFamilyName(receipt.familyName);
        setMessageKind("status");
        setMessage("");
        setCompletedNotice("Ficha actualizada.");
        onActiveChange?.(false);
        setIsOpen(false);
        onSaved?.();
        return;
      }

      if (isDefinitiveClientProblem(response.status, payload)) {
        if (!clearPendingOwnerAthleteProfile(command)) {
          uncertain = true;
          setLocalPending(command);
          onPendingCommandChange?.(command);
          setMessage("El servidor rechazó el cambio, pero no se pudo limpiar el marcador de esta sesión. No iniciaremos otra operación.");
          return;
        }
        setLocalPending(null);
        onPendingCommandChange?.(null);
        setLoadedProfile(null);
        setMessageKind("error");
        setMessage(response.status === 409
          ? "La ficha cambió desde que se cargó. Vuelve a cargarla antes de guardar otro cambio."
          : problemMessage(payload));
        return;
      }

      uncertain = true;
      setLocalPending(command);
      onPendingCommandChange?.(command);
      setMessage("No sabemos si se guardó la ficha. Conservamos la solicitud original y su clave; reintenta solo desde este botón.");
    } catch {
      if (mountedRef.current && scopeKeyRef.current === `${command.organizationId}:${command.locationId}:${command.groupId}:${command.athleteId}`) {
        uncertain = true;
        setLocalPending(command);
        onPendingCommandChange?.(command);
        setMessage("No sabemos si se guardó la ficha. Conservamos la solicitud original y su clave; reintenta solo desde este botón.");
      }
    } finally {
      if (mountedRef.current && scopeKeyRef.current === `${command.organizationId}:${command.locationId}:${command.groupId}:${command.athleteId}`) {
        setSaving(false);
        sendingRef.current = false;
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loadedProfile || activePending || sendingRef.current || readOnly) return;
    const nextGivenName = givenName.trim().normalize("NFC").replace(/\s+/gu, " ");
    const nextFamilyName = familyName.trim().normalize("NFC").replace(/\s+/gu, " ");
    if (!nextGivenName || !nextFamilyName) {
      setMessage("Escribe el nombre y los apellidos.");
      setMessageKind("error");
      return;
    }
    const body: OwnerAthleteProfileBody = {
      organizationId,
      locationId,
      expectedGivenName: loadedProfile.givenName,
      expectedFamilyName: loadedProfile.familyName,
      givenName: nextGivenName,
      familyName: nextFamilyName,
    };
    const command: PendingOwnerAthleteProfileUpdate = {
      version: 1,
      organizationId,
      locationId,
      groupId,
      athleteId,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify(body),
    };
    if (!persistPendingOwnerAthleteProfile(command)) {
      setMessage("No se pudo guardar la clave de recuperación en esta sesión. No se ha enviado el cambio.");
      setMessageKind("error");
      return;
    }
    setLocalPending(command);
    onPendingCommandChange?.(command);
    await sendCommand(command);
  }

  const buttonDisabled = disabled || (!activePending && readOnly);

  return (
    <div className="contents">
      {activePending ? (
        <button
          type="button"
          className={secondaryButtonClassName}
          disabled={disabled || saving}
          onClick={() => { setIsOpen(true); void sendCommand(activePending); }}
        >
          {saving ? "Comprobando ficha…" : `Reintentar ficha de ${athleteName}`}
        </button>
      ) : (
        <button
          type="button"
          className={secondaryButtonClassName}
          aria-expanded={isOpen}
          disabled={buttonDisabled}
          onClick={() => {
            setCompletedNotice("");
            setIsOpen(true);
            void loadProfile();
          }}
        >
          Editar ficha de {athleteName}
        </button>
      )}

      {!isOpen && completedNotice && <p role="status" className="basis-full border border-teal-700 bg-teal-50 p-3 text-sm text-slate-900">{completedNotice}</p>}

      {isOpen && (
        <section
          aria-labelledby={`athlete-profile-title-${athleteId}`}
          className="mt-3 w-full border border-slate-300 bg-white p-4 sm:col-span-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 id={`athlete-profile-title-${athleteId}`} className="font-bold">Editar ficha de gimnasta</h4>
              <p className="mt-1 text-sm text-slate-700">Los cambios se limitan a nombre y apellidos de esta ficha.</p>
            </div>
            {!activePending && (
              <button type="button" className={secondaryButtonClassName} onClick={closeEditor} disabled={saving}>
                Cerrar editor
              </button>
            )}
          </div>

          {loading && <p role="status" className="mt-3 text-sm text-slate-700">Cargando ficha…</p>}
          {message && (
            <p role={messageKind === "error" ? "alert" : "status"} className="mt-3 border border-slate-300 bg-slate-50 p-3 text-sm">
              {message}
            </p>
          )}

          {activePending ? (
            <p className="mt-3 text-sm text-amber-900">Los campos quedan bloqueados mientras se comprueba la operación original.</p>
          ) : loadedProfile ? (
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
              <label className="block text-sm font-semibold" htmlFor={`athlete-given-name-${athleteId}`}>
                Nombre
                <input
                  id={`athlete-given-name-${athleteId}`}
                  className={`${fieldClassName} mt-2`}
                  value={givenName}
                  onChange={(event) => setGivenName(event.target.value)}
                  maxLength={100}
                  autoComplete="given-name"
                  disabled={readOnly || saving}
                  required
                />
              </label>
              <label className="block text-sm font-semibold" htmlFor={`athlete-family-name-${athleteId}`}>
                Apellidos
                <input
                  id={`athlete-family-name-${athleteId}`}
                  className={`${fieldClassName} mt-2`}
                  value={familyName}
                  onChange={(event) => setFamilyName(event.target.value)}
                  maxLength={100}
                  autoComplete="family-name"
                  disabled={readOnly || saving}
                  required
                />
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" className={primaryButtonClassName} disabled={readOnly || saving}>
                  {saving ? "Guardando…" : "Guardar ficha"}
                </button>
              </div>
            </form>
          ) : !loading ? (
            <button type="button" className={`${secondaryButtonClassName} mt-3`} onClick={() => void loadProfile()} disabled={saving || readOnly}>
              Volver a cargar ficha
            </button>
          ) : null}
        </section>
      )}
    </div>
  );
}
