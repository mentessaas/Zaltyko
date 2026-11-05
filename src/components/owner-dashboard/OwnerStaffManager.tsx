"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  decodeOwnerStaffMutationReceipt,
  decodeOwnerStaffPage,
  isDefinitiveOwnerStaffRejection,
  normalizeOwnerStaffName,
  ownerStaffErrorCode,
  ownerStaffErrorMessage,
  type OwnerStaffMutationReceipt,
  type OwnerStaffProfile,
  type OwnerStaffStatus,
} from "./owner-staff-contract";
import {
  clearOwnerStaffCommand,
  makeOwnerStaffCommand,
  markOwnerStaffCommandAttempted,
  ownerStaffCommandStorageKey,
  persistOwnerStaffCommand,
  readOwnerStaffCommand,
  sameOwnerStaffCommandRequest,
  withOwnerStaffCommandLock,
  type OwnerStaffCommand,
  type OwnerStaffOperation,
} from "./owner-staff-command-journal";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";

const STAFF_ENDPOINT = "/api/v1/owner/staff";
const PAGE_SIZE = 25;
const INPUT_CLASS = "mt-1 min-h-11 w-full border border-slate-400 bg-white px-3 text-base text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800";
const BUTTON_CLASS = "touch-target inline-flex min-h-11 items-center justify-center border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-55";
const SECONDARY_BUTTON_CLASS = "touch-target inline-flex min-h-11 items-center justify-center border border-slate-400 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-55";

type NameDraft = { givenName: string; familyName: string; preferredName: string };

function availableStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function displayName(profile: OwnerStaffProfile): string {
  return `${profile.givenName} ${profile.familyName}`;
}

function normalizeDraft(draft: NameDraft) {
  return {
    givenName: normalizeOwnerStaffName(draft.givenName),
    familyName: normalizeOwnerStaffName(draft.familyName),
    preferredName: normalizeOwnerStaffName(draft.preferredName) || null,
  };
}

function NameFields({
  prefix,
  draft,
  disabled,
  onChange,
}: {
  prefix: string;
  draft: NameDraft;
  disabled: boolean;
  onChange: (field: keyof NameDraft, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor={`${prefix}-given-name`} className="text-sm font-semibold text-slate-900">Nombre</label>
        <input
          id={`${prefix}-given-name`}
          name="givenName"
          autoComplete="given-name"
          required
          maxLength={100}
          value={draft.givenName}
          onChange={(event) => onChange("givenName", event.target.value)}
          disabled={disabled}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor={`${prefix}-family-name`} className="text-sm font-semibold text-slate-900">Apellidos</label>
        <input
          id={`${prefix}-family-name`}
          name="familyName"
          autoComplete="family-name"
          required
          maxLength={100}
          value={draft.familyName}
          onChange={(event) => onChange("familyName", event.target.value)}
          disabled={disabled}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor={`${prefix}-preferred-name`} className="text-sm font-semibold text-slate-900">Nombre preferido <span className="font-normal text-slate-600">(opcional)</span></label>
        <input
          id={`${prefix}-preferred-name`}
          name="preferredName"
          autoComplete="nickname"
          maxLength={100}
          value={draft.preferredName}
          onChange={(event) => onChange("preferredName", event.target.value)}
          disabled={disabled}
          className={INPUT_CLASS}
        />
      </div>
    </div>
  );
}

function newIdempotencyKey(): string | null {
  try {
    return window.crypto.randomUUID();
  } catch {
    return null;
  }
}

function receiptMatchesCommand(command: OwnerStaffCommand, receipt: OwnerStaffMutationReceipt): boolean {
  if (command.operation === "create") return receipt.isActive;
  if (command.staffProfileId?.toLowerCase() !== receipt.staffProfileId.toLowerCase()) return false;
  if (command.operation === "archive") return !receipt.isActive;
  if (command.operation === "reactivate") return receipt.isActive;
  return true;
}

function operationLabel(operation: OwnerStaffOperation): string {
  if (operation === "create") return "crear perfil";
  if (operation === "update") return "editar perfil";
  if (operation === "archive") return "archivar perfil";
  return "reactivar perfil";
}

export function OwnerStaffManager({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [status, setStatus] = useState<OwnerStaffStatus>("active");
  const [items, setItems] = useState<OwnerStaffProfile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [journalState, setJournalState] = useState<"checking" | "ready" | "blocked">("checking");
  const [pendingCommand, setPendingCommand] = useState<OwnerStaffCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<OwnerStaffMutationReceipt | null>(null);
  const [createDraft, setCreateDraft] = useState<NameDraft>({ givenName: "", familyName: "", preferredName: "" });
  const [editDraft, setEditDraft] = useState<(NameDraft & { staffProfileId: string; version: string }) | null>(null);
  const commandFlowRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingRef = useRef<OwnerStaffCommand | null>(null);
  const organizationRef = useRef(organizationId);
  const listRequestRef = useRef(0);
  pendingRef.current = pendingCommand;
  organizationRef.current = organizationId;
  usePendingCommandExitWarning(pendingCommand !== null, pendingRef);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setJournalState("checking");
    setPendingCommand(null);
    setMutationError("");
    const storage = availableStorage();
    if (!storage) {
      setJournalState("blocked");
      setMutationError("No se puede comprobar el registro local de operaciones de este navegador. No se enviarán cambios.");
      return;
    }
    const current = readOwnerStaffCommand(storage, organizationId);
    if (current.kind === "pending") {
      setPendingCommand(current.command);
      setJournalState("ready");
      setMutationError("Hay una operación pendiente guardada. Esta página no la enviará al abrirse; usa el botón para repetir exactamente la misma solicitud.");
    } else if (current.kind === "invalid" || current.kind === "unavailable") {
      setJournalState("blocked");
      setMutationError(current.kind === "invalid"
        ? "Hay una operación guardada que no se puede validar para esta academia. Se conserva y no se enviará ningún cambio."
        : "No se pudo leer el estado local de recuperación. No se enviarán cambios hasta poder comprobarlo.");
    } else {
      setJournalState("ready");
    }
  }, [organizationId]);

  useEffect(() => {
    const storageKey = ownerStaffCommandStorageKey(organizationId);
    function reconcileOtherTab(event: StorageEvent) {
      if (event.key !== storageKey) return;
      const storage = availableStorage();
      if (!storage) {
        setJournalState("blocked");
        setMutationError("No se puede leer el registro compartido actualizado. No se enviarán cambios.");
        return;
      }
      const current = readOwnerStaffCommand(storage, organizationId);
      if (current.kind === "pending") {
        setPendingCommand(current.command);
        setJournalState("ready");
        setMutationError("Otra pestaña está gestionando una operación pendiente. Revisa y reintenta ese mismo comando.");
      } else if (current.kind === "none" && pendingRef.current) {
        setPendingCommand(null);
        setJournalState("ready");
        setMutationError("Otra pestaña cerró el comando. La lista actual se volverá a cargar; no se enviará otro POST.");
        setRefreshKey((value) => value + 1);
      } else if (current.kind === "invalid" || current.kind === "unavailable") {
        setJournalState("blocked");
        setMutationError("El registro compartido no se puede validar. No se enviarán cambios.");
      }
    }
    window.addEventListener("storage", reconcileOtherTab);
    return () => window.removeEventListener("storage", reconcileOtherTab);
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++listRequestRef.current;
    setListState("loading");
    setListError("");
    setItems([]);
    setNextCursor(null);
    setLoadingMore(false);
    const query = new URLSearchParams({ organizationId, status, limit: String(PAGE_SIZE) });
    void fetch(`${STAFF_ENDPOINT}?${query.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, payload: await response.json().catch(() => null) }))
      .then(({ response, payload }) => {
        if (controller.signal.aborted || requestId !== listRequestRef.current) return;
        const page = response.status === 200 ? decodeOwnerStaffPage(payload) : null;
        if (!page) {
          setListError(response.status === 200
            ? "La lista devolvió datos incompletos o con un formato distinto. No se muestran resultados parciales."
            : ownerStaffErrorMessage(response.status, ownerStaffErrorCode(payload)));
          setListState("error");
          return;
        }
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setListState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted && requestId === listRequestRef.current) {
          setListError("No se pudo conectar con la lista. Comprueba la conexión y vuelve a cargar.");
          setListState("error");
        }
      });
    return () => controller.abort();
  }, [organizationId, status, refreshKey]);

  const canWrite = journalState === "ready" && pendingCommand === null && !busy;

  async function loadMore() {
    if (!nextCursor || loadingMore || listState !== "ready") return;
    const requestId = listRequestRef.current;
    const cursor = nextCursor;
    setLoadingMore(true);
    setListError("");
    const query = new URLSearchParams({ organizationId, status, limit: String(PAGE_SIZE), cursor });
    try {
      const response = await fetch(`${STAFF_ENDPOINT}?${query.toString()}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (requestId !== listRequestRef.current) return;
      const page = response.status === 200 ? decodeOwnerStaffPage(payload) : null;
      if (!page) {
        setListError(response.status === 200
          ? "La siguiente página devolvió datos incompletos. Puedes volver a cargar la lista."
          : ownerStaffErrorMessage(response.status, ownerStaffErrorCode(payload)));
        return;
      }
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id.toLowerCase()));
        return [...current, ...page.items.filter((item) => !seen.has(item.id.toLowerCase()))];
      });
      setNextCursor(page.nextCursor);
    } catch {
      if (requestId === listRequestRef.current) setListError("No se pudo cargar la siguiente página. Vuelve a intentarlo.");
    } finally {
      if (requestId === listRequestRef.current) setLoadingMore(false);
    }
  }

  async function executeCommandUnderLock(command: OwnerStaffCommand, storage: Storage) {
    if (command.organizationId !== organizationRef.current) return;
    const stored = readOwnerStaffCommand(storage, organizationId);
    if (stored.kind !== "pending" || JSON.stringify(stored.command) !== JSON.stringify(command)) {
      setJournalState(stored.kind === "none" ? "blocked" : "ready");
      if (stored.kind === "pending") setPendingCommand(stored.command);
      setMutationError(stored.kind === "unavailable"
        ? "No se pudo comprobar la solicitud guardada. No se enviará ningún cambio."
        : "El comando local cambió antes del envío. Se conserva y no se enviará.");
      return;
    }

    const hadUncertainPriorAttempt = stored.command.attempted;
    const attemptedCommand = markOwnerStaffCommandAttempted(storage, command);
    if (!attemptedCommand) {
      setPendingCommand(command);
      setJournalState("ready");
      setMutationError("No se pudo verificar el intento en el registro compartido. No se envió ningún cambio.");
      return;
    }
    setPendingCommand(attemptedCommand);
    setMutationError("");
    setNotice("");

    try {
      const response = await fetch(attemptedCommand.endpoint, {
        method: attemptedCommand.method,
        headers: { "content-type": "application/json", "Idempotency-Key": attemptedCommand.idempotencyKey },
        body: attemptedCommand.body,
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!mountedRef.current || attemptedCommand.organizationId !== organizationRef.current) return;

      const decodedReceipt = decodeOwnerStaffMutationReceipt(response.status, payload);
      if (decodedReceipt && receiptMatchesCommand(attemptedCommand, decodedReceipt)) {
        setReceipt(decodedReceipt);
        const cleared = clearOwnerStaffCommand(storage, attemptedCommand);
        if (cleared) {
          setPendingCommand(null);
          setJournalState("ready");
          setMutationError("");
          if (attemptedCommand.operation === "create") setCreateDraft({ givenName: "", familyName: "", preferredName: "" });
          if (attemptedCommand.operation === "update") setEditDraft(null);
          setNotice(decodedReceipt.replayed
            ? "El servidor devolvió el recibo original de esta operación. La lista actual se carga por separado."
            : "Operación confirmada. La lista actual se carga por separado del recibo.");
        } else {
          setPendingCommand(attemptedCommand);
          setJournalState("ready");
          setMutationError("El servidor confirmó la operación, pero no se pudo quitar el comando del registro compartido. Conservamos la misma clave para volver a comprobarlo.");
        }
        setRefreshKey((value) => value + 1);
        return;
      }

      const code = ownerStaffErrorCode(payload);
      const message = ownerStaffErrorMessage(response.status, code);
      if (!hadUncertainPriorAttempt && isDefinitiveOwnerStaffRejection(response.status, code)) {
        const cleared = clearOwnerStaffCommand(storage, attemptedCommand);
        if (cleared) {
          setPendingCommand(null);
          setJournalState("ready");
          setMutationError(message);
        } else {
          setPendingCommand(attemptedCommand);
          setJournalState("ready");
          setMutationError(`${message} El registro no se pudo limpiar; conserva el comando para revisión.`);
        }
      } else {
        setPendingCommand(attemptedCommand);
        setJournalState("ready");
        setMutationError(message);
        setNotice(hadUncertainPriorAttempt
          ? "Este comando ya tuvo un resultado incierto. Se conserva sin cambios; el rechazo actual no lo borra ni inicia otra operación. La lista se vuelve a consultar por separado."
          : "El resultado no se ha confirmado. La lista se vuelve a consultar, pero no se repetirá ninguna operación automáticamente.");
      }
      setRefreshKey((value) => value + 1);
    } catch {
      if (mountedRef.current && attemptedCommand.organizationId === organizationRef.current) {
        setPendingCommand(attemptedCommand);
        setJournalState("ready");
        setMutationError("No se pudo confirmar el resultado. El comando exacto sigue guardado; pulsa «Reintentar la misma operación» cuando quieras comprobarlo.");
        setNotice("La lista se vuelve a consultar por separado. Al abrir esta página no se envía otra vez el comando.");
        setRefreshKey((value) => value + 1);
      }
    }
  }

  function commandFor(operation: OwnerStaffOperation, idempotencyKey: string, profile?: OwnerStaffProfile): OwnerStaffCommand | null {
    try {
      if (operation === "create") {
        const fields = normalizeDraft(createDraft);
        if (!fields.givenName || !fields.familyName) {
          setMutationError("Completa el nombre y los apellidos para crear el perfil.");
          return null;
        }
        return makeOwnerStaffCommand({ operation, organizationId, ...fields }, idempotencyKey);
      }
      if (!profile) return null;
      if (operation === "update") {
        if (!editDraft || editDraft.staffProfileId !== profile.id) return null;
        const fields = normalizeDraft(editDraft);
        if (!fields.givenName || !fields.familyName) {
          setMutationError("Completa el nombre y los apellidos para guardar el perfil.");
          return null;
        }
        return makeOwnerStaffCommand({ operation, organizationId, staffProfileId: profile.id, ...fields, version: editDraft.version }, idempotencyKey);
      }
      return makeOwnerStaffCommand({ operation, organizationId, staffProfileId: profile.id, version: profile.version }, idempotencyKey);
    } catch {
      setMutationError("No se pudo preparar un comando válido. No se envió ningún cambio.");
      return null;
    }
  }

  async function startCommand(operation: OwnerStaffOperation, profile?: OwnerStaffProfile) {
    if (!canWrite || commandFlowRef.current) return;
    commandFlowRef.current = true;
    setBusy(true);
    setMutationError("");
    setNotice("");
    try {
      const result = await withOwnerStaffCommandLock(organizationId, async () => {
        const storage = availableStorage();
        if (!storage) return { kind: "storage-unavailable" as const };
        const current = readOwnerStaffCommand(storage, organizationId);
        if (current.kind === "pending") return { kind: "pending" as const, command: current.command };
        if (current.kind === "invalid" || current.kind === "unavailable") return { kind: current.kind };
        const idempotencyKey = newIdempotencyKey();
        if (!idempotencyKey) return { kind: "key-unavailable" as const };
        const command = commandFor(operation, idempotencyKey, profile);
        if (!command) return { kind: "invalid-command" as const };
        if (!persistOwnerStaffCommand(storage, command)) return { kind: "persist-failed" as const };
        setReceipt(null);
        setPendingCommand(command);
        await executeCommandUnderLock(command, storage);
        return { kind: "finished" as const };
      });

      if (result.status === "busy") {
        setMutationError("Otra pestaña está gestionando perfiles ahora. No se creó ni envió un comando nuevo. Actualiza la lista antes de volver a intentarlo.");
        return;
      }
      if (result.status === "unsupported") {
        setJournalState("blocked");
        setMutationError("Este navegador no permite coordinar operaciones entre pestañas. No se envió nada ni se generó otra clave. Usa un navegador compatible con Web Locks en el mismo perfil de navegador para recuperar el comando guardado.");
        return;
      }

      const value = result.value;
      if (value.kind === "pending") {
        setPendingCommand(value.command);
        setJournalState("ready");
        setMutationError("Ya hay una operación pendiente en esta academia. Reintenta esa solicitud antes de iniciar otra.");
      } else if (value.kind === "invalid" || value.kind === "unavailable" || value.kind === "storage-unavailable") {
        setJournalState("blocked");
        setMutationError("No se puede leer el registro compartido de operaciones. No se enviará ningún cambio.");
      } else if (value.kind === "key-unavailable") {
        setMutationError("Este navegador no pudo generar una clave segura. No se envió ningún cambio.");
      } else if (value.kind === "persist-failed") {
        setJournalState("blocked");
        setMutationError("No se pudo guardar y verificar el comando en el registro compartido. No se envió ningún cambio.");
      }
    } finally {
      commandFlowRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  async function retryPendingCommand() {
    if (!pendingCommand || commandFlowRef.current) return;
    const expected = pendingCommand;
    commandFlowRef.current = true;
    setBusy(true);
    setMutationError("");
    setNotice("");
    try {
      const result = await withOwnerStaffCommandLock(organizationId, async () => {
        const storage = availableStorage();
        if (!storage) return { kind: "storage-unavailable" as const };
        const current = readOwnerStaffCommand(storage, organizationId);
        if (current.kind === "none") return { kind: "resolved-elsewhere" as const };
        if (current.kind === "invalid" || current.kind === "unavailable") return { kind: current.kind };
        if (!sameOwnerStaffCommandRequest(current.command, expected)) {
          return { kind: "different-command" as const, command: current.command };
        }
        setPendingCommand(current.command);
        await executeCommandUnderLock(current.command, storage);
        return { kind: "finished" as const };
      });

      if (result.status === "busy") {
        setMutationError("Otra pestaña está comprobando esta operación. No se envió un segundo POST; vuelve a intentarlo cuando termine.");
        return;
      }
      if (result.status === "unsupported") {
        setJournalState("blocked");
        setMutationError("Este navegador no permite coordinar operaciones entre pestañas. El comando se conserva y no se reenvía; recupéralo con Web Locks desde el mismo perfil de navegador.");
        return;
      }
      const value = result.value;
      if (value.kind === "resolved-elsewhere") {
        setPendingCommand(null);
        setJournalState("ready");
        setMutationError("Otra pestaña ya cerró el comando. No se envió nada; actualiza la lista actual.");
        setRefreshKey((current) => current + 1);
      } else if (value.kind === "different-command") {
        setPendingCommand(value.command);
        setJournalState("ready");
        setMutationError("El registro compartido contiene otra operación. Se conserva para revisión y no se envió ningún cambio.");
      } else if (value.kind === "invalid" || value.kind === "unavailable" || value.kind === "storage-unavailable") {
        setJournalState("blocked");
        setMutationError("No se pudo comprobar el registro compartido. Se conserva la solicitud y no se envió ningún cambio.");
      }
    } finally {
      commandFlowRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    void startCommand("create");
  }

  function submitEdit(event: FormEvent<HTMLFormElement>, profile: OwnerStaffProfile) {
    event.preventDefault();
    if (!canWrite) return;
    void startCommand("update", profile);
  }

  function startTransition(operation: "archive" | "reactivate", profile: OwnerStaffProfile) {
    if (!canWrite) return;
    void startCommand(operation, profile);
  }

  function updateCreateDraft(field: keyof NameDraft, value: string) {
    setCreateDraft((current) => ({ ...current, [field]: value }));
  }

  function updateEditDraft(field: keyof NameDraft, value: string) {
    setEditDraft((current) => current ? { ...current, [field]: value } : current);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pb-12 pt-7 lg:px-10">
      <header className="mb-7 border-b border-slate-300 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-900">Equipo de la academia</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-slate-950">Personal</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          Perfiles operativos de {organizationName}. Crear un perfil no crea una cuenta, invitación ni acceso a Zaltyko.
        </p>
      </header>

      {mutationError ? <p role="alert" className="mb-4 border border-amber-700 bg-amber-50 p-4 text-sm leading-6 text-slate-950">{mutationError}</p> : null}
      {notice ? <p role="status" aria-live="polite" className="mb-4 border border-teal-800 bg-teal-50 p-4 text-sm leading-6 text-slate-950">{notice}</p> : null}

      {pendingCommand ? (
        <section aria-labelledby="owner-staff-pending-title" className="mb-6 border-l-4 border-amber-700 bg-amber-50 p-4 sm:p-5">
          <h2 id="owner-staff-pending-title" className="font-display text-lg font-bold text-slate-950">Operación pendiente</h2>
          <p className="mt-2 text-sm leading-6 text-slate-800">
            Comando para {operationLabel(pendingCommand.operation)}. La solicitud exacta queda guardada en este navegador para recuperarla desde cualquier pestaña autorizada. No se envía automáticamente al abrir o actualizar la página.
          </p>
          <button type="button" className={`${BUTTON_CLASS} mt-4`} disabled={busy || journalState !== "ready"} onClick={() => void retryPendingCommand()}>
            {busy ? "Comprobando…" : "Reintentar la misma operación"}
          </button>
        </section>
      ) : null}

      <section aria-labelledby="owner-staff-create-title" className="border border-slate-300 bg-white p-4 sm:p-6">
        <h2 id="owner-staff-create-title" className="font-display text-xl font-bold text-slate-950">Añadir perfil sin acceso</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">Solo se guardan nombres. El perfil se crea sin miembro vinculado.</p>
        <form className="mt-5 space-y-5" onSubmit={submitCreate}>
          <NameFields prefix="owner-staff-create" draft={createDraft} disabled={!canWrite} onChange={updateCreateDraft} />
          <button type="submit" className={BUTTON_CLASS} disabled={!canWrite}>Crear perfil</button>
        </form>
      </section>

      {receipt ? (
        <section aria-labelledby="owner-staff-receipt-title" className="mt-6 border border-teal-800 bg-teal-50 p-4 sm:p-5">
          <h2 id="owner-staff-receipt-title" className="font-display text-lg font-bold text-slate-950">Recibo original de la operación</h2>
          <p className="mt-2 text-sm text-slate-800 [overflow-wrap:anywhere]">Perfil {receipt.staffProfileId} · versión {receipt.version} · {receipt.isActive ? "activo en el recibo" : "archivado en el recibo"}{receipt.replayed ? " · respuesta recuperada" : ""}</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">Este recibo describe la operación original. La sección inferior muestra el resultado de una lectura actual independiente.</p>
        </section>
      ) : null}

      <section aria-labelledby="owner-staff-list-title" className="mt-7">
        <div className="flex flex-col gap-4 border-b border-slate-300 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Lectura actual</p>
            <h2 id="owner-staff-list-title" className="mt-1 font-display text-xl font-bold text-slate-950">Perfiles registrados</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label htmlFor="owner-staff-status" className="text-sm font-semibold text-slate-900">Mostrar</label>
              <select id="owner-staff-status" value={status} onChange={(event) => setStatus(event.target.value as OwnerStaffStatus)} className={INPUT_CLASS}>
                <option value="active">Activos</option>
                <option value="archived">Archivados</option>
                <option value="all">Todos</option>
              </select>
            </div>
            <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={listState === "loading"} onClick={() => setRefreshKey((value) => value + 1)}>
              Actualizar lista
            </button>
          </div>
        </div>

        {listState === "loading" ? <p role="status" aria-live="polite" className="py-6 text-sm text-slate-700">Cargando perfiles…</p> : null}
        {listState === "error" ? (
          <div className="mt-4 border border-rose-700 bg-rose-50 p-4">
            <p role="alert" className="text-sm leading-6 text-slate-950">{listError}</p>
            <button type="button" className={`${SECONDARY_BUTTON_CLASS} mt-3`} onClick={() => setRefreshKey((value) => value + 1)}>Volver a cargar</button>
          </div>
        ) : null}
        {listState === "ready" && items.length === 0 ? (
          <p className="mt-4 border border-slate-300 bg-white p-5 text-sm leading-6 text-slate-700">No hay perfiles en este filtro. Puedes añadir un perfil sin acceso desde el formulario superior.</p>
        ) : null}
        {listState === "ready" && items.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {items.map((profile) => (
              <li key={profile.id} className="py-4">
                <article aria-labelledby={`owner-staff-${profile.id}-name`} className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 id={`owner-staff-${profile.id}-name`} className="font-semibold text-slate-950">{displayName(profile)}</h3>
                    {profile.preferredName ? <p className="mt-1 text-sm text-slate-700">Nombre preferido: {profile.preferredName}</p> : null}
                    <p className="mt-2 text-xs font-semibold text-slate-700">{profile.isActive ? "Activo" : "Archivado"}</p>
                  </div>
                  {editDraft?.staffProfileId === profile.id ? (
                    <form className="w-full space-y-4 border border-slate-300 bg-white p-4 lg:max-w-3xl" onSubmit={(event) => submitEdit(event, profile)}>
                      <h4 className="font-display text-base font-bold text-slate-950">Editar perfil</h4>
                      <NameFields prefix={`owner-staff-edit-${profile.id}`} draft={editDraft} disabled={!canWrite} onChange={updateEditDraft} />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="submit" className={BUTTON_CLASS} disabled={!canWrite}>Guardar cambios</button>
                        <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={busy} onClick={() => setEditDraft(null)}>Cancelar</button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={!canWrite} onClick={() => setEditDraft({ staffProfileId: profile.id, version: profile.version, givenName: profile.givenName, familyName: profile.familyName, preferredName: profile.preferredName ?? "" })}>
                        Editar
                      </button>
                      {profile.isActive ? (
                        <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={!canWrite} onClick={() => startTransition("archive", profile)}>Archivar</button>
                      ) : (
                        <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={!canWrite} onClick={() => startTransition("reactivate", profile)}>Reactivar</button>
                      )}
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        ) : null}
        {listError && listState === "ready" ? <p role="alert" className="mt-3 text-sm text-rose-800">{listError}</p> : null}
        {listState === "ready" && nextCursor ? (
          <button type="button" className={`${SECONDARY_BUTTON_CLASS} mt-4`} disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Cargando…" : "Cargar más perfiles"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
