"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, UserPlus, XCircle } from "lucide-react";

type Trial = {
  id: string;
  leadId: string | null;
  status: string;
  scheduledAt: string | null;
  attendedAt: string | null;
  createdAt: string;
};

const outcomeLabels = { attended: "Asistió", no_show: "No asistió", follow_up: "Seguimiento", won: "Convertido", lost: "Perdido" } as const;

export function LeadTrialsWorkspace({ academyId }: { academyId: string }) {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [leadId, setLeadId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/lead-trials?academyId=${encodeURIComponent(academyId)}`, { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error === "TRIALS_NOT_INITIALIZED" ? "Trials aún no activados en este entorno. El equipo debe completar la migración de datos." : "No se pudieron cargar los trials");
    }
    const payload = await response.json();
    setTrials(payload.data?.items ?? payload.items ?? []);
  }, [academyId]);

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Error al cargar")); }, [load]);

  async function createTrial(event: FormEvent) {
    event.preventDefault();
    setBusy("create"); setMessage(null);
    try {
      const response = await fetch("/api/lead-trials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ academyId, leadId: leadId.trim() || null, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null, idempotencyKey: crypto.randomUUID() }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "No se pudo crear el trial");
      setLeadId(""); setScheduledAt(""); setMessage("Trial guardado"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error al crear"); }
    finally { setBusy(null); }
  }

  async function recordOutcome(trialId: string, outcome: keyof typeof outcomeLabels) {
    setBusy(`${trialId}:${outcome}`); setMessage(null);
    try {
      const response = await fetch(`/api/lead-trials/${trialId}/outcome`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ academyId, outcome, notes: notes[trialId]?.trim() || null, idempotencyKey: crypto.randomUUID() }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "No se pudo registrar el resultado");
      setMessage("Resultado registrado"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error al registrar"); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createTrial} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
        <div className="mb-4 flex items-center gap-3"><UserPlus className="h-5 w-5 text-zaltyko-teal" /><div><h2 className="font-semibold text-slate-900 dark:text-white">Agendar una clase de prueba</h2><p className="text-sm text-slate-500 dark:text-slate-400">Crea el siguiente paso del lead sin convertirlo todavía en atleta.</p></div></div>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input value={leadId} onChange={(event) => setLeadId(event.target.value)} placeholder="ID del lead (opcional)" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-zaltyko-teal dark:border-white/15 dark:bg-slate-950 dark:text-white" />
          <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-zaltyko-teal dark:border-white/15 dark:bg-slate-950 dark:text-white" />
          <button disabled={busy === "create"} className="min-h-11 rounded-xl bg-zaltyko-teal px-5 text-sm font-semibold text-slate-950 disabled:opacity-60">{busy === "create" ? "Guardando…" : "Agendar trial"}</button>
        </div>
      </form>
      {message && <p role="status" className="rounded-xl border border-zaltyko-teal/30 bg-zaltyko-teal/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{message}</p>}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><h2 className="font-semibold text-slate-900 dark:text-white">Pruebas próximas y seguimiento</h2><p className="text-sm text-slate-500 dark:text-slate-400">Registra el resultado mientras aún tienes el contexto fresco.</p></div><CalendarClock className="h-5 w-5 text-slate-400" /></div>
        {trials.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-500">Aún no hay trials agendados.</div> : <div className="divide-y divide-slate-200 dark:divide-white/10">{trials.map((trial) => <div key={trial.id} className="space-y-3 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-slate-900 dark:text-white">{trial.leadId ? `Lead ${trial.leadId.slice(0, 8)}…` : "Lead sin vincular"}</p><p className="text-xs text-slate-500">{trial.scheduledAt ? new Date(trial.scheduledAt).toLocaleString("es-ES") : "Sin fecha"} · Estado: {trial.status}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200">{trial.status}</span></div><div className="flex flex-col gap-2 md:flex-row"><input value={notes[trial.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [trial.id]: event.target.value }))} placeholder="Nota breve para el seguimiento (opcional)" className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-transparent px-3 text-sm text-slate-900 dark:border-white/15 dark:text-white" /><button onClick={() => void recordOutcome(trial.id, "attended")} disabled={busy !== null} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-emerald-500/15 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{outcomeLabels.attended}</button><button onClick={() => void recordOutcome(trial.id, "no_show")} disabled={busy !== null} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-rose-500/15 px-3 text-sm font-medium text-rose-700 dark:text-rose-300"><XCircle className="h-4 w-4" />{outcomeLabels.no_show}</button><button onClick={() => void recordOutcome(trial.id, "follow_up")} disabled={busy !== null} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 dark:border-white/15 dark:text-slate-200">Seguimiento</button>{trial.status === "attended" && <Link href={`/app/${academyId}/athletes/new?trialId=${trial.id}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zaltyko-teal/40 px-3 text-sm font-medium text-zaltyko-teal">Convertir en atleta</Link>}</div></div>)}</div>}
      </section>
    </div>
  );
}
