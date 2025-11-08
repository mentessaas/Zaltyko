"use client";

import { FormEvent, useMemo, useState } from "react";

import { useDevSession } from "@/components/dev-session-provider";

interface SkillOption {
  id: string;
  name: string;
  apparatus: string | null;
}

interface AthleteOption {
  id: string;
  name: string;
}

interface AssessmentFormProps {
  academyId: string;
  athletes: AthleteOption[];
  skills: SkillOption[];
}

interface ScoreRow {
  skillId: string;
  score: string;
  comments: string;
}

export function AssessmentForm({ academyId, athletes, skills }: AssessmentFormProps) {
  const { session, refresh } = useDevSession();

  const [athleteId, setAthleteId] = useState(athletes[0]?.id ?? "");
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [apparatus, setApparatus] = useState<string>("");
  const [assessedBy, setAssessedBy] = useState<string>("");
  const [overallComment, setOverallComment] = useState<string>("");
  const [rows, setRows] = useState<ScoreRow[]>([{ skillId: "", score: "", comments: "" }]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const apparatusOptions = useMemo(() => {
    return Array.from(new Set(skills.map((skill) => skill.apparatus ?? "")));
  }, [skills]);

  const handleAddRow = () => {
    setRows((prev) => [...prev, { skillId: "", score: "", comments: "" }]);
  };

  const handleChangeRow = (index: number, patch: Partial<ScoreRow>) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const resetForm = () => {
    setAthleteId(athletes[0]?.id ?? "");
    setAssessmentDate(new Date().toISOString().slice(0, 10));
    setApparatus("");
    setAssessedBy("");
    setOverallComment("");
    setRows([{ skillId: "", score: "", comments: "" }]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session?.userId) {
      setErrorMessage("Activa la sesión demo antes de registrar evaluaciones.");
      return;
    }

    const filteredRows = rows
      .filter((row) => row.skillId && row.score)
      .map((row) => ({
        skillId: row.skillId,
        score: Number(row.score),
        comments: row.comments || undefined,
      }));

    setStatus("loading");
    setErrorMessage("");

    const payload = {
      academyId,
      athleteId,
      assessmentDate,
      apparatus: apparatus || undefined,
      assessedBy: assessedBy || undefined,
      overallComment: overallComment || undefined,
      scores: filteredRows,
    };

    try {
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo guardar la evaluación");
      }

      setStatus("success");
      resetForm();
    } catch (error: any) {
      setStatus("error");
      setErrorMessage(error.message ?? "Error desconocido");
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium">Registrar evaluación técnica</h2>
        {!session?.userId && (
          <button
            type="button"
            onClick={refresh}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10"
          >
            Refrescar sesión demo
          </button>
        )}
      </div>
      {athletes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay atletas registrados en esta academia. Agrega atletas antes de crear evaluaciones.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium">Atleta</label>
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={athleteId}
              onChange={(event) => setAthleteId(event.target.value)}
              required
            >
              {athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Fecha</label>
              <input
                type="date"
                className="mt-1 w-full rounded border px-3 py-2"
                value={assessmentDate}
                onChange={(event) => setAssessmentDate(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Aparato</label>
              <select
                className="mt-1 w-full rounded border px-3 py-2"
                value={apparatus}
                onChange={(event) => setApparatus(event.target.value)}
              >
                <option value="">Cualquiera</option>
                {apparatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option || "General"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Evaluador (opcional)</label>
              <input
                type="text"
                placeholder="UUID del coach"
                className="mt-1 w-full rounded border px-3 py-2"
                value={assessedBy}
                onChange={(event) => setAssessedBy(event.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Comentarios generales</label>
              <input
                type="text"
                className="mt-1 w-full rounded border px-3 py-2"
                value={overallComment}
                onChange={(event) => setOverallComment(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Puntuaciones por habilidad</h3>
              <button
                type="button"
                onClick={handleAddRow}
                className="text-xs text-primary hover:underline"
              >
                Añadir skill
              </button>
            </div>

            {rows.map((row, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-3">
                <select
                  className="rounded border px-3 py-2"
                  value={row.skillId}
                  onChange={(event) => handleChangeRow(index, { skillId: event.target.value })}
                >
                  <option value="">Selecciona skill</option>
                  {skills
                    .filter((skill) => !apparatus || skill.apparatus === apparatus)
                    .map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name} ({skill.apparatus ?? "general"})
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={10}
                  className="rounded border px-3 py-2"
                  value={row.score}
                  onChange={(event) => handleChangeRow(index, { score: event.target.value })}
                  placeholder="Score"
                />
                <input
                  type="text"
                  className="rounded border px-3 py-2"
                  value={row.comments}
                  onChange={(event) => handleChangeRow(index, { comments: event.target.value })}
                  placeholder="Comentarios"
                />
              </div>
            ))}
          </div>

          {errorMessage && (
            <p className="text-sm text-red-500">{errorMessage}</p>
          )}
          {status === "success" && (
            <p className="text-sm text-green-500">Evaluación registrada correctamente.</p>
          )}

          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50"
            disabled={status === "loading" || !athleteId}
          >
            {status === "loading" ? "Guardando..." : "Guardar evaluación"}
          </button>
        </form>
      )}
    </div>
  );
}
