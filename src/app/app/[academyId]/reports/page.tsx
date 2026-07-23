import { Users, DollarSign, TrendingUp, GraduationCap, UserCog, UserMinus, Calendar, BarChart3, FileBarChart, Download } from "lucide-react";
import { eq } from "drizzle-orm";
import { FeatureUnavailableState } from "@/components/product/FeatureUnavailableState";
import { PageHeader } from "@/components/ui/page-header";
import { ReportCard } from "@/components/reports/ReportCard";
import { RecentReports } from "@/components/reports/RecentReports";
import { ScheduledReports } from "@/components/reports/ScheduledReports";
import { isFeatureEnabled } from "@/lib/product/features";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function ReportsPage({ params }: PageProps) {
  const { academyId } = await params;
  const [[academy], sportConfigs] = await Promise.all([
    db
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
      .limit(1),
    getAcademySportConfigOptions(academyId),
  ]);
  const specialization = resolveAcademySpecialization(academy ?? {});
  const terms = getTerminologyForSportConfig(sportConfigs);
  const athletesTermLower = terms.athletes.toLowerCase();
  const athleteTermLower = terms.athlete.toLowerCase();
  const coachTermLower = terms.coach.toLowerCase();
  const reportTypes = [
    {
      id: "attendance",
      title: terms.attendance,
      description: `${terms.attendance} por ${athleteTermLower}, clase y rango de fechas`,
      icon: <Calendar className="h-6 w-6 text-white" />,
      href: "/attendance",
      color: "bg-zaltyko-teal",
    },
    {
      id: "financial",
      title: "Financiero",
      description: `Ingresos, recibos internos, cobros y ${terms.payment.toLowerCase()}s pendientes`,
      icon: <DollarSign className="h-6 w-6 text-white" />,
      href: "/financial",
      color: "bg-zaltyko-indigo",
    },
    {
      id: "progress",
      title: "Progreso",
      description: `Progreso de ${athletesTermLower} por ${terms.level.toLowerCase()} y habilidad`,
      icon: <TrendingUp className="h-6 w-6 text-white" />,
      href: "/progress",
      color: "bg-zaltyko-coral",
    },
    {
      id: "class",
      title: "Clases",
      description: `Clases populares y ${terms.attendance.toLowerCase()} por clase`,
      icon: <GraduationCap className="h-6 w-6 text-white" />,
      href: "/class",
      color: "bg-zaltyko-navy",
    },
    {
      id: "coach",
      title: `${terms.coach}s`,
      description: `Rendimiento y métricas de ${coachTermLower}s`,
      icon: <UserCog className="h-6 w-6 text-white" />,
      href: "/coach",
      color: "bg-zaltyko-teal",
    },
    {
      id: "churn",
      title: "Bajas",
      description: `${terms.athletes} dados de baja y razones`,
      icon: <UserMinus className="h-6 w-6 text-white" />,
      href: "/churn",
      color: "bg-zaltyko-coral",
    },
    {
      id: "events-export",
      title: "Eventos y competiciones",
      description: "Exportación XLSX de eventos, inscripciones y participantes autorizados; no es un formato federativo automático.",
      icon: <Calendar className="h-6 w-6 text-white" />,
      href: `/api/reports/events/export?academyId=${academyId}`,
      color: "bg-zaltyko-indigo",
    },
  ];

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
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Reportes" },
        ]}
        title="Centro de reportes"
        description={`Genera y gestiona reportes de ${athletesTermLower}, ${specialization.labels.classLabel.toLowerCase()}s y rendimiento deportivo.`}
        icon={<FileBarChart className="h-5 w-5" strokeWidth={1.8} />}
      />

      {/* Report Type Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((report) => (
          <ReportCard
            key={report.id}
            title={report.title}
            description={report.description}
            icon={report.icon}
            href={report.href.startsWith("/api/") ? report.href : `/app/${academyId}/reports${report.href}`}
            color={report.color}
          />
        ))}
      </div>

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="exports-heading">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-zaltyko-teal p-2 text-white">
            <Download className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="exports-heading" className="font-semibold">Salida de datos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Exporta la información disponible por módulo y permisos. La descarga no equivale a una copia completa de toda la academia.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a className="rounded-md border px-3 py-2 hover:bg-muted" href={`/api/athletes/export?academyId=${academyId}`}>
            Gimnastas · XLSX
          </a>
          <a className="rounded-md border px-3 py-2 hover:bg-muted" href={`/api/reports/events/export?academyId=${academyId}`}>
            Eventos · XLSX
          </a>
          <span className="rounded-md border border-dashed px-3 py-2 text-muted-foreground">
            Asistencia, finanzas y progreso · desde cada reporte
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Reports Section */}
        <RecentReports academyId={academyId} />

        {/* Scheduled Reports Section */}
        {isFeatureEnabled("scheduledReports") ? (
          <ScheduledReports academyId={academyId} />
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/30 p-5">
            <h2 className="font-semibold">Reportes programados</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta función se habilita cuando el envío programado y sus controles de entrega estén disponibles para tu plan.
            </p>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <ReportCard
          title={`Total ${terms.athletes}`}
          description="Activos actualmente"
          icon={<Users className="h-5 w-5 text-white" />}
          href={`/app/${academyId}/athletes`}
          color="bg-zaltyko-teal"
          compact
        />
        <ReportCard
          title={`${specialization.labels.classLabel}s activas`}
          description="Este mes"
          icon={<GraduationCap className="h-5 w-5 text-white" />}
          href={`/app/${academyId}/classes`}
          color="bg-zaltyko-navy"
          compact
        />
        <ReportCard
          title="Ingresos del Mes"
          description="Ver detalle"
          icon={<DollarSign className="h-5 w-5 text-white" />}
          href={`/app/${academyId}/reports/financial`}
          color="bg-zaltyko-indigo"
          compact
        />
        <ReportCard
          title={`Tasa de ${terms.attendance}`}
          description="Promedio general"
          icon={<BarChart3 className="h-5 w-5 text-white" />}
          href={`/app/${academyId}/reports/attendance`}
          color="bg-zaltyko-coral"
          compact
        />
      </div>
    </div>
  );
}
