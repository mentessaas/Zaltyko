import { Metadata } from "next";
import { CreditCard, Clock, TrendingUp, Shield, Users, Briefcase, GraduationCap } from "lucide-react";
import ModuleHero from "../components/ModuleHero";
import {
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  UseCasesSection,
  ModuleCta,
} from "../components/ModuleSections";

export const metadata: Metadata = {
  title: "Cobros y Facturación para Gimnasia | Zaltyko",
  description: "Automatiza cobros, cuotas y facturación de tu academia de gimnasia. Pagos online con Stripe, recordatorios automáticos y control de morosidad.",
  keywords: [
    "cobros automáticos gimnasia",
    "cuotas deportivas",
    "facturación automática",
    "pagos academia gimnasia",
    "software cobros deportivos",
    "gestión financiera clubes",
  ],
  openGraph: {
    title: "Cobros y Facturación para Gimnasia | Zaltyko",
    description: "Automatiza cobros, cuotas y facturación de tu academia de gimnasia. Pagos online con Stripe y recordatorios automáticos.",
    type: "website",
  },
};

const MODULE_COLOR = "from-amber-500 to-orange-600";

const problemContent = `La gestión financiera es el talón de Aquiles de muchas academias de gimnasia. Cobrar cuotas mensuales a decenas de familias consume horas de trabajo administrativo: generar recibos, hacer seguimiento de pagos pendientes, aplicar descuentos por hermanos, gestionar becas parciales y perseguir morosos. Todo esto mientras intentas mantener una relación cordial con las familias.

Los pagos en efectivo generan problemas de control y seguridad. Las transferencias bancarias requieren verificación manual. Cada familia tiene su situación particular: unos pagan puntualmente, otros necesitan recordatorios, algunos solicitan fraccionamientos. Sin un sistema centralizado, es fácil perder el rastro de quién debe qué.

La falta de visibilidad financiera impide tomar decisiones informadas. No sabes con certeza cuánto ingresará este mes, cuánto tienes en morosidad acumulada o qué familias están en riesgo de abandonar por problemas de pago. Esta incertidumbre financiera limita tu capacidad de invertir en el crecimiento de la academia.`;

const solutionContent = `El módulo de pagos y administración de Zaltyko automatiza completamente el ciclo de cobro de tu academia. Configura las cuotas por modalidad, nivel o tipo de servicio, y el sistema genera automáticamente los cargos mensuales para cada familia según su inscripción. Los cobros recurrentes se procesan a través de Stripe, una de las plataformas de pago más seguras del mundo.

Define reglas de descuento flexibles: porcentajes por familia numerosa, becas parciales o totales, promociones por pago anticipado. El sistema aplica estos descuentos automáticamente sin intervención manual. Cuando un pago no se procesa correctamente, se envían recordatorios automáticos escalonados antes de marcarlo como moroso.

El panel financiero te da visibilidad completa sobre la salud económica de tu academia. Consulta ingresos del mes, proyecciones basadas en inscripciones activas, desglose por concepto y estado de morosidad. Genera reportes para tu contable con un clic y mantén siempre el control de tu flujo de caja.`;

const solutionFeatures = [
  "Cobros recurrentes automatizados con Stripe",
  "Descuentos por familia numerosa y becas configurables",
  "Recordatorios de pago escalonados y automáticos",
  "Panel financiero con ingresos, proyecciones y morosidad",
  "Facturación electrónica compatible con requisitos fiscales",
  "Reportes exportables para contabilidad externa",
];

const benefits = [
  {
    icon: Clock,
    title: "Ahorra 10+ horas al mes",
    description: "Elimina la generación manual de recibos y el seguimiento de pagos pendientes.",
  },
  {
    icon: TrendingUp,
    title: "Reduce morosidad un 40%",
    description: "Los recordatorios automáticos y pagos online mejoran la tasa de cobro.",
  },
  {
    icon: Shield,
    title: "Pagos 100% seguros",
    description: "Stripe cumple con los estándares PCI más estrictos del sector financiero.",
  },
  {
    icon: CreditCard,
    title: "Flexibilidad para familias",
    description: "Ofrece múltiples métodos de pago y facilidades sin complicarte.",
  },
];

const useCases = [
  {
    role: "Entrenadores",
    icon: GraduationCap,
    title: "Enfócate en entrenar",
    description: "Olvídate de cobrar en efectivo o verificar si una familia está al día. El sistema te indica automáticamente el estado de cada atleta para que puedas concentrarte en lo que mejor sabes hacer: formar gimnastas.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestión financiera sin estrés",
    description: "Consulta el estado de cualquier familia en segundos, aplica descuentos especiales cuando sea necesario y genera reportes mensuales para contabilidad. Todo desde un panel centralizado sin hojas de cálculo.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Control total de tu negocio",
    description: "Visualiza proyecciones de ingresos, identifica tendencias de morosidad y toma decisiones basadas en datos reales. Sabe exactamente cuánto dinero tienes por cobrar y cuándo entrará en tu cuenta.",
  },
];

export default function PagosAdministracionPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Zaltyko - Pagos y Administración",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Módulo de cobros y facturación para academias de gimnasia. Automatiza cuotas, pagos online y control financiero.",
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
        icon={CreditCard}
        title="Pagos y Administración"
        subtitle="Automatiza la facturación y cobros de tu academia con pagos online seguros. Control total de cuotas, descuentos, morosidad y proyecciones financieras."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El dolor de cabeza de cobrar cuotas manualmente"
        content={problemContent}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Automatización financiera completa"
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

