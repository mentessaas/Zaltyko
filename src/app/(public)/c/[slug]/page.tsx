import type { Metadata } from "next";
import { generateMetadataForActor, default as PublicPageRenderer } from "@/components/actor-page-editor/PublicPageRenderer";
import { getPublicPageBySlug } from "@/lib/actor-pages/service";
import { getLocaleFromRequest } from "@/i18n/server";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getLocaleFromRequest();
  const page = await getPublicPageBySlug(params.slug);
  if (!page || page.entityType !== "coach") return { title: "Entrenador no encontrado" };
  return generateMetadataForActor("coach", page, locale);
}

export default async function PublicCoachPage({ params }: Props) {
  const locale = await getLocaleFromRequest();
  return <PublicPageRenderer entityType="coach" slug={params.slug} locale={locale} />;
}
