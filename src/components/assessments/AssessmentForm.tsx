"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { X, Plus, Loader2, Save } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Skill {
  id: string;
  skillCode: string;
  name: string;
  description: string | null;
  difficulty: number;
}

interface AssessmentFormProps {
  athleteId: string;
  athleteName: string;
  apparatusList?: string[]; // e.g., ["rope", "ball", "clubs", "hoop", "ribbon"]
  onSuccess?: () => void;
  onCancel?: () => void;
}

const APPARATUS_LABELS: Record<string, string> = {
  rope: "Cuerda",
  ball: "Pelota",
  clubs: "Mazas",
  hoop: "Aro",
  ribbon: "Cinta",
  vt: "Salto",
  ub: "Barras Asimétricas",
  bb: "Viga",
  fx: "Suelo",
  ph: "Caballo con Arcos",
  sr: "Anillas",
  pb: "Paralelas",
  hb: "Barra Fija",
};

const ASSESSMENT_TYPES = [
  { value: "technical", label: "Técnica" },
  { value: "artistic", label: "Artística" },
  { value: "execution", label: "Ejecución" },
  { value: "coach_feedback", label: "Feedback Entrenador" },
  { value: "competition", label: "Competición" },
  { value: "practice", label: "Práctica" },
] as const;

export default function AssessmentForm({
  athleteId,
  athleteName,
  apparatusList = ["rope", "ball", "clubs", "hoop", "ribbon"],
  onSuccess,
  onCancel,
}: AssessmentFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [apparatus, setApparatus] = useState<string>(apparatusList[0] || "rope");
  const [assessmentType, setAssessmentType] = useState<string>("technical");
  const [assessmentDate, setAssessmentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [overallComment, setOverallComment] = useState<string>("");

  // Skills state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  // Load skills when apparatus changes
  useEffect(() => {
    if (!apparatus) return;

    setLoading(true);
    fetch(`/api/skills?apparatus=${apparatus}&limit=100`)
      .then((r) => r.json())
      .then((data) => {
        setSkills(data.items ?? []);
        // Reset scores when apparatus changes
        setScores({});
        setComments({});
      })
      .catch(() => setSkills([]))
      .finally(() => setLoading(false));
  }, [apparatus]);

  function handleScoreChange(skillId: string, value: number) {
    setScores((prev) => ({ ...prev, [skillId]: value }));
  }

  function handleCommentChange(skillId: string, value: string) {
    setComments((prev) => ({ ...prev, [skillId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      // Prepare scores array
      const scoresArray = Object.entries(scores)
        .filter(([_, score]) => score > 0)
        .map(([skillId, score]) => ({
          skillId,
          score,
          comments: comments[skillId] || undefined,
        }));

      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          assessmentDate,
          assessmentType,
          apparatus,
          overallComment: overallComment || undefined,
          scores: scoresArray,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Error al guardar la evaluación");
      }

      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const averageScore =
    Object.values(scores).length > 0
      ? Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Nueva evaluación</h2>
          <p className="text-sm text-muted-foreground">{athleteName}</p>
        </div>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Selection Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Apparatus */}
        <div className="space-y-2">
          <Label htmlFor="apparatus">Aparato</Label>
          <select
            id="apparatus"
            value={apparatus}
            onChange={(e) => setApparatus(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            required
          >
            {apparatusList.map((ap) => (
              <option key={ap} value={ap}>
                {APPARATUS_LABELS[ap] || ap}
              </option>
            ))}
          </select>
        </div>

        {/* Assessment Type */}
        <div className="space-y-2">
          <Label htmlFor="assessmentType">Tipo</Label>
          <select
            id="assessmentType"
            value={assessmentType}
            onChange={(e) => setAssessmentType(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            required
          >
            {ASSESSMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="space-y-2">
          <Label htmlFor="assessmentDate">Fecha</Label>
          <input
            id="assessmentDate"
            type="date"
            value={assessmentDate}
            onChange={(e) => setAssessmentDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            required
          />
        </div>
      </div>

      {/* Skills Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Skills a evaluar</Label>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        {skills.length === 0 && !loading ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                No hay skills disponibles para {APPARATUS_LABELS[apparatus] || apparatus}
              </p>
              <p className="text-xs text-muted-foreground">
                Agrega skills en el catálogo para poder evaluar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {skills.map((skill) => (
              <Card key={skill.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{skill.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {skill.skillCode}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Dificultad: {skill.difficulty}
                        </Badge>
                      </div>
                      {skill.description && (
                        <p className="text-xs text-muted-foreground">{skill.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Score */}
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.5"
                          value={scores[skill.id] ?? 5}
                          onChange={(e) => handleScoreChange(skill.id, parseFloat(e.target.value))}
                          className="w-24"
                        />
                        <span className="w-10 text-center font-medium">
                          {(scores[skill.id] ?? 5).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Comment */}
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Comentario opcional..."
                      value={comments[skill.id] || ""}
                      onChange={(e) => handleCommentChange(skill.id, e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Overall Comment */}
      <div className="space-y-2">
        <Label htmlFor="overallComment">Comentario general</Label>
        <Textarea
          id="overallComment"
          value={overallComment}
          onChange={(e) => setOverallComment(e.target.value)}
          placeholder="Observaciones generales sobre la evaluación..."
          rows={3}
        />
      </div>

      {/* Summary & Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-4">
          {averageScore !== null && (
            <div className="text-center">
              <span className="text-2xl font-bold">{averageScore.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">/10 promedio</span>
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            {Object.keys(scores).length} skill{Object.keys(scores).length !== 1 ? "s" : ""} evaluado{Object.keys(scores).length !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || skills.length === 0}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar evaluación
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
