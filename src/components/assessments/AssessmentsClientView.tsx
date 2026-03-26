"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileText,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  ChevronDown,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AssessmentHistory } from "./AssessmentHistory";
import type { AssessmentWithScores, AssessmentType } from "@/types";

const typeLabels: Record<AssessmentType, string> = {
  technical: "Técnica",
  artistic: "Artística",
  physical: "Condición Física",
  behavioral: "Comportamental",
  overall: "General",
};

const typeColors: Record<AssessmentType, string> = {
  technical: "bg-blue-100 text-blue-800 border-blue-200",
  artistic: "bg-purple-100 text-purple-800 border-purple-200",
  physical: "bg-green-100 text-green-800 border-green-200",
  behavioral: "bg-amber-100 text-amber-800 border-amber-200",
  overall: "bg-gray-100 text-gray-800 border-gray-200",
};

interface AssessmentsClientViewProps {
  assessments: AssessmentWithScores[];
  athletes: Array<{ id: string; name: string }>;
  academies: Array<{ id: string; name: string }>;
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  totalPages: number;
  totalCount: number;
  perPage: number;
}

export default function AssessmentsClientView({
  assessments,
  athletes,
  academies,
  searchParams,
  page,
  totalPages,
  totalCount,
  perPage,
}: AssessmentsClientViewProps) {
  const router = useRouter();
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [historyAssessments, setHistoryAssessments] = useState<AssessmentWithScores[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Active filters
  const activeFilters = Object.entries(searchParams)
    .filter(([key, v]) => v && v !== "" && !["page"].includes(key))
    .map(([key, value]) => ({ key, value: String(value) }));

  function buildUrl(params: Record<string, string | undefined>) {
    const merged = { ...searchParams, ...params, page: undefined };
    const cleaned = Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== "")
    );
    const qs = new URLSearchParams(cleaned as unknown as Record<string, string>).toString();
    return `/dashboard/assessments${qs ? `?${qs}` : ""}`;
  }

  async function loadAthleteHistory(athleteId: string) {
    if (selectedAthlete === athleteId) {
      setSelectedAthlete(null);
      setHistoryAssessments(null);
      return;
    }
    setSelectedAthlete(athleteId);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/assessments/${athleteId}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryAssessments(data.assessments ?? []);
      } else {
        setHistoryAssessments([]);
      }
    } catch {
      setHistoryAssessments([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  const selectedAthleteName = athletes.find((a) => a.id === selectedAthlete)?.name ?? "";

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="gap-1"
          >
            <Filter className="h-3 w-3" />
            Filtros
          </Button>
          {activeFilters.length > 0 &&
            activeFilters.map((f) => (
              <Badge key={f.key} variant="outline" className="gap-1 pl-2 pr-1">
                {f.key}: {f.value}
                <Link
                  href={buildUrl({ [f.key]: undefined })}
                  className="ml-1 rounded hover:bg-muted p-0.5"
                >
                  <X className="h-3 w-3" />
                </Link>
              </Badge>
            ))}
        </div>
        <Link href="/dashboard/athletes">
          <Button variant="outline" size="sm" className="gap-1">
            <Plus className="h-3 w-3" />
            Nueva evaluación
          </Button>
        </Link>
      </div>

      {/* Filter form */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <form
              className="flex flex-wrap gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const params: Record<string, string | undefined> = {};
                fd.forEach((v, k) => {
                  if (String(v)) params[k] = String(v);
                });
                params.page = undefined;
                router.push(buildUrl(params));
              }}
            >
              <select
                name="academy"
                defaultValue={String(searchParams.academy ?? "")}
                className="min-w-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Todas las academias</option>
                {academies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <select
                name="athlete"
                defaultValue={String(searchParams.athlete ?? "")}
                className="min-w-[180px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Todos los atletas</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <select
                name="type"
                defaultValue={String(searchParams.type ?? "")}
                className="min-w-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Todos los tipos</option>
                <option value="technical">Técnica</option>
                <option value="artistic">Artística</option>
                <option value="physical">Condición Física</option>
                <option value="behavioral">Comportamental</option>
                <option value="overall">General</option>
              </select>
              <input
                type="date"
                name="from"
                defaultValue={String(searchParams.from ?? "")}
                placeholder="Desde"
                className="w-[150px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="date"
                name="to"
                defaultValue={String(searchParams.to ?? "")}
                placeholder="Hasta"
                className="w-[150px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button type="submit" size="sm">Aplicar</Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard/assessments")}
              >
                Limpiar
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Athlete history panel */}
      {selectedAthlete && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                Historial de {selectedAthleteName}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedAthlete(null); setHistoryAssessments(null); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : historyAssessments !== null ? (
              <AssessmentHistory
                assessments={historyAssessments}
                athleteName={selectedAthleteName}
              />
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Assessments list */}
      {assessments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Sin evaluaciones</h3>
            <p className="text-sm text-muted-foreground mb-4">
              No hay evaluaciones registradas con los filtros actuales.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/athletes">
                Ir a atletas
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * perPage + 1}–{Math.min(page * perPage, totalCount)} de {totalCount} evaluaciones
          </div>

          {assessments.map((assessment) => (
            <Card
              key={assessment.id}
              className={cn(
                "transition-all hover:shadow-md",
                selectedAthlete === assessment.athleteId && "ring-2 ring-primary"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className={cn(typeColors[assessment.assessmentType])}>
                        {typeLabels[assessment.assessmentType]}
                      </Badge>
                      {assessment.apparatus && (
                        <span className="text-sm text-muted-foreground">{assessment.apparatus}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {format(new Date(assessment.assessmentDate), "PPP", { locale: es })}
                      </span>
                      <Link
                        href={`/dashboard/athletes/${assessment.athleteId}`}
                        className="font-medium text-emerald-500 hover:underline"
                      >
                        {assessment.athleteName}
                      </Link>
                    </div>
                    {assessment.overallComment && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {assessment.overallComment}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {assessment.averageScore !== null && (
                      <div className="text-right">
                        <span className="text-xl font-bold">{assessment.averageScore.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">/10</span>
                      </div>
                    )}
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadAthleteHistory(assessment.athleteId)}
                        title="Ver historial"
                        className="gap-1"
                      >
                        <ChevronDown className="h-3 w-3" />
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => router.push(buildUrl({ page: String(page - 1) }))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => router.push(buildUrl({ page: String(page + 1) }))}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
