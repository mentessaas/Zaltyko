import { Metadata } from "next";
import { CreditCard, Clock, TrendingUp, Shield, Users, Briefcase, Heart } from "lucide-react";
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
  description: "Organiza las cuotas de tu academia de gimnasia, registra pagos manualmente y consulta los importes pendientes.",
  keywords: [
    "cuotas gimnasia",
    "recibos internos academia",
    "pagos academia gimnasia",
    "software cobros gimnasia",
    "gestión financiera clubes",
  ],
  openGraph: {
    title: "Cobros y Cuotas para Gimnasia",
    description: "Organiza cuotas, registra pagos recibidos y consulta los pendientes de tu academia de gimnasia.",
    type: "website",
  },
};

const MODULE_COLOR = "from-zaltyko-indigo to-zaltyko-teal";

const problemBullets = [
  "Los pagos se anotan en distintos sitios y cuesta saber qué cuota ha abonado cada familia.",
  "El equipo necesita consultar rápido qué importes siguen pendientes o vencidos.",
  "Reunir recibos y movimientos a mano resta tiempo a la dirección de la academia.",
];

const solutionContent = `En el lanzamiento, Zaltyko permite consultar cuotas pendientes y registrar manualmente los pagos que la academia ya ha recibido. Puedes anotar pagos parciales o completos y revisar el historial por familia, con el estado de cada importe en el mismo lugar.

El registro manual está disponible en todos los planes. Zaltyko no inicia cargos ni cobra automáticamente a las familias en este lanzamiento.`;

const solutionFeatures = [
  "Consulta de cuotas pendientes y vencidas",
  "Registro manual de pagos recibidos",
  "Pagos parciales o completos por cuota",
  "Historial de pagos por familia",
  "Trazabilidad del registro y método de pago",
  "Vista de ingresos registrados y pendientes",
];

const benefits = [
  {
    icon: Clock,
    title: "Menos búsquedas",
    description: "Consulta las cuotas y los pagos registrados desde el mismo módulo.",
  },
  {
    icon: TrendingUp,
    title: "Pendientes visibles",
    description: "Localiza los importes pendientes o vencidos para darles seguimiento.",
  },
  {
    icon: Shield,
    title: "Registro trazable",
    description: "Consulta cuándo y cómo se registró cada pago recibido.",
  },
  {
    icon: CreditCard,
    title: "Pagos bajo control",
    description: "Anota pagos parciales o completos y revisa el saldo pendiente.",
  },
];

const useCases = [
  {
    role: "Familias",
    icon: Heart,
    title: "Cuotas claras",
    description: "La academia mantiene organizado el estado de cada cuota y los pagos que ha recibido.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Registro en un solo sitio",
    description: "Anota pagos recibidos, consulta saldos y revisa el historial de cada familia desde el módulo de cobros.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Visibilidad de cuotas",
    description: "Revisa los pagos registrados y los importes pendientes antes de decidir el siguiente paso.",
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
            description: "Módulo para organizar cuotas, registrar pagos recibidos y consultar importes pendientes en academias de gimnasia.",
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
        title="Controla las cuotas de tu academia"
        subtitle="Registra manualmente los pagos recibidos y consulta qué importes están pendientes. En este lanzamiento no se realizan cargos automáticos a las familias."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El dolor de cabeza de cobrar cuotas manualmente"
        bullets={problemBullets}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Cuotas y pagos en un solo lugar"
        content={solutionContent}
        features={solutionFeatures}
        color={MODULE_COLOR}
      />

      <BenefitsSection benefits={benefits} color={MODULE_COLOR} />

      <UseCasesSection useCases={useCases} color={MODULE_COLOR} />

      <ModuleCta
        title="Organiza los pagos de tu academia"
        subtitle="Crea tu cuenta gratis y empieza por registrar las cuotas y los pagos recibidos."
      />
    </>
  );
}
