import { FlowsWorkspace } from "@/components/competencia/FlowsWorkspace";
import {
  PageIntro,
  SubNav,
  UnavailableNotice,
} from "@/components/competencia/ui";
import {
  isCompetitiveIntelligenceAvailable,
  listFlows,
} from "@/lib/competencia/storage";

export const dynamic = "force-dynamic";

export default async function FlujosPage() {
  if (!(await isCompetitiveIntelligenceAvailable())) {
    return (
      <div className="space-y-6">
        <PageIntro
          eyebrow="Inteligencia competitiva"
          title="Flujos y Zaltyko"
        />
        <UnavailableNotice />
      </div>
    );
  }
  const flows = await listFlows();
  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Inteligencia competitiva"
        title="Flujos de producto y estado de Zaltyko"
      >
        Distingue entre tener un modelo de datos, tener una pantalla y poder
        completar la tarea de principio a fin. Actualiza el estado cuando cambie
        el código o se compruebe en producción.
      </PageIntro>
      <SubNav active="flujos" />
      <FlowsWorkspace flows={flows} />
    </div>
  );
}
