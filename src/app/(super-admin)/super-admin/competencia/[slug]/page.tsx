import Link from "next/link";
import { notFound } from "next/navigation";

import { CompetitorProfileWorkspace } from "@/components/competencia/CompetitorProfileWorkspace";
import {
  PageIntro,
  SubNav,
  UnavailableNotice,
  ciButtonGhost,
} from "@/components/competencia/ui";
import {
  getCompetitorProfile,
  isCompetitiveIntelligenceAvailable,
} from "@/lib/competencia/storage";

export const dynamic = "force-dynamic";

export default async function CompetitorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isCompetitiveIntelligenceAvailable())) {
    return (
      <div className="space-y-6">
        <PageIntro
          eyebrow="Inteligencia competitiva"
          title="Ficha de competidor"
        />
        <UnavailableNotice />
      </div>
    );
  }
  const { slug } = await params;
  const query = await searchParams;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();
  const profile = await getCompetitorProfile(slug);
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Ficha de competidor"
        title={profile.competitor.name}
        actions={
          <Link
            href={`/super-admin/competencia/comparar?ids=${profile.competitor.id}`}
            className={ciButtonGhost}
          >
            Comparar con otros
          </Link>
        }
      >
        {query.creado
          ? "Ficha creada. Añade las fuentes y completa el análisis por secciones."
          : null}
      </PageIntro>
      <SubNav active="resumen" />
      <CompetitorProfileWorkspace {...profile} />
    </div>
  );
}
