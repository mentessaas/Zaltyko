import { Metadata } from "next";
import { CreditCard, Clock, TrendingUp, Shield, Users, Briefcase, GraduationCap, Heart } from "lucide-react";
import ModuleHero from "../components/ModuleHero";
import {
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  UseCasesSection,
  ModuleCta,
} from "../components/ModuleSections";

export const metadata: Metadata = {
  title: "Cobros y Cuotas para Gimnasia",
  description: "Ordena cobros, cuotas y recibos internos de tu academia de gimnasia. Recordatorios, pagos pendientes y control de morosidad.",
  keywords: [
    "cobros automáticos gimnasia",
    "cuotas gimnasia",
    "recibos internos academia",
    "pagos academia gimnasia",
    "software cobros gimnasia",
    "gestión financiera clubes",
  ],
  openGraph: {
    title: "Cobros y Cuotas para Gimnasia",
    description: "Ordena cobros, cuotas y recibos internos de tu academia de gimnasia con recordatorios y control de pagos pendientes.",
    type: "website",
  },
};

const MODULE_COLOR = "from-zaltyko-indigo to-zaltyko-teal";

const problemBullets = [
  "Horas administrativas que no escalan: cada nueva familia suma más recibos, más seguimiento y más recordatorios manuales.",
  "Cero visibilidad del flujo de caja: no sabes cuánto entrará este mes ni cuánto tienes acumulado en mora.",
  "Perseguir morosos daña la relación con las familias y resta tiempo a lo que de verdad importa: enseñar.",
];

const solutionContent = `El módulo de pagos y administración de Zaltyko ordena el ciclo de cobro de tu academia. Configura las cuotas por modalidad, nivel o tipo de servicio, y el sistema genera los cargos mensuales para cada familia según su inscripción.

Define reglas de descuento flexibles: porcentajes por familia numerosa, becas parciales o totales, promociones por pago anticipado. El sistema aplica estos descuentos automáticamente sin intervención manual. Cuando un pago no se procesa correctamente, se envían recordatorios automáticos escalonados antes de marcarlo como moroso.

El panel financiero te da visibilidad completa sobre la salud económica de tu academia. Consulta ingresos del mes, proyecciones basadas en inscripciones activas, desglose por concepto y estado de morosidad. Genera reportes para tu contable con un clic y mantén siempre el control de tu flujo de caja.`;

const solutionFeatures = [
  "Cobros recurrentes y recordatorios",
  "Descuentos por familia numerosa y becas configurables",
  "Recordatorios de pago escalonados y automáticos",
  "Panel financiero con ingresos, proyecciones y morosidad",
  "Recibos internos y justificantes de pago para familias",
  "Reportes exportables para contabilidad externa",
];

const benefits = [
  {
    icon: Clock,
    title: "Menos trabajo manual",
    description: "Genera cargos mensuales para cada familia sin tocar una hoja de cálculo.",
  },
  {
    icon: TrendingUp,
    title: "Seguimiento de impagos",
    description: "Recordatorios automáticos escalonados cuando una familia no paga a tiempo.",
  },
  {
    icon: Shield,
    title: "Control de cobros",
    description: "Sabe al instante cuánto entra, cuánto se debe y cuánto está en mora.",
  },
  {
    icon: CreditCard,
    title: "Flexibilidad para familias",
    description: "Becas, descuentos por hermano y pagos fraccionados, configurables por academia.",
  },
];

const useCases = [
  {
    role: "Familias",
    icon: Heart,
    title: "Pagos sin sorpresas",
    description: "Reciben su cargo a tiempo, ven sus recibos y entienden cada importe. Si necesitan fraccionar o solicitar una beca, está previsto y se gestiona desde la academia.",
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
            description: "Módulo de cobros y cuotas para academias de gimnasia. Automatiza cuotas, pagos online y control financiero.",
            featureList: solutionFeatures,
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "EUR",
              description: "Plan Free: prueba 7 días de Starter sin tarjeta",
            },
          }),
        }}
      />

      <ModuleHero
        icon={CreditCard}
        title="Cobra las cuotas del mes sin perseguir a nadie"
        subtitle="Cada familia recibe su cargo el día 1, los recordatorios salen solos y el panel te dice al instante quién está al día. Sin Excel, sin WhatsApp y sin cazar morosos."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El dolor de cabeza de cobrar cuotas manualmente"
        bullets={problemBullets}
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

      <ModuleCta
        title="Configura tus cuotas este mes"
        subtitle="Crea tu academia gratis, importa a las familias y empieza a cobrar desde un único panel."
      />
    </>
  );
}
