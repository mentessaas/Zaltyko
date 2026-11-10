import { OpportunitiesWorkspace } from "@/components/competencia/OpportunitiesWorkspace";
import {
  PageIntro,
  SubNav,
  UnavailableNotice,
} from "@/components/competencia/ui";
import {
  isCompetitiveIntelligenceAvailable,
  listCompetitorOptions,
  listOpportunities,
} from "@/lib/competencia/storage";

export const dynamic = "force-dynamic";

export default async function OportunidadesPage() {
  if (!(await isCompetitiveIntelligenceAvailable())) {
    return (
      <div className="space-y-6">
        <PageIntro eyebrow="Inteligencia competitiva" title="Oportunidades" />
        <UnavailableNotice />
      </div>
    );
  }
  const [opportunities, options] = await Promise.all([
    listOpportunities(),
    listCompetitorOptions(true),
  ]);
  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Inteligencia competitiva"
        title="Oportunidades para Zaltyko"
      >
        Igualar lo que bloquea una compra, superar lo conocido, diferenciar
        donde el mercado falla y posponer lo que tiene poca evidencia. Cada
        oportunidad debe decir quién paga y cómo validarla antes de construir.
      </PageIntro>
      <SubNav active="oportunidades" />
      <OpportunitiesWorkspace
        opportunities={opportunities}
        options={options.map(({ id, name, slug }) => ({ id, name, slug }))}
      />
    </div>
  );
}
