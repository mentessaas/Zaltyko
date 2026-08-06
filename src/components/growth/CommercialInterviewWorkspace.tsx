"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CheckCircle2, Loader2, Pencil, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { CommercialInterviewRow, CommercialLeadRow } from "@/lib/growth/dashboard";

interface CommercialInterviewWorkspaceProps {
  interviews: CommercialInterviewRow[];
  leads: CommercialLeadRow[];
}

const inputClassName =
  "border-white/15 bg-zaltyko-navy/70 text-white placeholder:text-white/30 focus-visible:ring-zaltyko-teal";
const selectClassName =
  "mt-2 min-h-[44px] w-full rounded-lg border border-white/15 bg-zaltyko-navy/70 px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal";
const fieldLabelClassName = "text-xs uppercase tracking-[0.12em] text-white/60";

function optionalString(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  return value || null;
}

function optionalNumber(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  return value === "" ? null : Number(value);
}

function toIsoDate(value: string | null) {
  return value ? new Date(value).toISOString() : null;
}

function toLocalDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusBadge(status: string) {
  if (status === "completed") return <Badge variant="success">Completada</Badge>;
  if (status === "scheduled") return <Badge variant="pending">Programada</Badge>;
  if (status === "no_show") return <Badge variant="error">No asistió</Badge>;
  return <Badge variant="outline">Cancelada</Badge>;
}

export function CommercialInterviewWorkspace({ interviews, leads }: CommercialInterviewWorkspaceProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<CommercialInterviewRow | null>(null);
  const [status, setStatus] = useState("scheduled");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function resetForm() {
    setEditing(null);
    setStatus("scheduled");
    setFeedback(null);
  }

  function editInterview(interview: CommercialInterviewRow) {
    setEditing(interview);
    setStatus(interview.status);
    setFeedback(null);
    document.getElementById("interview-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      leadId: optionalString(formData, "leadId"),
      academyName: String(formData.get("academyName") ?? "").trim(),
      contactName: optionalString(formData, "contactName"),
      contactEmail: optionalString(formData, "contactEmail"),
      countryCode: optionalString(formData, "countryCode"),
      city: optionalString(formData, "city"),
      modality: optionalString(formData, "modality"),
      athleteCount: optionalNumber(formData, "athleteCount"),
      coachCount: optionalNumber(formData, "coachCount"),
      locationCount: Number(formData.get("locationCount") ?? 1),
      currentTools: optionalString(formData, "currentTools"),
      biggestPain: optionalString(formData, "biggestPain"),
      mostValuableFeature: optionalString(formData, "mostValuableFeature"),
      primaryObjection: optionalString(formData, "primaryObjection"),
      easyPriceEur: optionalNumber(formData, "easyPriceEur"),
      limitPriceEur: optionalNumber(formData, "limitPriceEur"),
      preferredPricingModel: optionalString(formData, "preferredPricingModel"),
      freePlanExpectation: optionalString(formData, "freePlanExpectation"),
      upgradeTrigger: optionalString(formData, "upgradeTrigger"),
      betaInterest: String(formData.get("betaInterest") ?? "unknown"),
      willingnessToPay: String(formData.get("willingnessToPay") ?? "unknown"),
      status,
      scheduledAt: toIsoDate(optionalString(formData, "scheduledAt")),
      completedAt: toIsoDate(optionalString(formData, "completedAt")),
      notes: optionalString(formData, "notes"),
    };

    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        editing
          ? `/api/super-admin/growth/interviews/${editing.id}`
          : "/api/super-admin/growth/interviews",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message ?? body?.error ?? "No se pudo guardar la entrevista");
      }

      setFeedback({ type: "success", message: "Entrevista guardada y métricas actualizadas." });
      form.reset();
      setEditing(null);
      setStatus("scheduled");
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar la entrevista",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const requiredWhenCompleted = status === "completed";

  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_1.35fr]" aria-labelledby="interviews-heading">
      <form
        id="interview-form"
        key={editing?.id ?? "new"}
        onSubmit={handleSubmit}
        className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zaltyko-electric">Evidencia estructurada</p>
            <h2 id="interviews-heading" className="mt-1 font-display text-xl font-semibold text-white">
              {editing ? "Editar entrevista" : "Registrar entrevista"}
            </h2>
          </div>
          {editing && (
            <Button type="button" variant="ghost" onClick={resetForm} className="min-h-[44px] text-white/70 hover:text-white">
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Nueva
            </Button>
          )}
        </div>

        <fieldset className="mt-6 grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Identificación de la academia</legend>
          <div className="sm:col-span-2">
            <Label htmlFor="leadId" className={fieldLabelClassName}>Lead relacionado</Label>
            <select id="leadId" name="leadId" defaultValue={editing?.leadId ?? ""} className={selectClassName}>
              <option value="">Sin lead previo</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>{lead.name ?? lead.email} · {lead.plan ?? lead.source ?? "sin origen"}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="academyName" className={fieldLabelClassName}>Academia *</Label>
            <Input id="academyName" name="academyName" required defaultValue={editing?.academyName ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="contactName" className={fieldLabelClassName}>Persona entrevistada</Label>
            <Input id="contactName" name="contactName" defaultValue={editing?.contactName ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="contactEmail" className={fieldLabelClassName}>Email</Label>
            <Input id="contactEmail" name="contactEmail" type="email" defaultValue={editing?.contactEmail ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="countryCode" className={fieldLabelClassName}>País (ISO)</Label>
            <Input id="countryCode" name="countryCode" maxLength={2} placeholder="ES" defaultValue={editing?.countryCode ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="city" className={fieldLabelClassName}>Ciudad</Label>
            <Input id="city" name="city" defaultValue={editing?.city ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="modality" className={fieldLabelClassName}>Modalidad</Label>
            <select id="modality" name="modality" defaultValue={editing?.modality ?? ""} className={selectClassName}>
              <option value="">Sin indicar</option><option value="artistica">Artística</option><option value="ritmica">Rítmica</option><option value="mixta">Mixta</option><option value="otra">Otra</option>
            </select>
          </div>
          <div>
            <Label htmlFor="status" className={fieldLabelClassName}>Estado</Label>
            <select id="status" name="status" value={status} onChange={(event) => setStatus(event.target.value)} className={selectClassName}>
              <option value="scheduled">Programada</option><option value="completed">Completada</option><option value="no_show">No asistió</option><option value="cancelled">Cancelada</option>
            </select>
          </div>
          <div>
            <Label htmlFor="scheduledAt" className={fieldLabelClassName}>Fecha programada</Label>
            <Input id="scheduledAt" name="scheduledAt" type="datetime-local" defaultValue={toLocalDate(editing?.scheduledAt ?? null)} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="completedAt" className={fieldLabelClassName}>Fecha realizada {requiredWhenCompleted && "*"}</Label>
            <Input id="completedAt" name="completedAt" type="datetime-local" required={requiredWhenCompleted} defaultValue={toLocalDate(editing?.completedAt ?? null)} className={inputClassName} />
          </div>
        </fieldset>

        <fieldset className="mt-7 grid gap-4 sm:grid-cols-3">
          <legend className="mb-3 font-display text-sm font-semibold text-white">Tamaño y operación</legend>
          <div>
            <Label htmlFor="athleteCount" className={fieldLabelClassName}>Gimnastas {requiredWhenCompleted && "*"}</Label>
            <Input id="athleteCount" name="athleteCount" type="number" min={0} required={requiredWhenCompleted} defaultValue={editing?.athleteCount ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="coachCount" className={fieldLabelClassName}>Entrenadores</Label>
            <Input id="coachCount" name="coachCount" type="number" min={0} defaultValue={editing?.coachCount ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="locationCount" className={fieldLabelClassName}>Sedes</Label>
            <Input id="locationCount" name="locationCount" type="number" min={1} required defaultValue={editing?.locationCount ?? 1} className={inputClassName} />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="currentTools" className={fieldLabelClassName}>Herramientas actuales {requiredWhenCompleted && "*"}</Label>
            <Input id="currentTools" name="currentTools" required={requiredWhenCompleted} placeholder="Excel, WhatsApp, papel…" defaultValue={editing?.currentTools ?? ""} className={inputClassName} />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="biggestPain" className={fieldLabelClassName}>Mayor dolor {requiredWhenCompleted && "*"}</Label>
            <Textarea id="biggestPain" name="biggestPain" required={requiredWhenCompleted} defaultValue={editing?.biggestPain ?? ""} className={inputClassName} />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="mostValuableFeature" className={fieldLabelClassName}>Función más valiosa</Label>
            <Textarea id="mostValuableFeature" name="mostValuableFeature" defaultValue={editing?.mostValuableFeature ?? ""} className={inputClassName} />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="primaryObjection" className={fieldLabelClassName}>Objeción principal {requiredWhenCompleted && "*"}</Label>
            <Textarea id="primaryObjection" name="primaryObjection" required={requiredWhenCompleted} defaultValue={editing?.primaryObjection ?? ""} className={inputClassName} />
          </div>
        </fieldset>

        <fieldset className="mt-7 grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-display text-sm font-semibold text-white">Precio y decisión</legend>
          <div>
            <Label htmlFor="easyPriceEur" className={fieldLabelClassName}>Precio fácil €/mes {requiredWhenCompleted && "*"}</Label>
            <Input id="easyPriceEur" name="easyPriceEur" type="number" min={0} step="0.01" required={requiredWhenCompleted} defaultValue={editing?.easyPriceEur ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="limitPriceEur" className={fieldLabelClassName}>Precio límite €/mes {requiredWhenCompleted && "*"}</Label>
            <Input id="limitPriceEur" name="limitPriceEur" type="number" min={0} step="0.01" required={requiredWhenCompleted} defaultValue={editing?.limitPriceEur ?? ""} className={inputClassName} />
          </div>
          <div>
            <Label htmlFor="betaInterest" className={fieldLabelClassName}>Interés beta</Label>
            <select id="betaInterest" name="betaInterest" defaultValue={editing?.betaInterest ?? "unknown"} className={selectClassName}><option value="unknown">Sin validar</option><option value="yes">Sí</option><option value="maybe">Tal vez</option><option value="no">No</option></select>
          </div>
          <div>
            <Label htmlFor="willingnessToPay" className={fieldLabelClassName}>Dispuesta a pagar</Label>
            <select id="willingnessToPay" name="willingnessToPay" defaultValue={editing?.willingnessToPay ?? "unknown"} className={selectClassName}><option value="unknown">Sin validar</option><option value="yes">Sí</option><option value="maybe">Tal vez</option><option value="no">No</option></select>
          </div>
          {([
            ["preferredPricingModel", "Modelo preferido", editing?.preferredPricingModel],
            ["freePlanExpectation", "Qué espera del Free", editing?.freePlanExpectation],
            ["upgradeTrigger", "Qué le haría pagar", editing?.upgradeTrigger],
            ["notes", "Notas / cita resumida", editing?.notes],
          ] satisfies Array<[string, string, string | null | undefined]>).map(([name, label, value]) => (
            <div key={name} className="sm:col-span-2">
              <Label htmlFor={name} className={fieldLabelClassName}>{label}</Label>
              <Textarea id={name} name={name} defaultValue={value ?? ""} className={inputClassName} />
            </div>
          ))}
        </fieldset>

        {feedback && (
          <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-5 rounded-xl border px-4 py-3 text-sm ${feedback.type === "success" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>
            {feedback.type === "success" && <CheckCircle2 className="mr-2 inline h-4 w-4" aria-hidden="true" />}{feedback.message}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="mt-6 min-h-[44px] w-full bg-zaltyko-electric text-zaltyko-navy hover:bg-zaltyko-electric/90">
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />}
          {submitting ? "Guardando…" : editing ? "Actualizar entrevista" : "Guardar entrevista"}
        </Button>
      </form>

      <article className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/65">Registro verificable</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-white">Academias entrevistadas</h2>
          <p className="mt-2 text-sm text-white/50">Programar no suma al 10/10. Solo “Completada” con evidencia mínima cuenta.</p>
        </div>
        <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white">
          <Table>
            <TableHeader><TableRow><TableHead className="text-slate-600">Academia</TableHead><TableHead className="text-slate-600">Tamaño</TableHead><TableHead className="text-slate-600">Precio</TableHead><TableHead className="text-slate-600">Estado</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {interviews.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-slate-500">Aún no hay entrevistas reales registradas.</TableCell></TableRow>
              ) : interviews.map((interview) => (
                <TableRow key={interview.id}>
                  <TableCell><p className="font-semibold">{interview.academyName}</p><p className="mt-1 text-xs text-slate-500">{[interview.city, interview.countryCode, interview.modality].filter(Boolean).join(" · ") || "Sin ubicación"}</p></TableCell>
                  <TableCell>{interview.athleteCount ?? "—"} gimnastas</TableCell>
                  <TableCell>{interview.easyPriceEur === null ? "—" : `${interview.easyPriceEur} €`} / {interview.limitPriceEur === null ? "—" : `${interview.limitPriceEur} €`}</TableCell>
                  <TableCell>{statusBadge(interview.status)}</TableCell>
                  <TableCell className="text-right"><Button type="button" variant="ghost" size="sm" onClick={() => editInterview(interview)} className="min-h-[44px]"><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Editar</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </article>
    </section>
  );
}
