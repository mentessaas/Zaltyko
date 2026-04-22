import { Users, DollarSign, TrendingUp, GraduationCap, UserCog, UserMinus, Calendar, BarChart3 } from "lucide-react";
import { eq } from "drizzle-orm";
import { FeatureUnavailableState } from "@/components/product/FeatureUnavailableState";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ReportCard } from "@/components/reports/ReportCard";
import { RecentReports } from "@/components/reports/RecentReports";
import { ScheduledReports } from "@/components/reports/ScheduledReports";
import { isFeatureEnabled } from "@/lib/product/features";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

const reportTypes = [
  {
    id: "attendance",
    title: "Asistencia",
    description: "Asistencia por atleta, clase y rango de fechas",
    icon: <Calendar className="h-6 w-6 text-white" />,
    href: "/attendance",
    color: "bg-blue-500",
  },
  {
    id: "financial",
    title: "Financiero",
    description: "Ingresos, facturas, cobros y morosos",
    icon: <DollarSign className="h-6 w-6 text-white" />,
    href: "/financial",
    color: "bg-green-500",
  },
  {
    id: "progress",
    title: "Progreso",
    description: "Progreso de atletas por nivel y habilidad",
    icon: <TrendingUp className="h-6 w-6 text-white" />,
    href: "/progress",
    color: "bg-red-500",
  },
  {
    id: "class",
    title: "Clases",
    description: "Clases populares y asistencia por clase",
    icon: <GraduationCap className="h-6 w-6 text-white" />,
    href: "/class",
    color: "bg-orange-500",
  },
  {
    id: "coach",
    title: "Entrenadores",
    description: "Rendimiento y métricas de entrenadores",
    icon: <UserCog className="h-6 w-6 text-white" />,
    href: "/coach",
    color: "bg-teal-500",
  },
  {
    id: "churn",
    title: "Bajas",
    description: "Atletas dados de baja y razones",
    icon: <UserMinus className="h-6 w-6 text-white" />,
    href: "/churn",
    color: "bg-red-500",
  },
];

export default async function ReportsPage({ params }: PageProps) {
  const { academyId } = await params;
  const [academy] = await db
    .select({
      academyType: academies.academyType,
      country: academies.country,
      countryCode: academies.countryCode,
      discipline: academies.discipline,
      disciplineVariant: academies.disciplineVariant,
      federationConfigVersion: academies.federationConfigVersion,
      specializationStatus: academies.specializationStatus,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  const specialization = resolveAcademySpecialization(academy ?? {});

  if (!isFeatureEnabled("reportsHub")) {
    return (
      <FeatureUnavailableState
        title="Centro de reportes"
        description="Los reportes multi-módulo y la programación automática todavía no están habilitados para los primeros clientes."
        backHref={`/app/${academyId}/dashboard`}
        backLabel="Volver al dashboard"
      />
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Reportes" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Centro de Reportes</h1>
          <p className="text-muted-foreground mt-1">
            Genera y gestiona reportes de {specialization.labels.athletesPlural.toLowerCase()}, {specialization.labels.classLabel.toLowerCase()}s y rendimiento deportivo
          </p>
        </div>
      </div>

      {/* Report Type Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((report) => (
          <ReportCard
            key={report.id}
            title={report.title}
            description={report.description}
            icon={report.icon}
            href={`/app/${academyId}/reports${report.href}`}
            color={report.color}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Reports Section */}
        <RecentReports academyId={academyId} />

        {/* Scheduled Reports Section */}
        <ScheduledReports academyId={academyId} />
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <ReportCard
          title="Total Atletas"
          description="Activos actualmente"
          icon={<Users className="h-5 w-5 text-white" />}
          href={`/app/${academyId}/athletes`}
          color="bg-blue-500"
          compact
        />
        <ReportCard
          title={`${specialization.labels.classLabel}s activas`}
          description="Este mes"
          icon={<GraduationCap className="h-5 w-5 text-white" />}
          href={`/app/${academyId}/classes`}
          color="bg-orange-500"
          compact
        />
        <ReportCard
          title="Ingresos del Mes"
          description="Ver detalle"
          icon={<DollarSign className="h-5 w-5 text-white" />}
          href={`/app/${academyId}/reports/financial`}
          color="bg-green-500"
          compact
        />
        <ReportCard
          title="Tasa de Asistencia"
          description="Promedio general"
          icon={<BarChart3 className="h-5 w-5 text-white" />}
          href={`/app/${academyId}/reports/attendance`}
          color="bg-red-500"
          compact
        />
      </div>
    </div>
  );
}
