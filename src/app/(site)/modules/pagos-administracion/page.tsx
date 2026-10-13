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
  title: "Cuotas y Pagos para Gimnasia",
  description: "Gestiona cuotas, registra pagos recibidos y consulta los pagos pendientes de tu academia de gimnasia.",
  keywords: [
    "cobros gimnasia",
    "cuotas gimnasia",
    "recibos internos academia",
    "pagos academia gimnasia",
    "software cobros gimnasia",
    "gestión financiera clubes",
  ],
  openGraph: {
    title: "Cuotas y Pagos para Gimnasia",
    description: "Gestiona cuotas, registra pagos recibidos y consulta los pagos pendientes de tu academia de gimnasia.",
    type: "website",
  },
};

const MODULE_COLOR = "from-zaltyko-indigo to-zaltyko-teal";

const problemBullets = [
  "Horas administrativas que no escalan: cada nueva familia suma más recibos, más seguimiento y más recordatorios manuales.",
  "Cero visibilidad del flujo de caja: no sabes cuánto entrará este mes ni cuánto tienes acumulado en mora.",
  "Perseguir morosos daña la relación con las familias y resta tiempo a lo que de verdad importa: enseñar.",
];

const solutionContent = `Organiza las cuotas y cargos de tu academia por periodo, grupo o servicio. Desde el panel puedes revisar qué está pendiente, registrar un pago que ya has recibido y consultar el historial disponible.

La academia mantiene el control de cada paso: puede registrar el pago recibido o iniciar manualmente un cobro cuando corresponda. También puede enviar un recordatorio desde la ficha del cargo; no se realizan cobros automáticos.

El panel reúne los importes y estados disponibles para que puedas revisar los cobros pendientes con tu equipo y decidir qué hacer después.`;

const solutionFeatures = [
  "Cuotas y cargos por periodo o grupo",
  "Registro manual de pagos recibidos",
  "Seguimiento de importes pendientes",
  "Recordatorios que la academia envía desde el panel",
  "Historial y recibos disponibles en el módulo",
  "Resumen de cobros para apoyar la gestión diaria",
];

const benefits = [
  {
    icon: Clock,
    title: "Todo más fácil de revisar",
    description: "Consulta las cuotas y los pagos pendientes sin buscar en varias hojas.",
  },
  {
    icon: TrendingUp,
    title: "Seguimiento de pagos",
    description: "Revisa qué cargos siguen pendientes y decide cuándo contactar a la familia.",
  },
  {
    icon: Shield,
    title: "Control de cobros",
    description: "Sabe al instante cuánto entra, cuánto se debe y cuánto está en mora.",
  },
  {
    icon: CreditCard,
    title: "Estado de pago visible",
    description: "Consulta los importes y estados disponibles antes de actuar.",
  },
];

const useCases = [
  {
    role: "Familias",
    icon: Heart,
    title: "Importes claros",
    description: "Pueden consultar el estado de los cargos y los recibos disponibles en su portal.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestión financiera sin estrés",
    description: "Consulta el estado de cualquier familia en segundos, aplica descuentos especiales cuando sea necesario y genera reportes mensuales para revisar con tu equipo. Todo desde un panel centralizado sin hojas de cálculo.",
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
            description: "Módulo para gestionar cuotas, registrar pagos recibidos y consultar importes pendientes.",
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
        title="Controla cuotas y pagos desde un único panel"
        subtitle="Consulta los importes pendientes, registra los pagos recibidos e inicia manualmente un cobro cuando corresponda."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El dolor de cabeza de cobrar cuotas manualmente"
        bullets={problemBullets}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Una gestión de cobros más clara"
        content={solutionContent}
        features={solutionFeatures}
        color={MODULE_COLOR}
      />

      <BenefitsSection benefits={benefits} color={MODULE_COLOR} />

      <UseCasesSection useCases={useCases} color={MODULE_COLOR} />

      <ModuleCta
        title="Empieza a ordenar tus cuotas y pagos"
        subtitle="Crea tu cuenta gratis, configura tu academia y consulta tus cobros desde un único panel."
      />
    </>
  );
}
