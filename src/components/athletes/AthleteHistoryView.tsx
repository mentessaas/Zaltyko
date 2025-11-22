"use client";

import { useState, useEffect } from "react";
import { Calendar, Filter, Search, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Assessment {
  id: string;
  assessmentDate: string;
  apparatus: string | null;
  overallComment: string | null;
  assessedByName: string | null;
  skills: Array<{
    skillName: string;
    score: number;
    comments: string | null;
  }>;
}

interface AthleteHistoryViewProps {
  athleteId: string;
  academyId: string;
  initialAssessments?: Assessment[];
}

export function AthleteHistoryView({
  athleteId,
  academyId,
  initialAssessments = [],
}: AthleteHistoryViewProps) {
  const [assessments, setAssessments] = useState<Assessment[]>(initialAssessments);
  const [filteredAssessments, setFilteredAssessments] = useState<Assessment[]>(initialAssessments);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterApparatus, setFilterApparatus] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAssessments = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        athleteId,
        academyId,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      const response = await fetch(`/api/athletes/${athleteId}/history?${params}`);
      const data = await response.json();

      if (data.items) {
        setAssessments(data.items);
        setFilteredAssessments(data.items);
      }
    } catch (error) {
      console.error("Error loading assessments:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialAssessments.length === 0) {
      loadAssessments();
    }
  }, [athleteId, academyId]);

  useEffect(() => {
    let filtered = assessments;

    if (searchQuery) {
      filtered = filtered.filter(
        (a) =>
          a.overallComment?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.apparatus?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.skills.some((s) =>
            s.skillName.toLowerCase().includes(searchQuery.toLowerCase())
          )
      );
    }

    if (filterApparatus !== "all") {
      filtered = filtered.filter((a) => a.apparatus === filterApparatus);
    }

    setFilteredAssessments(filtered);
  }, [searchQuery, filterApparatus, assessments]);

  const apparatusList = Array.from(
    new Set(assessments.map((a) => a.apparatus).filter(Boolean))
  );

  const handleExportPDF = async () => {
    try {
      const params = new URLSearchParams({
        athleteId,
        format: "pdf",
      });

      const response = await fetch(`/api/athletes/${athleteId}/export-history?${params}`);
      if (!response.ok) throw new Error("Error al exportar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `historial-${athleteId}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("Error al exportar PDF: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Historial de Evaluaciones</h2>
          <p className="text-muted-foreground mt-1">
            Todas las evaluaciones y progreso del atleta
          </p>
        </div>
        <Button variant="outline" onClick={handleExportPDF}>
          <Download className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <Input
                id="search"
                placeholder="Buscar en comentarios o habilidades..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apparatus">Aparato</Label>
              <select
                id="apparatus"
                value={filterApparatus}
                onChange={(e) => setFilterApparatus(e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">Todos</option>
                {apparatusList.map((app) => (
                  <option key={app} value={app}>
                    {app}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-date">Fecha Inicio</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={loadAssessments} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cargando...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Aplicar Filtros
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredAssessments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center">
              No se encontraron evaluaciones con los filtros aplicados
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAssessments.map((assessment) => (
            <Card
              key={assessment.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() =>
                setExpandedId(expandedId === assessment.id ? null : assessment.id)
              }
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(assessment.assessmentDate), "PPP", { locale: es })}
                    </CardTitle>
                    <CardDescription>
                      {assessment.apparatus && (
                        <Badge variant="outline" className="mt-2">
                          {assessment.apparatus}
                        </Badge>
                      )}
                      {assessment.assessedByName && (
                        <span className="ml-2">Evaluado por: {assessment.assessedByName}</span>
                      )}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{assessment.skills.length} habilidades</Badge>
                </div>
              </CardHeader>
              {expandedId === assessment.id && (
                <CardContent>
                  {assessment.overallComment && (
                    <div className="mb-4">
                      <p className="text-sm font-medium mb-1">Comentario General</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {assessment.overallComment}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-medium mb-2">Habilidades Evaluadas</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {assessment.skills.map((skill, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg border p-2">
                          <span className="text-sm">{skill.skillName}</span>
                          <div className="flex items-center gap-2">
                            <Badge>{skill.score}</Badge>
                            {skill.comments && (
                              <span className="text-xs text-muted-foreground">
                                {skill.comments}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

