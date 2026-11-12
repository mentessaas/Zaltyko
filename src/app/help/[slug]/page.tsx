import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PublicPageHeader,
  PublicPageShell,
  publicContainerClass,
} from "@/app/(site)/mat/PublicPage";
import { buttonVariants } from "@/components/ui/button";
import { getHelpArticle, helpArticles } from "@/lib/help/articles";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { cn } from "@/lib/utils";

interface HelpArticlePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return helpArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: HelpArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) return { title: "Guía no encontrada" };

  return {
    title: `${article.title} | Ayuda Zaltyko`,
    description: article.summary,
    alternates: {
      canonical: `${getPublicSiteUrl()}/help/${slug}`,
    },
  };
}

export default async function HelpArticlePage({ params }: HelpArticlePageProps) {
  const { slug } = await params;
  const article = getHelpArticle(slug);

  if (!article) {
    notFound();
  }

  return (
    <PublicPageShell>
      <PublicPageHeader
        titleId="help-article-title"
        size="title"
        back={{ href: "/help", label: "Volver al centro de ayuda" }}
        label={article.category}
        title={article.title}
        lede={article.summary}
      />

      <article aria-labelledby="help-article-title" className="chalk-field border-b border-chalk-line">
        <div className={cn(publicContainerClass, "py-16 lg:py-20")}>
          <div className="max-w-3xl">
            {/* Pasos en panel reglado: regla de 3 px y filas separadas por
                línea de magnesio, sin tarjetas ni iconos de tick. */}
            <section
              aria-labelledby="help-steps-title"
              className="rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white"
            >
              <h2
                id="help-steps-title"
                className="font-display px-5 pb-4 pt-5 text-2xl font-black uppercase leading-none text-mat-night"
              >
                Pasos recomendados
              </h2>
              <ol>
                {article.steps.map((step, index) => (
                  <li key={step} className="border-t border-chalk-line px-5 py-4 leading-relaxed text-ramp-600">
                    <strong className="text-mat-night">Paso {index + 1}:</strong> {step}
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="help-direct-title" className="mt-12 border-t-[3px] border-mat-night pt-6">
              <h2
                id="help-direct-title"
                className="font-display text-2xl font-black uppercase leading-none text-mat-night"
              >
                ¿Necesitas ayuda directa?
              </h2>
              <p className="mt-3 text-ramp-600">
                Escríbenos con el contexto de tu academia y te indicaremos el siguiente paso.
              </p>
              <Link href="/contact?type=support" className={cn(buttonVariants(), "mt-5")}>
                Contactar soporte
              </Link>
            </section>
          </div>
        </div>
      </article>
    </PublicPageShell>
  );
}
