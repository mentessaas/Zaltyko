"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Download, FileText, Loader2, Calendar, User, TrendingUp } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AssessmentWithScores, AssessmentType } from "@/types";

interface AssessmentPDFExportProps {
  assessments: AssessmentWithScores[];
  athleteName: string;
  className?: string;
}

type ExportRange = "last" | "3m" | "6m" | "all";

export function AssessmentPDFExport({ assessments, athleteName, className }: AssessmentPDFExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportRange, setExportRange] = useState<ExportRange>("all");

  const filteredAssessments = (() => {
    const now = new Date();
    let cutoffDate: Date | null = null;

    switch (exportRange) {
      case "last":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "3m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case "6m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 6));
        break;
      default:
        cutoffDate = null;
    }

    return cutoffDate
      ? assessments.filter((a) => new Date(a.assessmentDate) >= cutoffDate!)
      : assessments;
  })();

  const generatePDF = async () => {
    setIsExporting(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(20);
      doc.setTextColor(59, 130, 246); // blue-500
      doc.text("Informe de Evaluaciones", pageWidth / 2, 20, { align: "center" });

      // Athlete info
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Atleta: ${athleteName}`, 14, 35);
      doc.text(`Fecha de generación: ${format(new Date(), "PPP", { locale: es })}`, 14, 42);

      // Summary stats
      const totalAssessments = filteredAssessments.length;
      const avgScore = totalAssessments > 0
        ? filteredAssessments.reduce((sum, a) => sum + (a.averageScore ?? 0), 0) / totalAssessments
        : 0;

      doc.setFontSize(10);
      doc.text(`Total de evaluaciones: ${totalAssessments}`, 14, 52);
      doc.text(`Promedio general: ${avgScore.toFixed(1)}`, 14, 58);

      // Assessments table
      if (filteredAssessments.length > 0) {
        const tableData = filteredAssessments
          .sort((a, b) => new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime())
          .map((assessment) => [
            format(new Date(assessment.assessmentDate), "dd/MM/yyyy"),
            getTypeLabel(assessment.assessmentType),
            assessment.apparatus ?? "-",
            assessment.averageScore?.toFixed(1) ?? "-",
            assessment.scores.length.toString(),
          ]);

        autoTable(doc, {
          startY: 65,
          head: [["Fecha", "Tipo", "Aparato", "Promedio", "Skills"]],
          body: tableData,
          theme: "grid",
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: "bold",
          },
          styles: {
            fontSize: 9,
            cellPadding: 3,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
        });
      }

      // Detailed scores for each assessment
      let currentY = (doc as any).lastAutoTable?.finalY + 15 || 100;

      for (const assessment of filteredAssessments.slice(0, 5)) {
        // Limit to last 5 for PDF size
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(
          `${getTypeLabel(assessment.assessmentType)} - ${format(new Date(assessment.assessmentDate), "PPP", { locale: es })}`,
          14,
          currentY
        );
        currentY += 7;

        if (assessment.scores.length > 0) {
          const scoreData = assessment.scores.map((score) => [
            score.skillName,
            score.score.toString(),
            score.comments ?? "-",
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [["Skill", "Score", "Comentarios"]],
            body: scoreData,
            theme: "striped",
            headStyles: {
              fillColor: [100, 116, 139],
              fontSize: 8,
            },
            styles: {
              fontSize: 8,
              cellPadding: 2,
            },
            margin: { left: 14 },
            tableWidth: "wrap",
          });

          currentY = (doc as any).lastAutoTable.finalY + 10;
        }

        if (assessment.overallComment) {
          doc.setFontSize(9);
          doc.setFont("helvetica", "italic");
          const commentLines = doc.splitTextToSize(`Comentarios: ${assessment.overallComment}`, 180);
          doc.text(commentLines, 14, currentY);
          currentY += commentLines.length * 4 + 5;
        }
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Página ${i} de ${pageCount} - Generado por Zaltyko`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" }
        );
      }

      // Save
      const filename = `evaluaciones_${athleteName.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const getTypeLabel = (type: AssessmentType): string => {
    const labels: Record<AssessmentType, string> = {
      technical: "Técnica",
      artistic: "Artística",
      physical: "Condición Física",
      behavioral: "Comportamental",
      overall: "General",
    };
    return labels[type];
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Exportar Informe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Rango de evaluaciones</label>
          <Select value={exportRange} onValueChange={(v) => setExportRange(v as ExportRange)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar rango" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last">Último mes</SelectItem>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
              <SelectItem value="6m">Últimos 6 meses</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg bg-muted p-3 text-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-muted-foreground">Evaluaciones:</span>
            <span className="font-medium">{filteredAssessments.length}</span>
          </div>
          {filteredAssessments.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Promedio:</span>
              <span className="font-medium">
                {(filteredAssessments.reduce((sum, a) => sum + (a.averageScore ?? 0), 0) / filteredAssessments.length).toFixed(1)}
              </span>
            </div>
          )}
        </div>

        <Button
          onClick={generatePDF}
          disabled={isExporting || filteredAssessments.length === 0}
          className="w-full"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generando...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Descargar PDF
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
