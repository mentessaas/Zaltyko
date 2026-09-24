import type { Metadata } from "next";
import { generateMetadataForActor, default as PublicPageRenderer } from "@/components/actor-page-editor/PublicPageRenderer";
import { getPublicPageBySlug } from "@/lib/actor-pages/service";
import { getLocaleFromRequest } from "@/i18n/server";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getLocaleFromRequest();
  const page = await getPublicPageBySlug(params.slug);
  if (!page || page.entityType !== "supplier") return { title: "Proveedor no encontrado" };
  return generateMetadataForActor("supplier", page, locale);
}

export default async function PublicSupplierPage({ params }: Props) {
  const locale = await getLocaleFromRequest();
  return <PublicPageRenderer entityType="supplier" slug={params.slug} locale={locale} />;
}
