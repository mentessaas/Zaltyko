"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { resourceCapacityLabel } from "./owner-saas-presentation";
import { decodeOwnerUsage, type OwnerUsage, type UsageResource } from "./owner-plan-usage-response";
import {
  beginOwnerPlanUsageRead,
  markOwnerPlanUsageUnavailable,
  publishOwnerPlanUsage,
} from "./owner-plan-usage-store";
import { archiveOutcome } from "./owner-archive-response";
import { clearStoredArchiveIntent, persistArchiveIntent, readStoredArchiveIntent, type StoredArchiveIntent } from "./owner-archive-intent-storage";
import { usePendingCommandExitWarning } from "./use-pending-command-exit-warning";

type Resource = UsageResource;
type ArchiveIntent = StoredArchiveIntent & {
  item: { id: string; name: string };
};
const labels = { athletes: "Gimnastas", groups: "Grupos", classes: "Clases" };

export function OwnerPlanUsage({ organizationId, compact = false }: { organizationId: string; compact?: boolean }) {
  const [loadedUsage, setLoadedUsage] = useState<{ key: string; data: OwnerUsage } | null>(null);
  const [resource, setResource] = useState<Resource>("athletes");
  const [after, setAfter] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<ArchiveIntent | null>(null);
  const pendingArchiveRef = useRef<ArchiveIntent | null>(null);
  const uncertainArchiveRef = useRef(false);
  const archiveInFlightRef = useRef(false);
  const [archiveRecovery, setArchiveRecovery] = useState<{ organizationId: string; status: "loading" | "ready" | "blocked"; message: string }>({ organizationId: "", status: "loading", message: "" });
  usePendingCommandExitWarning(pendingArchive !== null, pendingArchiveRef);
  const [readFailure, setReadFailure] = useState<{ key: string; message: string } | null>(null);
  const [archiveFeedback, setArchiveFeedback] = useState<{ organizationId: string; error: string; notice: string }>({ organizationId: "", error: "", notice: "" });
  const [refresh, setRefresh] = useState(0);
  const lastForegroundRefreshAtRef = useRef<number | null>(null);
  const usageKey = JSON.stringify([organizationId, compact, resource, after, refresh]);
  const [renderedUsageKey, setRenderedUsageKey] = useState(usageKey);
  // Reset only query-local state before committing another context. Keep the
  // pending archive and its immutable request intact until its result is known.
  if (renderedUsageKey !== usageKey) {
    setRenderedUsageKey(usageKey);
    setLoadedUsage(null);
    setReadFailure(null);
    setSelected(null);
    setConfirmed(false);
  }
  const error = readFailure?.key === usageKey ? readFailure.message : archiveFeedback.organizationId === organizationId ? archiveFeedback.error : "";
  const notice = archiveFeedback.organizationId === organizationId ? archiveFeedback.notice : "";
  const clearArchiveNotice = () => setArchiveFeedback(current => current.organizationId === organizationId ? { ...current, notice: "" } : current);
  const usage = loadedUsage?.key === usageKey ? loadedUsage.data : null;
  const resourcesWithExcess = usage?.resources.filter(item => item.excess > 0) ?? [];
  const selectedResourceHasExcess = resourcesWithExcess.some(item => item.resource === resource);
  const firstResourceWithExcess = resourcesWithExcess[0]?.resource;
  const archiveRecoveryReady = archiveRecovery.organizationId === organizationId && archiveRecovery.status === "ready";
  const archiveLocked = busy || pendingArchive !== null || !archiveRecoveryReady;
  const pendingInThisOrganization = pendingArchive?.organizationId === organizationId ? pendingArchive : null;
  const archiveSelection = pendingInThisOrganization?.item ?? (usage && selectedResourceHasExcess ? selected : null);
  const archiveTriggerRef = useRef<HTMLButtonElement | null>(null);
  const archiveConfirmationRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (selected) archiveConfirmationRef.current?.focus();
  }, [selected]);
  useEffect(() => {
    let stored: ReturnType<typeof readStoredArchiveIntent>;
    try { stored = readStoredArchiveIntent(window.sessionStorage); }
    catch { stored = { status: "unavailable" }; }
    if (stored.status === "invalid" || stored.status === "unavailable") {
      const message = stored.status === "invalid"
        ? "Hay una recuperación de archivo local dañada. No enviaremos otro archivo para evitar elegir una ficha distinta; conserva esta pestaña y solicita ayuda."
        : "El navegador no permite comprobar el archivo pendiente. No se enviarán archivos hasta poder recuperar la operación con seguridad.";
      setArchiveRecovery({ organizationId, status: "blocked", message });
      return;
    }
    if (stored.status === "pending") {
      const existing = pendingArchiveRef.current;
      const resourceName = stored.intent.resource === "athletes" ? "Gimnasta" : stored.intent.resource === "groups" ? "Grupo" : "Clase";
      const intent: ArchiveIntent = {
        ...stored.intent,
        item: existing?.key === stored.intent.key
          ? existing.item
          : { id: stored.intent.resourceId, name: `${resourceName} seleccionada antes de recargar` },
      };
      pendingArchiveRef.current = intent;
      setPendingArchive(intent);
      uncertainArchiveRef.current = true;
      setResource(stored.intent.resource);
      setArchiveFeedback({ organizationId, error: "Se recuperó un archivo pendiente de confirmar. Reintenta esa misma operación; no se ofrecerá otra ficha hasta conocer el resultado.", notice: "" });
    } else {
      if (!pendingArchiveRef.current) {
        setPendingArchive(null);
        uncertainArchiveRef.current = false;
      }
    }
    setArchiveRecovery({ organizationId, status: "ready", message: "" });
  }, [organizationId]);
  useEffect(() => {
    if (!usage || selectedResourceHasExcess) return;
    setSelected(null);
    setConfirmed(false);
    setAfter(null);
    if (firstResourceWithExcess) setResource(firstResourceWithExcess);
  }, [usage, selectedResourceHasExcess, firstResourceWithExcess]);

  useEffect(() => {
    if (!usage || !pendingArchive || pendingArchive.organizationId !== organizationId) return;
    const matchingItem = usage.items.find(item => item.id === pendingArchive.resourceId);
    if (!matchingItem || matchingItem.name === pendingArchive.item.name) return;
    const updated = { ...pendingArchive, item: matchingItem };
    pendingArchiveRef.current = updated;
    setPendingArchive(updated);
  }, [usage, pendingArchive, organizationId]);

  const cancelSelection = () => {
    if (busy || pendingArchiveRef.current) return;
    setSelected(null);
    setConfirmed(false);
    archiveTriggerRef.current?.focus();
  };
  useEffect(() => {
    const controller = new AbortController();
    const ticket = beginOwnerPlanUsageRead(organizationId);
    let settled = false;
    const params = new URLSearchParams({ organizationId });
    if (!compact) { params.set("resource", resource); if (after) params.set("after", after); }
    void fetch(`/api/v1/owner/saas/usage?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = await response.json();
      settled = true;
      if (controller.signal.aborted) {
        markOwnerPlanUsageUnavailable(organizationId, ticket, "cancelled");
        return;
      }
      const data = decodeOwnerUsage(payload);
      if (!response.ok || !data) throw new Error("No se ha podido comprobar el uso del plan.");
      if (publishOwnerPlanUsage(organizationId, data, ticket)) setLoadedUsage({ key: usageKey, data });
    }).catch(() => {
      settled = true;
      const cancelled = controller.signal.aborted;
      if (markOwnerPlanUsageUnavailable(organizationId, ticket, cancelled ? "cancelled" : "error") && !cancelled) {
        setReadFailure({ key: usageKey, message: "No se ha podido comprobar el uso del plan. Recarga antes de realizar cambios." });
      }
    });
    return () => {
      controller.abort();
      if (!settled) markOwnerPlanUsageUnavailable(organizationId, ticket, "cancelled");
    };
  }, [organizationId, resource, after, compact, refresh, usageKey]);

  const archive = useCallback(async () => {
    if (archiveInFlightRef.current || !archiveRecoveryReady) return;
    let intent = pendingArchiveRef.current;
    if (intent && intent.organizationId !== organizationId) return;
    if (!intent && (!selected || !confirmed || !usage || !selectedResourceHasExcess || !usage.items.some(item => item.id === selected.id))) return;
    archiveInFlightRef.current = true;
    setBusy(true);
    setArchiveFeedback({ organizationId, error: "", notice: "" });
    try {
      if (!intent) {
        if (!selected) return;
        const candidate: ArchiveIntent = { organizationId, resource, resourceId: selected.id, item: { ...selected }, key: `archive-${crypto.randomUUID()}` };
        if (!persistArchiveIntent(window.sessionStorage, candidate)) {
          setArchiveFeedback({ organizationId, error: "No se pudo guardar de forma segura la operación pendiente; no se ha enviado ninguna solicitud. Comprueba el navegador antes de volver a intentarlo.", notice: "" });
          return;
        }
        intent = candidate;
        uncertainArchiveRef.current = false;
        pendingArchiveRef.current = intent;
        setPendingArchive(intent);
      }
      const body = JSON.stringify({ organizationId: intent.organizationId, resource: intent.resource, resourceId: intent.resourceId, confirmArchive: true });
      const response = await fetch("/api/v1/owner/saas/usage", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": intent.key }, body });
      const payload = await response.json().catch(() => null);
      const outcome = archiveOutcome(response, payload, { previouslyUncertain: uncertainArchiveRef.current });
      if (outcome.status === "uncertain") { uncertainArchiveRef.current = true; setArchiveFeedback({ organizationId: intent.organizationId, error: outcome.message, notice: "" }); return; }
      if (!clearStoredArchiveIntent(window.sessionStorage, intent)) {
        uncertainArchiveRef.current = true;
        setArchiveFeedback({ organizationId: intent.organizationId, error: "El servidor respondió, pero no se pudo cerrar la recuperación guardada. Reintenta exactamente el mismo archivo; no iniciaremos otro.", notice: "" });
        return;
      }
      pendingArchiveRef.current = null;
      uncertainArchiveRef.current = false;
      setPendingArchive(null);
      if (outcome.status === "rejected") {
        setConfirmed(false);
        if (outcome.code === "NOT_FOUND" || outcome.code === "RESOURCE_NOT_OVER_LIMIT") {
          setSelected(null);
          setArchiveFeedback({ organizationId: intent.organizationId, error: "", notice: "El servidor indica que la ficha o el excedente ya cambió. Comprueba de nuevo el uso y la lista antes de elegir otra ficha." });
          window.dispatchEvent(new Event("zaltyko:plan-usage-changed"));
          return;
        }
        setArchiveFeedback({ organizationId: intent.organizationId, error: outcome.message, notice: "" });
        return;
      }
      setSelected(null); setConfirmed(false); setRefresh(value => value + 1);
      window.dispatchEvent(new Event("zaltyko:plan-usage-changed"));
    } catch {
      if (intent && pendingArchiveRef.current === intent) uncertainArchiveRef.current = true;
      setArchiveFeedback({ organizationId: intent?.organizationId ?? organizationId, error: intent ? "No podemos confirmar si se archivó la ficha. Reintenta el mismo archivo; conservamos la misma clave para evitar duplicados, también si recargas esta pestaña." : "No se ha podido preparar el archivo. No se ha enviado ninguna solicitud.", notice: "" });
    }
    finally { archiveInFlightRef.current = false; setBusy(false); }
  }, [selected, confirmed, organizationId, resource, usage, selectedResourceHasExcess, archiveRecoveryReady]);

  useEffect(() => {
    const update = () => setRefresh(value => value + 1);
    const refreshWhenForegrounded = (event: Event) => {
      if (event.type === "visibilitychange" && document.visibilityState !== "visible") return;
      const now = Date.now();
      // Browsers commonly emit both events when returning to a tab. Treat
      // that pair as one read; this is a focus refresh, not periodic polling.
      if (lastForegroundRefreshAtRef.current !== null && now - lastForegroundRefreshAtRef.current < 750) return;
      lastForegroundRefreshAtRef.current = now;
      update();
    };
    window.addEventListener("zaltyko:plan-usage-changed", update);
    window.addEventListener("focus", refreshWhenForegrounded);
    document.addEventListener("visibilitychange", refreshWhenForegrounded);
    return () => {
      window.removeEventListener("zaltyko:plan-usage-changed", update);
      window.removeEventListener("focus", refreshWhenForegrounded);
      document.removeEventListener("visibilitychange", refreshWhenForegrounded);
    };
  }, []);

  if (compact) return usage?.readOnly ? (
    <aside role="status" className="border-b border-amber-600 bg-amber-50 px-5 py-4 text-sm text-slate-950">
      <strong>Academia en solo lectura.</strong> Superas los límites de {usage.planCode}. Los datos se conservan. <Link className="underline font-bold" href={`/owner/subscription?organizationId=${organizationId}#regularizar`}>Archivar excedente o contratar un plan suficiente</Link>.
    </aside>
  ) : error ? <div className="px-5 py-2 text-sm"><p role="status">{error}</p><button type="button" className="min-h-11 px-4 font-semibold underline" onClick={() => setRefresh(value => value + 1)}>Volver a consultar el uso</button></div> : null;

  return <section id="regularizar" className="mt-6 border border-slate-300 bg-white p-5 sm:p-6" aria-label="Uso y regularización del plan">
    <h2 className="font-display text-xl font-bold">Uso y regularización</h2>
      {usage ? <>
      <p className="mt-3" role="status">{usage.readOnly ? "Tus datos están guardados. La academia está en solo lectura: archiva el excedente o contrata un plan suficiente. La consulta y la gestión de la suscripción siguen disponibles." : "La academia está dentro de los límites del plan."}</p>
      <ul className="my-4 grid gap-2 sm:grid-cols-3">{usage.resources.map(item => <li key={item.resource}>{labels[item.resource]}: <strong>{item.current} / {item.limit ?? "sin límite"}</strong>{resourceCapacityLabel(item.current, item.limit, item.excess) ? ` · ${resourceCapacityLabel(item.current, item.limit, item.excess)}` : ""}</li>)}</ul>
      <p className="text-sm text-slate-700">Archivar no borra fichas, facturas ni asistencia histórica. Cierra las pertenencias e inscripciones abiertas del recurso y, si es una clase, cancela sus sesiones futuras. Las fichas archivadas no pueden seguir operando. No se hacen cargos ni devoluciones.</p>
      <label className="mt-4 block font-semibold">Tipo de ficha<select className="ml-3 min-h-11 rounded border p-2" value={selectedResourceHasExcess ? resource : ""} disabled={archiveLocked || resourcesWithExcess.length === 0} onChange={event => { setResource(event.target.value as Resource); setAfter(null); setSelected(null); setConfirmed(false); clearArchiveNotice(); }}>
        {resourcesWithExcess.length === 0 ? <option value="">No hay tipos con excedente</option> : resourcesWithExcess.map(item => <option key={item.resource} value={item.resource}>{labels[item.resource]} · excedente {item.excess}</option>)}
      </select></label>
      {selectedResourceHasExcess ? usage.items.length > 0 ? (
        <ul className="mt-4 max-h-80 overflow-auto divide-y">{usage.items.map(item => <li key={item.id} className="flex items-center justify-between gap-3 py-2"><span>{item.name}</span><button type="button" className="min-h-11 rounded border px-4 font-semibold" aria-label={`Elegir para archivar: ${item.name}`} disabled={archiveLocked} onClick={event => { archiveTriggerRef.current = event.currentTarget; setSelected(item); setConfirmed(false); clearArchiveNotice(); }}>Elegir para archivar</button></li>)}</ul>
      ) : <p className="mt-4" role="status">No hay fichas activas disponibles para este excedente.</p> : <p className="mt-4" role="status">No hay excedente que archivar en esta academia. Las fichas y su historial se conservan; puedes consultar el uso, revisar la suscripción o contratar un plan suficiente.</p>}
      {usage.next ? <button type="button" className="min-h-11 px-4 underline" disabled={archiveLocked} onClick={() => setAfter(usage.next)}>Siguientes fichas</button> : null}
      {after ? <button type="button" className="min-h-11 px-4 underline" disabled={archiveLocked} onClick={() => setAfter(null)}>Volver al principio</button> : null}
    </> : !error ? <p className="mt-3" role="status">Consultando el uso…</p> : null}
      {notice ? <p className="mt-3" role="status">{notice}</p> : null}
      {archiveRecovery.organizationId === organizationId && archiveRecovery.status === "blocked" ? <p className="mt-3" role="alert">{archiveRecovery.message}</p> : null}
      {archiveRecovery.organizationId !== organizationId || archiveRecovery.status === "loading" ? <p className="mt-3" role="status">Comprobando si quedó un archivo pendiente antes de permitir otro…</p> : null}
      {archiveSelection ? (
        <fieldset
          className="mt-4 border border-amber-600 p-4"
          disabled={busy}
          aria-busy={busy}
          onKeyDown={event => {
            if (event.key === "Escape" && !archiveLocked) {
              event.preventDefault();
              cancelSelection();
            }
          }}
        >
          <legend className="px-1 font-semibold">Confirmar archivo de {archiveSelection.name}</legend>
          <p>Vas a archivar: <strong>{archiveSelection.name}</strong>.</p>
          {pendingInThisOrganization && !busy ? <p className="mt-2" role="status">Hay un archivo sin confirmar. La intención mínima quedó guardada en esta pestaña; al reintentar se conserva la misma ficha y clave, incluso tras recargar.</p> : null}
          <label className="mt-3 flex min-h-11 items-center gap-3">
            <input ref={archiveConfirmationRef} type="checkbox" checked={pendingInThisOrganization !== null || confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={archiveLocked} />
            Entiendo que se cerrará su operativa y se conservará el historial.
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded border px-5 font-semibold" disabled={archiveLocked} onClick={cancelSelection}>Cancelar selección</button>
            <button type="button" className="min-h-11 rounded bg-slate-950 px-5 font-bold text-white disabled:opacity-50" disabled={(!confirmed && !pendingInThisOrganization) || busy || !archiveRecoveryReady} onClick={() => void archive()}>{busy ? "Archivando…" : pendingInThisOrganization ? "Reintentar el mismo archivo" : "Confirmar archivo"}</button>
          </div>
        </fieldset>
      ) : null}
    {pendingArchive && !pendingInThisOrganization ? <p className="mt-3" role="status">Hay un archivo pendiente de confirmar en otra academia. Vuelve a esa academia antes de iniciar otro archivo en esta página.</p> : null}
    {error ? <div className="mt-3"><p role="alert">{error}</p><button type="button" className="mt-2 min-h-11 rounded border px-4 font-semibold" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Volver a consultar el uso</button></div> : null}
  </section>;
}
