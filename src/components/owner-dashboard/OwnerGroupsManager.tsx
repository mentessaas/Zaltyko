"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Plus, Search, UsersRound } from "lucide-react";

type GroupsBundle = Awaited<
  ReturnType<
    typeof import("@/modules/groups/application/group-management-service").getOwnerGroupsPageData
  >
>;

type Candidate = { id: string; name: string };

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
  | { kind: "invalid"; organizationId: string };

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
    return null;
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
  const defaultProgramId = bundle.programs[0]?.id ?? "";
  const defaultLocationId =
    bundle.groups.find((group) => group.id === bundle.selectedGroupId)
      ?.locationId ??
    bundle.locations[0]?.id ??
    "";
  const [createOpen, setCreateOpen] = useState(bundle.groups.length === 0);
  const [groupName, setGroupName] = useState("");
  const [programId, setProgramId] = useState(defaultProgramId);
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [capacity, setCapacity] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newAthleteGivenName, setNewAthleteGivenName] = useState("");
  const [newAthleteFamilyName, setNewAthleteFamilyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingGroupCreate, setPendingGroupCreate] =
    useState<PendingGroupCreateState | null>(null);
  const [pendingGroupCreateLoadedFor, setPendingGroupCreateLoadedFor] =
    useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const groupCreateRequestRef = useRef(false);
  const createAthleteKeyRef = useRef<string | null>(null);
  const addKeyByAthleteRef = useRef(new Map<string, string>());
  const transitionKeysRef = useRef(new Map<string, string>());
  const selectedGroup = bundle.groups.find(
    (group) => group.id === bundle.selectedGroupId
  );
  const organizationId = bundle.organization.id;
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
  const groupCreateLocked =
    busy || !groupCreateScopeLoaded || currentPendingGroupCreate !== null;
  const createStorageKey = `zaltyko:pending-group-create:v2:${organizationId}`;
  const legacyCreateStorageKey = `zaltyko:pending-group-create:${organizationId}`;
  const createAthleteStorageKey = `zaltyko:pending-group-athlete:${organizationId}:${bundle.selectedGroupId ?? "none"}`;

  useEffect(() => {
    const pending = readPendingGroupCreate(
      createStorageKey,
      legacyCreateStorageKey,
      organizationId
    );
    // Restore sessionStorage after hydration so server and first client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingGroupCreate(pending);
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

  function clearCreateAthleteKey() {
    createAthleteKeyRef.current = null;
    try {
      window.sessionStorage.removeItem(createAthleteStorageKey);
    } catch {
      // In-memory idempotency still protects retries if storage is unavailable.
    }
  }

  function invalidateCreateAthleteKeyForEditedCommand() {
    if (createAthleteKeyRef.current) clearCreateAthleteKey();
  }

  function getCreateAthleteKey() {
    if (createAthleteKeyRef.current) return createAthleteKeyRef.current;
    try {
      createAthleteKeyRef.current =
        window.sessionStorage.getItem(createAthleteStorageKey) ??
        crypto.randomUUID();
      window.sessionStorage.setItem(
        createAthleteStorageKey,
        createAthleteKeyRef.current
      );
    } catch {
      createAthleteKeyRef.current = crypto.randomUUID();
    }
    return createAthleteKeyRef.current;
  }

  function groupHref(groupId?: string, nextLocationId?: string) {
    const params = new URLSearchParams({ organizationId });
    if (nextLocationId) params.set("locationId", nextLocationId);
    if (groupId) params.set("groupId", groupId);
    return `/owner/groups?${params.toString()}`;
  }

  async function sendGroupCreate(command: PendingGroupCreate) {
    if (
      command.organizationId !== organizationId ||
      groupCreateRequestRef.current
    ) {
      return;
    }
    groupCreateRequestRef.current = true;
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
      const created = responseData<{ id: string }>(payload);
      if (!response.ok || !created?.id) {
        if (response.status >= 400 && response.status < 500) {
          clearPendingGroupCreate();
        }
        setError(responseError(payload));
        return;
      }
      clearPendingGroupCreate();
      const submittedPayload = JSON.parse(command.body) as GroupCreatePayload;
      router.push(groupHref(created.id, submittedPayload.locationId));
      router.refresh();
    } catch {
      setError(
        "No se pudo crear el grupo. Comprueba la conexión e inténtalo de nuevo."
      );
    } finally {
      setBusy(false);
      groupCreateRequestRef.current = false;
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      currentPendingGroupCreate ||
      pendingGroupCreateLoadedFor !== organizationId
    ) {
      return;
    }
    if (!groupName.trim() || !programId || !locationId) {
      setError("Completa el nombre, la actividad y la sede.");
      return;
    }
    const parsedCapacity = capacity.trim() ? Number(capacity) : null;
    if (
      parsedCapacity !== null &&
      (!Number.isInteger(parsedCapacity) || parsedCapacity < 1)
    ) {
      setError("La capacidad debe ser un número entero mayor que cero.");
      return;
    }

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
    await sendGroupCreate(currentPendingGroupCreate.command);
  }

  async function searchAthletes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  async function addAthlete(athleteId: string) {
    if (!selectedGroup) return;
    setError("");
    setNotice("");
    setBusy(true);
    const idempotencyKey =
      addKeyByAthleteRef.current.get(athleteId) ?? crypto.randomUUID();
    addKeyByAthleteRef.current.set(athleteId, idempotencyKey);
    try {
      const response = await fetch(
        `/api/v1/owner/groups/${selectedGroup.id}/memberships`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({
            organizationId,
            athleteId,
            startsOn: selectedToday,
            status: "active",
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !responseData(payload)) {
        if (response.status < 500) {
          addKeyByAthleteRef.current.delete(athleteId);
        }
        setError(responseError(payload));
        return;
      }
      addKeyByAthleteRef.current.delete(athleteId);
      setCandidates((current) =>
        current.filter((item) => item.id !== athleteId)
      );
      setNotice("Gimnasta añadida al grupo.");
      router.refresh();
    } catch {
      setError(
        "No se pudo añadir. Puedes volver a intentarlo de forma segura."
      );
    } finally {
      setBusy(false);
    }
  }

  async function createAthleteForGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup) return;
    setError("");
    setNotice("");
    const givenName = newAthleteGivenName.trim();
    const familyName = newAthleteFamilyName.trim();
    if (!givenName || !familyName) {
      setError("Indica el nombre y los apellidos.");
      return;
    }

    setBusy(true);
    const idempotencyKey = getCreateAthleteKey();
    try {
      const response = await fetch(
        `/api/v1/owner/groups/${selectedGroup.id}/memberships`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({
            organizationId,
            newAthlete: { givenName, familyName },
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !responseData(payload)) {
        if (response.status < 500) clearCreateAthleteKey();
        setError(responseError(payload));
        return;
      }
      clearCreateAthleteKey();
      setNewAthleteGivenName("");
      setNewAthleteFamilyName("");
      setCandidates([]);
      setNotice("Ficha creada y añadida al grupo.");
      router.refresh();
    } catch {
      setError(
        "No se pudo confirmar el alta. Puedes repetir el envío de forma segura."
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeMembership(
    membership: GroupsBundle["memberships"][number],
    toStatus: "active" | "paused" | "ended"
  ) {
    if (!selectedGroup) return;
    if (
      toStatus === "ended" &&
      !window.confirm(
        `¿Dar de baja a ${membership.athleteName} de este grupo? El historial se conservará.`
      )
    ) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    const transitionKey = `${membership.id}:${toStatus}`;
    const idempotencyKey =
      transitionKeysRef.current.get(transitionKey) ?? crypto.randomUUID();
    transitionKeysRef.current.set(transitionKey, idempotencyKey);
    try {
      const response = await fetch(
        `/api/v1/owner/groups/${selectedGroup.id}/memberships/${membership.id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({
            organizationId,
            expectedStatus: membership.status,
            toStatus,
            effectiveOn: selectedToday,
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !responseData(payload)) {
        if (response.status < 500) {
          transitionKeysRef.current.delete(transitionKey);
        }
        setError(responseError(payload));
        return;
      }
      transitionKeysRef.current.delete(transitionKey);
      setNotice("Pertenencia actualizada.");
      router.refresh();
    } catch {
      setError(
        "No se pudo actualizar. Comprueba el estado antes de repetirlo."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#F1F3EF] px-4 py-6 text-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[92rem]">
        <Link
          href={`/owner?organizationId=${organizationId}`}
          aria-disabled={busy}
          tabIndex={busy ? -1 : undefined}
          onClick={(event) => {
            if (busy) event.preventDefault();
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
            disabled={busy || groupCreateLocked}
            onClick={() => setCreateOpen((open) => !open)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {createOpen ? "Cerrar formulario" : "Crear grupo"}
          </button>
        </header>

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
        {notice && (
          <p
            role="status"
            className="mt-5 border border-teal-700 bg-white p-3 text-sm text-slate-900"
          >
            {notice}
          </p>
        )}

        {currentPendingGroupCreate && (
          <section
            aria-labelledby="pending-group-create-title"
            className="mt-5 border border-amber-700 bg-amber-50 p-4 text-sm text-slate-950"
            role="status"
          >
            <h2 id="pending-group-create-title" className="font-bold">
              Creación de grupo pendiente de confirmar
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
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={() => router.refresh()}
                >
                  Actualizar lista de grupos
                </button>
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
              >
                <label className="block text-sm font-semibold">
                  Nombre del grupo
                  <input
                    className={`${fieldClassName} mt-2`}
                    value={groupName}
                    disabled={groupCreateLocked}
                    onChange={(event) => setGroupName(event.target.value)}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Actividad
                  <select
                    className={`${fieldClassName} mt-2`}
                    value={programId}
                    disabled={groupCreateLocked}
                    onChange={(event) => setProgramId(event.target.value)}
                    required
                  >
                    {bundle.programs.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Sede
                  <select
                    className={`${fieldClassName} mt-2`}
                    value={locationId}
                    disabled={groupCreateLocked}
                    onChange={(event) => setLocationId(event.target.value)}
                    required
                  >
                    {bundle.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Plazas (opcional)
                  <input
                    className={`${fieldClassName} mt-2`}
                    disabled={groupCreateLocked}
                    type="number"
                    min="1"
                    max="5000"
                    step="1"
                    inputMode="numeric"
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                  />
                </label>
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
                      aria-disabled={busy}
                      tabIndex={busy ? -1 : undefined}
                      onClick={(event) => {
                        if (busy) event.preventDefault();
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
                          disabled={busy}
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
                          disabled={busy}
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
                                disabled={busy}
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
                      <form
                        className="mt-4 grid gap-4 sm:grid-cols-2"
                        onSubmit={createAthleteForGroup}
                      >
                        <label className="block text-sm font-semibold">
                          Nombre
                          <input
                            className={`${fieldClassName} mt-2`}
                            value={newAthleteGivenName}
                            disabled={busy}
                            onChange={(changeEvent) => {
                              invalidateCreateAthleteKeyForEditedCommand();
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
                            disabled={busy}
                            onChange={(changeEvent) => {
                              invalidateCreateAthleteKeyForEditedCommand();
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
                            disabled={busy}
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
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {membership.status === "pending" && (
                              <button
                                type="button"
                                className={secondaryButtonClassName}
                                disabled={busy}
                                onClick={() =>
                                  void changeMembership(membership, "active")
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
                                disabled={busy}
                                onClick={() =>
                                  void changeMembership(membership, "paused")
                                }
                              >
                                Poner en pausa
                              </button>
                            )}
                            {membership.status === "paused" && (
                              <button
                                type="button"
                                className={secondaryButtonClassName}
                                disabled={busy}
                                onClick={() =>
                                  void changeMembership(membership, "active")
                                }
                              >
                                Reactivar
                              </button>
                            )}
                            <button
                              type="button"
                              className="touch-target inline-flex min-h-11 items-center justify-center border border-red-700 bg-white px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-800 disabled:opacity-50"
                              disabled={busy}
                              onClick={() =>
                                void changeMembership(membership, "ended")
                              }
                            >
                              Dar de baja
                            </button>
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
