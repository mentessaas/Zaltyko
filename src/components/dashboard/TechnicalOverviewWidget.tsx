"use client";

import Link from "next/link";
import { Target, Dumbbell, Layers3 } from "lucide-react";

import type { TechnicalDashboardSummary } from "@/lib/dashboard/technical-summary";
import type { AcademySpecializationContext } from "@/lib/specialization/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TechnicalOverviewWidgetProps {
  academyId: string;
  specialization: AcademySpecializationContext;
  summary: TechnicalDashboardSummary;
}

export function TechnicalOverviewWidget({
  academyId,
  specialization,
  summary,
}: TechnicalOverviewWidgetProps) {
  const hasContent =
    summary.topFocuses.length > 0 ||
    summary.topApparatus.length > 0 ||
    summary.topSessionBlocks.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">Panorama técnico actual</CardTitle>
          <p className="text-sm text-muted-foreground">
            Resumen vivo de focos, aparatos y bloques activos en {specialization.labels.disciplineName.toLowerCase()}.
          </p>
        </div>
        <Link
          href={`/app/${academyId}/groups`}
          className="text-xs font-semibold text-primary transition hover:underline"
        >
          Ajustar estructura
        </Link>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-lg border bg-background/80 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Target className="h-4 w-4 text-primary" />
            Focos técnicos
          </div>
          <p className="text-xs text-muted-foreground">
            {summary.groupsWithTechnicalFocus} {summary.groupsWithTechnicalFocus === 1 ? specialization.labels.groupLabel.toLowerCase() : `${specialization.labels.groupLabel.toLowerCase()}s`} y{" "}
            {summary.classesWithTechnicalFocus} {summary.classesWithTechnicalFocus === 1 ? specialization.labels.classLabel.toLowerCase() : `${specialization.labels.classLabel.toLowerCase()}s`} con foco definido.
          </p>
          <div className="flex flex-wrap gap-2">
            {summary.topFocuses.map((item) => (
              <Badge key={item.label} variant="outline">
                {item.label} · {item.count}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-background/80 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Dumbbell className="h-4 w-4 text-primary" />
            Aparatos más activos
          </div>
          <p className="text-xs text-muted-foreground">
            {summary.groupsWithApparatus} {summary.groupsWithApparatus === 1 ? specialization.labels.groupLabel.toLowerCase() : `${specialization.labels.groupLabel.toLowerCase()}s`} y{" "}
            {summary.classesWithApparatus} {summary.classesWithApparatus === 1 ? specialization.labels.classLabel.toLowerCase() : `${specialization.labels.classLabel.toLowerCase()}s`} ya usan aparatos definidos.
          </p>
          <div className="flex flex-wrap gap-2">
            {summary.topApparatus.map((item) => (
              <Badge key={item.label} variant="outline">
                {item.label} · {item.count}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-background/80 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Layers3 className="h-4 w-4 text-primary" />
            Bloques de sesión
          </div>
          <p className="text-xs text-muted-foreground">
            Los bloques más repetidos te ayudan a ver cómo se está organizando la semana.
          </p>
          <div className="flex flex-wrap gap-2">
            {summary.topSessionBlocks.map((item) => (
              <Badge key={item.label} variant="outline">
                {item.label} · {item.count}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
