import { CompetitorCreateForm } from "@/components/competencia/CompetitorCreateForm";
import {
  PageIntro,
  SubNav,
  UnavailableNotice,
} from "@/components/competencia/ui";
import { isCompetitiveIntelligenceAvailable } from "@/lib/competencia/storage";

export const dynamic = "force-dynamic";

export default async function NuevoCompetidorPage() {
  const available = await isCompetitiveIntelligenceAvailable();
  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Inteligencia competitiva" title="Añadir empresa">
        Empieza con el nombre, la web y el tipo. Las fuentes, los precios y el
        análisis se completan después en la ficha.
      </PageIntro>
      <SubNav active="resumen" />
      {available ? <CompetitorCreateForm /> : <UnavailableNotice />}
    </div>
  );
}
