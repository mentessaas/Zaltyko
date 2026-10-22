"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Resource = "athletes" | "groups" | "classes";
type Usage = { readOnly: boolean; planCode: string; resources: Array<{ resource: Resource; current: number; limit: number | null; excess: number }>; items: Array<{ id: string; name: string }>; next: string | null };
const labels = { athletes: "Gimnastas", groups: "Grupos", classes: "Clases" };

export function OwnerPlanUsage({ organizationId, compact = false }: { organizationId: string; compact?: boolean }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [resource, setResource] = useState<Resource>("athletes");
  const [after, setAfter] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setUsage(null); setError(""); setSelected(null); setConfirmed(false);
    const params = new URLSearchParams({ organizationId });
    if (!compact) { params.set("resource", resource); if (after) params.set("after", after); }
    void fetch(`/api/v1/owner/saas/usage?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload.ok || typeof payload.data?.readOnly !== "boolean" || !Array.isArray(payload.data?.resources) || !Array.isArray(payload.data?.items)) throw new Error("No se ha podido comprobar el uso del plan.");
      if (!controller.signal.aborted) setUsage(payload.data);
    }).catch(() => { if (!controller.signal.aborted) setError("No se ha podido comprobar el uso del plan. Recarga antes de realizar cambios."); });
    return () => controller.abort();
  }, [organizationId, resource, after, compact, refresh]);

  const archive = useCallback(async () => {
    if (!selected || !confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/owner/saas/usage", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `archive-${crypto.randomUUID()}` }, body: JSON.stringify({ organizationId, resource, resourceId: selected.id, confirmArchive: true }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "No se ha podido archivar la ficha.");
      setSelected(null); setConfirmed(false); setRefresh(value => value + 1);
      window.dispatchEvent(new Event("zaltyko:plan-usage-changed"));
    } catch (error) { setError(error instanceof Error ? error.message : "No se ha podido archivar."); }
    finally { setBusy(false); }
  }, [selected, confirmed, busy, organizationId, resource]);

  useEffect(() => {
    const update = () => setRefresh(value => value + 1);
    window.addEventListener("zaltyko:plan-usage-changed", update);
    return () => window.removeEventListener("zaltyko:plan-usage-changed", update);
  }, []);

  if (compact) return usage?.readOnly ? (
    <aside role="status" className="border-b border-amber-600 bg-amber-50 px-5 py-4 text-sm text-slate-950">
      <strong>Academia en solo lectura.</strong> Superas los límites de {usage.planCode}. Los datos se conservan. <Link className="underline font-bold" href={`/owner/subscription?organizationId=${organizationId}#regularizar`}>Archivar excedente o contratar un plan suficiente</Link>.
    </aside>
  ) : error ? <p role="status" className="px-5 py-2 text-sm">{error}</p> : null;

  return <section id="regularizar" className="mt-6 border border-slate-300 bg-white p-5 sm:p-6" aria-label="Uso y regularización del plan">
    <h2 className="font-display text-xl font-bold">Uso y regularización</h2>
    {usage ? <>
      <p className="mt-3">{usage.readOnly ? "Solo lectura: archiva el excedente o contrata un plan suficiente. La consulta y la gestión de la suscripción siguen disponibles." : "La academia está dentro de los límites del plan."}</p>
      <ul className="my-4 grid gap-2 sm:grid-cols-3">{usage.resources.map(item => <li key={item.resource}>{labels[item.resource]}: <strong>{item.current} / {item.limit ?? "sin límite"}</strong>{item.excess > 0 ? ` · excedente ${item.excess}` : ""}</li>)}</ul>
      <p className="text-sm text-slate-700">Archivar no borra fichas, facturas ni asistencia histórica. Cierra las pertenencias e inscripciones abiertas del recurso y, si es una clase, cancela sus sesiones futuras. Las fichas archivadas no pueden seguir operando. No se hacen cargos ni devoluciones.</p>
      <label className="mt-4 block font-semibold">Tipo de ficha<select className="ml-3 min-h-11 rounded border p-2" value={resource} disabled={busy} onChange={event => { setResource(event.target.value as Resource); setAfter(null); }}><option value="athletes">Gimnastas</option><option value="groups">Grupos</option><option value="classes">Clases</option></select></label>
      <ul className="mt-4 max-h-80 overflow-auto divide-y">{usage.items.map(item => <li key={item.id} className="flex items-center justify-between gap-3 py-2"><span>{item.name}</span><button type="button" className="min-h-11 rounded border px-4 font-semibold" disabled={busy} onClick={() => { setSelected(item); setConfirmed(false); }}>Elegir para archivar</button></li>)}</ul>
      {usage.next ? <button type="button" className="min-h-11 px-4 underline" disabled={busy} onClick={() => setAfter(usage.next)}>Siguientes fichas</button> : null}
      {after ? <button type="button" className="min-h-11 px-4 underline" disabled={busy} onClick={() => setAfter(null)}>Volver al principio</button> : null}
      {selected ? <div className="mt-4 border border-amber-600 p-4"><p>Vas a archivar: <strong>{selected.name}</strong>.</p><label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} />Entiendo que se cerrará su operativa y se conservará el historial.</label><button type="button" className="mt-2 min-h-11 rounded bg-slate-950 px-5 font-bold text-white disabled:opacity-50" disabled={!confirmed || busy} onClick={() => void archive()}>{busy ? "Archivando…" : "Confirmar archivo"}</button></div> : null}
    </> : <p className="mt-3">Consultando el uso…</p>}
    {error ? <p className="mt-3" role="alert">{error}</p> : null}
  </section>;
}
