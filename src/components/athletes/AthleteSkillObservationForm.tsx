"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SkillOption = { id: string; name: string; apparatus: string; difficulty: number | null };

export function AthleteSkillObservationForm({ athleteId }: { athleteId: string }) {
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [skillId, setSkillId] = useState("");
  const [status, setStatus] = useState<"learning" | "competing" | "mastered">("learning");
  const [score, setScore] = useState("");
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [visibleToGuardians, setVisibleToGuardians] = useState(false);
  const [state, setState] = useState<{ kind: "idle" | "loading" | "success" | "error"; message?: string }>({ kind: "idle" });

  useEffect(() => {
    let active = true;
    fetch("/api/skills?limit=200")
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar el catálogo de skills.");
        const payload = await response.json() as { data?: { items?: SkillOption[] } };
        if (active) setSkills(payload.data?.items ?? []);
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "No se pudo cargar el catálogo." });
      });
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!skillId) return setState({ kind: "error", message: "Selecciona un skill." });
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/athlete-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          skillId,
          status,
          score: score === "" ? null : Number(score),
          observedAt,
          notes: notes.trim() || null,
          visibleToGuardians,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar la observación.");
      setNotes("");
      setScore("");
      setState({ kind: "success", message: "Observación guardada. El progreso del atleta está actualizado." });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "No se pudo guardar la observación." });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Registrar observación</h3>
        <p className="text-sm text-muted-foreground">Captura un avance técnico desde la sesión.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="athlete-skill">Skill</Label>
          <select id="athlete-skill" value={skillId} onChange={(event) => setSkillId(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="">Selecciona un skill</option>
            {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name} · {skill.apparatus}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="athlete-skill-status">Estado</Label>
          <select id="athlete-skill-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="learning">En aprendizaje</option>
            <option value="competing">En competición</option>
            <option value="mastered">Dominado</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="athlete-skill-score">Score (0–100)</Label>
          <Input id="athlete-skill-score" type="number" min={0} max={100} value={score} onChange={(event) => setScore(event.target.value)} placeholder="Opcional" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="athlete-skill-date">Fecha</Label>
          <Input id="athlete-skill-date" type="date" required value={observedAt} onChange={(event) => setObservedAt(event.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="athlete-skill-notes">Nota del coach</Label>
          <Textarea id="athlete-skill-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} rows={3} placeholder="Qué observaste y cuál es el siguiente foco…" />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={visibleToGuardians} onChange={(event) => setVisibleToGuardians(event.target.checked)} />
          Compartir esta observación con el tutor
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={state.kind === "loading" || skills.length === 0}>{state.kind === "loading" ? "Guardando…" : "Guardar observación"}</Button>
        {state.message && <p role="status" className={state.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600 dark:text-emerald-400"}>{state.message}</p>}
      </div>
    </form>
  );
}
