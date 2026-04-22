"use client";

import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RecentReportsProps {
  academyId: string;
}

export function RecentReports({ academyId }: RecentReportsProps) {
  void academyId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Reportes Recientes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">Historial de reportes no habilitado en este release</p>
          <p className="mt-2 text-sm text-muted-foreground">
            En la primera versión mostraremos solo la generación puntual de reportes. El historial
            y la biblioteca de reportes se activarán cuando tengan persistencia y auditoría reales.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
