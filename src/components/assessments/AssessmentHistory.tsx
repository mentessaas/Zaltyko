"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, User, FileText, ChevronDown, ChevronUp, Play, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { AssessmentWithScores, AssessmentType } from "@/types";

interface AssessmentHistoryProps {
  assessments: AssessmentWithScores[];
  athleteName: string;
  onSelectAssessment?: (assessment: AssessmentWithScores) => void;
  onVideoClick?: (videoUrl: string) => void;
}

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

export function AssessmentHistory({ assessments, athleteName, onSelectAssessment, onVideoClick }: AssessmentHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AssessmentType | "all">("all");

  const filteredAssessments = useMemo(() => {
    if (selectedType === "all") return assessments;
    return assessments.filter((a) => a.assessmentType === selectedType);
  }, [assessments, selectedType]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Agrupar evaluaciones por año/mes
  const groupedAssessments = useMemo(() => {
    const groups: Record<string, AssessmentWithScores[]> = {};
    filteredAssessments.forEach((assessment) => {
      const date = new Date(assessment.assessmentDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(assessment);
    });
    return groups;
  }, [filteredAssessments]);

  const sortedGroupKeys = Object.keys(groupedAssessments).sort((a, b) => b.localeCompare(a));

  if (assessments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Sin evaluaciones</h3>
          <p className="text-sm text-muted-foreground">
            {athleteName} aún no tiene evaluaciones registradas
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros por tipo */}
      <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as AssessmentType | "all")}>
        <TabsList className="w-full justify-start h-auto flex-wrap">
          <TabsTrigger value="all">Todas ({assessments.length})</TabsTrigger>
          {(["technical", "artistic", "physical", "behavioral", "overall"] as AssessmentType[]).map((type) => {
            const count = assessments.filter((a) => a.assessmentType === type).length;
            return (
              <TabsTrigger key={type} value={type} disabled={count === 0}>
                {typeLabels[type]} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Lista de evaluaciones */}
      <div className="space-y-4">
        {sortedGroupKeys.map((groupKey) => {
          const [year, month] = groupKey.split("-");
          const dateLabel = format(new Date(parseInt(year), parseInt(month) - 1), "MMMM yyyy", { locale: es });
          const groupAssessments = groupedAssessments[groupKey];

          return (
            <div key={groupKey}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 capitalize">
                {dateLabel}
              </h3>
              <div className="space-y-2">
                {groupAssessments.map((assessment) => {
                  const isExpanded = expandedId === assessment.id;
                  const hasVideos = assessment.videos && assessment.videos.length > 0;

                  return (
                    <Card
                      key={assessment.id}
                      className={cn(
                        "transition-all cursor-pointer",
                        isExpanded && "ring-2 ring-primary"
                      )}
                      onClick={() => {
                        toggleExpand(assessment.id);
                        onSelectAssessment?.(assessment);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className={cn(typeColors[assessment.assessmentType])}>
                                {typeLabels[assessment.assessmentType]}
                              </Badge>
                              {assessment.apparatus && (
                                <span className="text-sm text-muted-foreground">
                                  {assessment.apparatus}
                                </span>
                              )}
                              {hasVideos && (
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                  <Play className="h-3 w-3 mr-1" />
                                  {assessment.videos.length} video{assessment.videos.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(assessment.assessmentDate), "PPP", { locale: es })}
                              </span>
                              {assessment.assessedByName && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {assessment.assessedByName}
                                </span>
                              )}
                            </div>
                            {assessment.averageScore !== null && (
                              <div className="mt-2">
                                <span className="text-lg font-semibold">
                                  {assessment.averageScore.toFixed(1)}
                                </span>
                                <span className="text-xs text-muted-foreground"> / 10 promedio</span>
                              </div>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        {/* Contenido expandido */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
                            {/* Scores */}
                            {assessment.scores.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2">Puntuaciones</h4>
                                <div className="space-y-1">
                                  {assessment.scores.map((score) => (
                                    <div key={score.id} className="flex justify-between text-sm">
                                      <span>{score.skillName}</span>
                                      <span className="font-medium">{score.score}/10</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Videos */}
                            {hasVideos && (
                              <div>
                                <h4 className="text-sm font-medium mb-2">Videos</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {assessment.videos.map((video) => (
                                    <div
                                      key={video.id}
                                      className="relative rounded-lg overflow-hidden bg-muted group cursor-pointer"
                                      onClick={() => onVideoClick?.(video.url)}
                                    >
                                      <video
                                        src={video.url}
                                        className="w-full h-20 object-cover"
                                        preload="metadata"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Play className="h-8 w-8 text-white" />
                                      </div>
                                      {video.title && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                                          <p className="text-xs text-white truncate">{video.title}</p>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Comentarios */}
                            {assessment.overallComment && (
                              <div>
                                <h4 className="text-sm font-medium mb-1">Comentarios</h4>
                                <p className="text-sm text-muted-foreground">{assessment.overallComment}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
