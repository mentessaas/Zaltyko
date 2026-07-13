"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Gauge, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SessionWorkspaceAthlete } from "@/components/coach/session-workspace-types";

type QuickAssessmentType = "practice" | "technical" | "artistic" | "coach_feedback";

const ASSESSMENT_TYPES: Array<{ value: QuickAssessmentType; label: string }> = [
  { value: "practice", label: "Seguimiento de entrenamiento" },
  { value: "technical", label: "Técnica" },
  { value: "artistic", label: "Artística" },
  { value: "coach_feedback", label: "Nota del entrenador" },
];

interface SessionProgressPanelProps {
  sessionId: string;
  sessionDate: string;
  athletes: SessionWorkspaceAthlete[];
  athleteTerm: string;
  apparatusTerm: string;
  initialAssessmentCount: number;
  onSaved: (assessmentCount: number) => void;
}

function SessionProgressPanelImpl({
  sessionId,
  sessionDate,
  athletes,
  athleteTerm,
  apparatusTerm,
  initialAssessmentCount,
  onSaved,
}: SessionProgressPanelProps) {
  const [selectedAthleteId, setSelectedAthleteId] = useState(athletes[0]?.id ?? "");
  const [apparatus, setApparatus] = useState("");
  const [assessmentType, setAssessmentType] = useState<QuickAssessmentType>("practice");
  const [score, setScore] = useState(7);
  const [comment, setComment] = useState("");
  const [savedCount, setSavedCount] = useState(initialAssessmentCount);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? athletes[0] ?? null,
    [athletes, selectedAthleteId]
  );

  useEffect(() => {
    const options = selectedAthlete?.apparatus ?? [];
    setApparatus((current) => (options.some((item) => item.code === current) ? current : options[0]?.code ?? ""));
  }, [selectedAthlete]);

  const saveProgress = async () => {
    if (!selectedAthlete) {
      setFeedback({ type: "error", message: `Selecciona un ${athleteTerm.toLowerCase()}.` });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: selectedAthlete.id,
          sessionId,
          assessmentDate: sessionDate,
          assessmentType,
          apparatus: apparatus || null,
          sportConfigId: selectedAthlete.sportConfigId,
          totalScore: score,
          overallComment: comment.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "No se pudo registrar el progreso.");
      }

      const nextCount = savedCount + 1;
      setSavedCount(nextCount);
      setComment("");
      setFeedback({
        type: "success",
        message: `Progreso guardado para ${selectedAthlete.name}${apparatus ? ` en ${selectedAthlete.apparatus.find((item) => item.code === apparatus)?.name ?? apparatus}` : ""}.`,
      });
      onSaved(nextCount);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo registrar el progreso.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedAthlete) {
    return (
      <div className="rounded-2xl border border-dashed border-zaltyko-mist bg-white p-8 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-zaltyko-text-secondary" aria-hidden="true" />
        <h3 className="mt-3 font-semibold text-zaltyko-navy">Sin personas para evaluar</h3>
        <p className="mt-1 text-sm text-zaltyko-text-secondary">La evaluación rápida se habilitará cuando la clase tenga miembros.</p>
      </div>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="session-progress-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Paso 2</p>
          <h2 id="session-progress-title" className="mt-1 text-xl font-semibold text-zaltyko-navy">Progreso técnico rápido</h2>
          <p className="mt-1 text-sm text-zaltyko-text-secondary">Registra una observación por modalidad y {apparatusTerm.toLowerCase()} sin salir de la sesión.</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-800">
          <span className="font-semibold">{savedCount}</span> {savedCount === 1 ? "registro" : "registros"} en esta sesión
        </div>
      </div>

      <div className="grid gap-5 rounded-2xl border border-zaltyko-mist/70 bg-white p-5 shadow-soft lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-progress-athlete">{athleteTerm}</Label>
            <select
              id="quick-progress-athlete"
              value={selectedAthlete.id}
              onChange={(event) => {
                setSelectedAthleteId(event.target.value);
                setFeedback(null);
              }}
              className="min-h-11 w-full rounded-xl border border-zaltyko-mist bg-white px-3 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
            >
              {athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}
            </select>
            <p className="text-xs text-zaltyko-text-secondary">{selectedAthlete.disciplineName} · {selectedAthlete.branchName}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-progress-apparatus">{apparatusTerm}</Label>
              <select
                id="quick-progress-apparatus"
                value={apparatus}
                onChange={(event) => setApparatus(event.target.value)}
                disabled={selectedAthlete.apparatus.length === 0}
                className="min-h-11 w-full rounded-xl border border-zaltyko-mist bg-white px-3 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15 disabled:bg-zaltyko-white disabled:text-zaltyko-text-secondary"
              >
                {selectedAthlete.apparatus.length === 0 ? <option value="">Seguimiento general</option> : null}
                {selectedAthlete.apparatus.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-progress-type">Tipo de registro</Label>
              <select
                id="quick-progress-type"
                value={assessmentType}
                onChange={(event) => setAssessmentType(event.target.value as QuickAssessmentType)}
                className="min-h-11 w-full rounded-xl border border-zaltyko-mist bg-white px-3 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
              >
                {ASSESSMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-progress-comment">Observación</Label>
            <Textarea
              id="quick-progress-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Ej.: mejoró la recepción; mantener hombros abiertos."
              maxLength={1200}
              rows={4}
            />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-zaltyko-navy p-5 text-white">
          <div>
            <div className="flex items-center gap-2 text-zaltyko-primary-light"><Gauge className="h-5 w-5" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-[0.18em]">Valoración rápida</span></div>
            <div className="mt-6 flex items-end gap-2"><span className="text-5xl font-semibold tabular-nums">{score.toFixed(1)}</span><span className="pb-1 text-sm text-white/60">/ 10</span></div>
            <input
              id="quick-progress-score"
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={score}
              onChange={(event) => setScore(Number(event.target.value))}
              aria-label="Puntuación rápida"
              className="mt-6 w-full accent-zaltyko-teal"
            />
            <div className="mt-1 flex justify-between text-xs text-white/50"><span>Necesita apoyo</span><span>Dominado</span></div>
          </div>
          <Button type="button" onClick={saveProgress} disabled={isSaving} className="mt-8 min-h-11 bg-zaltyko-teal text-white hover:bg-zaltyko-teal/90">
            {isSaving ? "Guardando…" : `Guardar progreso de ${selectedAthlete.name}`}
          </Button>
        </div>
      </div>

      <div
        aria-live={feedback?.type === "error" ? "assertive" : "polite"}
        role={feedback?.type === "error" ? "alert" : "status"}
        className="min-h-6 text-sm"
      >
        {feedback?.type === "success" ? <span className="inline-flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{feedback.message}</span> : null}
        {feedback?.type === "error" ? <span className="inline-flex items-center gap-2 text-rose-700"><CircleAlert className="h-4 w-4" aria-hidden="true" />{feedback.message}</span> : null}
      </div>
    </section>
  );
}

export const SessionProgressPanel = memo(SessionProgressPanelImpl);
