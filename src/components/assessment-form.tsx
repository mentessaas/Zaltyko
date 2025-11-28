"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { useDevSession } from "@/components/dev-session-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface SkillOption {
  id: string;
  name: string;
  apparatus: string | null;
}

interface AthleteOption {
  id: string;
  name: string;
  groupId: string | null;
  groupName?: string | null;
  groupColor?: string | null;
}

interface AssessmentFormProps {
  academyId: string;
  athletes: AthleteOption[];
  skills: SkillOption[];
  groups?: {
    id: string;
    name: string;
    color: string | null;
  }[];
}

interface ScoreRow {
  skillId: string;
  score: string;
  comments: string;
}

export function AssessmentForm({ academyId, athletes, skills, groups = [] }: AssessmentFormProps) {
  const { session, refresh } = useDevSession();

  const [groupFilter, setGroupFilter] = useState<string>("");
  const filteredAthletes = useMemo(() => {
    if (!groupFilter) return athletes;
    return athletes.filter((athlete) => athlete.groupId === groupFilter);
  }, [athletes, groupFilter]);

  const [athleteId, setAthleteId] = useState(filteredAthletes[0]?.id ?? "");
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

  const [rowToDelete, setRowToDelete] = useState<number | null>(null);

  const handleRemoveRow = (index: number) => {
    if (rows.length > 1) {
      setRowToDelete(index);
    }
  };

  const confirmRemoveRow = () => {
    if (rowToDelete !== null) {
      setRows((prev) => prev.filter((_, i) => i !== rowToDelete));
      setRowToDelete(null);
    }
  };

  const handleChangeRow = (index: number, patch: Partial<ScoreRow>) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const resetForm = () => {
    setGroupFilter("");
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

  useEffect(() => {
    if (!filteredAthletes.some((athlete) => athlete.id === athleteId)) {
      setAthleteId(filteredAthletes[0]?.id ?? "");
    }
  }, [filteredAthletes, athleteId]);

  if (athletes.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
        <p className="mb-4 text-sm text-muted-foreground">
          Aún no has registrado evaluaciones. Selecciona un atleta y guarda tu primera evaluación técnica.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Bloque 1: Datos de evaluación */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold">Datos de evaluación</h3>
          <div className="space-y-4">
            {groups.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Grupo</Label>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                >
                  <option value="">Todos los grupos</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Atleta</Label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={athleteId}
                onChange={(event) => setAthleteId(event.target.value)}
                required
              >
                {filteredAthletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm font-medium">Fecha</Label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={assessmentDate}
                  onChange={(event) => setAssessmentDate(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Aparato</Label>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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

            <div>
              <Label className="text-sm font-medium">Evaluador (opcional)</Label>
              <input
                type="text"
                placeholder="UUID del coach"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={assessedBy}
                onChange={(event) => setAssessedBy(event.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Bloque 2: Puntuaciones por habilidad */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold">Puntuaciones por habilidad</h3>
            <Button
              type="button"
              onClick={handleAddRow}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              Añadir skill
            </Button>
          </div>
          <div className="space-y-3">

            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_1fr] md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor={`skill-${index}`} className="sr-only">
                    Skill {index + 1}
                  </Label>
                  <select
                    id={`skill-${index}`}
                    aria-label={`Seleccionar skill para fila ${index + 1}`}
                    className="flex h-11 w-full rounded-xl border-2 border-zaltyko-neutral-light bg-background px-4 py-2 text-base shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-primary-light focus-visible:ring-offset-2 focus-visible:border-zaltyko-primary disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-[44px] sm:min-h-[40px]"
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
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`score-${index}`} className="sr-only">
                    Puntuación {index + 1}
                  </Label>
                  <Input
                    id={`score-${index}`}
                    type="number"
                    min={0}
                    max={10}
                    aria-label={`Puntuación para fila ${index + 1}`}
                    value={row.score}
                    onChange={(event) => handleChangeRow(index, { score: event.target.value })}
                    placeholder="Score"
                  />
                </div>
                <div className="space-y-1 sm:col-span-1 md:col-span-1">
                  <Label htmlFor={`comments-${index}`} className="sr-only">
                    Comentarios {index + 1}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={`comments-${index}`}
                      type="text"
                      aria-label={`Comentarios para fila ${index + 1}`}
                      value={row.comments}
                      onChange={(event) => handleChangeRow(index, { comments: event.target.value })}
                      placeholder="Comentarios"
                      className="flex-1"
                    />
                    {rows.length > 1 && (
                      <Button
                        type="button"
                        onClick={() => handleRemoveRow(index)}
                        variant="outline"
                        size="icon"
                        aria-label={`Eliminar fila ${index + 1}`}
                        className="shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bloque 3: Comentarios generales + Botón guardar */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Comentarios generales</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                value={overallComment}
                onChange={(event) => setOverallComment(event.target.value)}
                placeholder="Comentarios adicionales sobre la evaluación..."
              />
            </div>

            {errorMessage && (
              <p className="text-sm text-red-500">{errorMessage}</p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-500">Evaluación registrada correctamente.</p>
            )}

            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={status === "loading" || !athleteId}
            >
              {status === "loading" ? "Guardando..." : "Guardar evaluación"}
            </Button>
          </div>
        </div>
      </form>

      {process.env.NODE_ENV !== "production" && !session?.userId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-center justify-between">
            <p>Activa la sesión demo para registrar evaluaciones.</p>
            <button
              type="button"
              onClick={refresh}
              className="ml-4 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Refrescar sesión demo
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={rowToDelete !== null}
        onOpenChange={(open) => {
          console.log('[AssessmentForm] ConfirmDialog onOpenChange called with open:', open);
          if (!open) {
            console.log('[AssessmentForm] Setting rowToDelete to null');
            setRowToDelete(null);
          }
        }}
        title="Eliminar fila"
        description="¿Estás seguro de que deseas eliminar esta fila? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={confirmRemoveRow}
      />
    </div>
  );
}
