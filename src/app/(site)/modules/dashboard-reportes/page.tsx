import { Metadata } from "next";
import { BarChart3, Clock, TrendingUp, Target, Users, Briefcase, GraduationCap } from "lucide-react";
import ModuleHero from "../components/ModuleHero";
import {
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  UseCasesSection,
  ModuleCta,
} from "../components/ModuleSections";

export const metadata: Metadata = {
  title: "Dashboard y Reportes Deportivos | Zaltyko",
  description: "Visualiza métricas clave de tu academia de gimnasia. Dashboard con KPIs, reportes de asistencia, análisis financiero y exportación a Excel.",
  keywords: [
    "reportes deportivos",
    "métricas gimnasia",
    "analytics clubes",
    "dashboard academia deportiva",
    "KPIs gimnasio",
    "análisis rendimiento club",
  ],
  openGraph: {
    title: "Dashboard y Reportes Deportivos | Zaltyko",
    description: "Visualiza métricas clave de tu academia de gimnasia. Dashboard con KPIs, reportes y análisis financiero.",
    type: "website",
  },
};

const MODULE_COLOR = "from-fuchsia-500 to-purple-600";

const problemContent = `Tomar decisiones estratégicas sobre tu academia sin datos confiables es como navegar sin brújula. La información está dispersa entre hojas de asistencia, registros de pago y anotaciones de entrenadores. Cuando necesitas saber cuántos atletas has perdido este trimestre, cuál es tu tasa real de asistencia o qué grupos están más saturados, debes invertir horas compilando datos manualmente.

Esta falta de visibilidad afecta tu capacidad de planificar. No sabes con certeza si deberías abrir un nuevo grupo, contratar otro entrenador o ajustar horarios poco demandados. Las decisiones se toman por intuición cuando deberían basarse en evidencia. Los errores de planificación cuestan dinero: grupos vacíos, entrenadores infrautilizados o atletas en lista de espera por falta de oferta.

Cuando necesitas presentar información a socios, federaciones o para solicitar subvenciones, compilar reportes es un proceso tedioso y propenso a errores. La información desactualizada o incompleta proyecta una imagen poco profesional de tu gestión.`;

const solutionContent = `El dashboard de Zaltyko centraliza todas las métricas importantes de tu academia en un panel visual accesible desde cualquier dispositivo. Nada más entrar ves los indicadores clave: total de atletas activos, asistencia del mes, ingresos recaudados, morosidad pendiente y tendencias respecto al período anterior. Información actualizada en tiempo real sin compilar nada manualmente.

Profundiza en los datos que necesites con reportes especializados. Analiza asistencia por grupo, entrenador o período. Revisa la evolución de inscripciones y bajas mes a mes. Compara rendimiento financiero entre temporadas. Identifica qué horarios tienen mayor demanda y cuáles están infrautilizados para optimizar tu oferta.

Genera reportes profesionales con un clic. Exporta a Excel para trabajo adicional o a PDF para presentaciones. Incluye el período deseado, los indicadores relevantes y comparte con socios, contables o entidades que lo requieran. Datos precisos que respaldan tu gestión profesional.`;

const solutionFeatures = [
  "Dashboard con KPIs actualizados en tiempo real",
  "Reportes de asistencia por grupo, entrenador y período",
  "Análisis financiero con ingresos, proyecciones y morosidad",
  "Evolución de inscripciones y bajas con tendencias",
  "Comparativas entre períodos y temporadas",
  "Exportación a Excel y PDF para uso externo",
];

const benefits = [
  {
    icon: Target,
    title: "Decisiones basadas en datos",
    description: "Deja de adivinar y actúa con información real sobre tu academia.",
  },
  {
    icon: Clock,
    title: "Reportes en segundos",
    description: "Genera informes profesionales con un clic en lugar de horas compilando.",
  },
  {
    icon: TrendingUp,
    title: "Identifica tendencias",
    description: "Detecta patrones de crecimiento, abandono o estacionalidad a tiempo.",
  },
  {
    icon: BarChart3,
    title: "Gestión profesional",
    description: "Presenta datos precisos a socios, federaciones o entidades financiadoras.",
  },
];

const useCases = [
  {
    role: "Entrenadores",
    icon: GraduationCap,
    title: "Seguimiento de tus grupos",
    description: "Consulta métricas de asistencia de tus atletas, identifica quiénes faltan con frecuencia y ajusta la planificación de entrenamientos según la asistencia real de cada sesión.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Reportes para contabilidad",
    description: "Genera reportes financieros mensuales para tu contable o asesoría. Desglose de ingresos por concepto, estado de morosidad y proyecciones de cobro en formato exportable.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Visión estratégica del negocio",
    description: "Analiza la salud de tu academia con indicadores clave. Compara rendimiento entre temporadas, identifica oportunidades de crecimiento y toma decisiones de inversión con datos que respalden tu estrategia.",
  },
];

export default function DashboardReportesPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Zaltyko - Dashboard y Reportes",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Dashboard y reportes para academias de gimnasia. Métricas, KPIs y análisis financiero en tiempo real.",
            featureList: solutionFeatures,
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
              description: "Prueba gratuita disponible",
            },
          }),
        }}
      />

      <ModuleHero
        icon={BarChart3}
        title="Dashboard y Reportes"
        subtitle="Toma decisiones informadas con datos reales de tu academia. Métricas de asistencia, análisis financiero y reportes exportables en un panel visual."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="Gestionar sin visibilidad de datos es volar a ciegas"
        content={problemContent}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Todas las métricas de tu academia en un panel"
        content={solutionContent}
        features={solutionFeatures}
        color={MODULE_COLOR}
      />

      <BenefitsSection benefits={benefits} color={MODULE_COLOR} />

      <UseCasesSection useCases={useCases} color={MODULE_COLOR} />

      <ModuleCta />
    </>
  );
}

