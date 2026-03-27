"use client";

import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { Shield, AlertTriangle, Calendar, Award, Users, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AthleteCategoryCount, ExpiringLicense, UpcomingCompetition } from "@/lib/dashboard";

interface GymMetricsWidgetProps {
  athletesByCategory: AthleteCategoryCount[];
  expiringLicenses: ExpiringLicense[];
  expiringLicensesThisWeek: number;
  expiringLicensesThisMonth: number;
  upcomingCompetitions: UpcomingCompetition[];
  assessmentsThisMonth: number;
  totalAthletesWithActiveLicense: number;
  academyId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  pre_iniciacion: "Pre-iniciación",
  iniciacion: "Iniciación",
  alevin: "Alevín",
  infantil: "Infantil",
  junior: "Junior",
  senior: "Senior",
  absoluta: "Absoluta",
  promesa: "Promesa",
  adulto: "Adulto",
  // English variants
  pre_initiation: "Pre-iniciación",
  initiation: "Iniciación",
  cadet: "Cadete",
  youth: "Juvenil",
  elite: "Élite",
};

function getDaysLabel(days: number): string {
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `${days} días`;
}

export function GymMetricsWidget({
  athletesByCategory,
  expiringLicenses,
  expiringLicensesThisWeek,
  expiringLicensesThisMonth,
  upcomingCompetitions,
  assessmentsThisMonth,
  totalAthletesWithActiveLicense,
  academyId,
}: GymMetricsWidgetProps) {
  const totalAthletes = athletesByCategory.reduce((sum, cat) => sum + cat.count, 0);
  const licensesCoverage = totalAthletes > 0
    ? Math.round((totalAthletesWithActiveLicense / totalAthletes) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Métricas GR
        </h2>
        <Link
          href={`/app/${academyId}/athletes`}
          className="text-sm text-primary hover:underline"
        >
          Ver atletas
        </Link>
      </div>

      {/* Athletes by Category + License Coverage */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Athletes by Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Atletas por categoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            {athletesByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin categorías asignadas
              </p>
            ) : (
              <div className="space-y-2">
                {athletesByCategory
                  .sort((a, b) => {
                    const order = ["pre_iniciacion", "iniciacion", "alevin", "infantil", "junior", "senior", "absoluta", "promesa", "adulto"];
                    const aIdx = order.indexOf(a.category.toLowerCase());
                    const bIdx = order.indexOf(b.category.toLowerCase());
                    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                  })
                  .map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <span className="text-sm">
                        {CATEGORY_LABELS[cat.category.toLowerCase()] || cat.category}
                      </span>
                      <Badge variant="outline" className="font-semibold">
                        {cat.count}
                      </Badge>
                    </div>
                  ))}
                <div className="border-t pt-2 mt-2 flex items-center justify-between font-medium">
                  <span className="text-sm">Total</span>
                  <Badge variant="default">{totalAthletes}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* License Coverage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Cobertura de licencias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-primary">{licensesCoverage}%</p>
              <p className="text-sm text-muted-foreground">
                {totalAthletesWithActiveLicense} de {totalAthletes} atletas con licencia activa
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  Caducan esta semana
                </span>
                <Badge variant="error">{expiringLicensesThisWeek}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Caducan en 30 días
                </span>
                <Badge variant="pending" className="bg-amber-100 text-amber-800 border-amber-200">
                  {expiringLicensesThisMonth}
                </Badge>
              </div>
            </div>
            <Link
              href={`/app/${academyId}/licenses`}
              className="block text-center text-sm text-primary hover:underline"
            >
              Gestionar licencias
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Licenses Alert */}
      {expiringLicenses.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Licencias por caducar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringLicenses.slice(0, 3).map((license) => (
                <div
                  key={license.id}
                  className="flex items-center justify-between rounded-lg bg-amber-100/50 p-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {license.personName || "Sin nombre"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {license.licenseType} · {license.federation}
                    </p>
                  </div>
                  <Badge
                    variant={license.daysUntilExpiry <= 7 ? "error" : "pending"}
                    className={
                      license.daysUntilExpiry <= 7
                        ? ""
                        : "bg-amber-100 text-amber-800 border-amber-200"
                    }
                  >
                    {getDaysLabel(license.daysUntilExpiry)}
                  </Badge>
                </div>
              ))}
            </div>
            {expiringLicenses.length > 3 && (
              <Link
                href={`/app/${academyId}/licenses?filter=expiring`}
                className="block text-center text-xs text-amber-700 hover:underline mt-2"
              >
                Ver todas ({expiringLicenses.length})
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upcoming Competitions + Assessments */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Upcoming Competitions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Próximas competiciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingCompetitions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay competiciones próximas
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingCompetitions.map((comp) => (
                  <Link
                    key={comp.id}
                    href={`/app/${academyId}/events/${comp.id}`}
                    className="flex items-center justify-between rounded-lg border p-2 hover:bg-accent transition"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{comp.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(comp.startDate), "dd MMM yyyy", { locale: es })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {comp.level}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assessments This Month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              Evaluaciones este mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-4xl font-bold text-primary">{assessmentsThisMonth}</p>
              <p className="text-sm text-muted-foreground">evaluaciones registradas</p>
            </div>
            <Link
              href={`/app/${academyId}/assessments`}
              className="block text-center text-sm text-primary hover:underline"
            >
              Ver historial de evaluaciones
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
