import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { getHelpArticle, helpArticles } from "@/lib/help/articles";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

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
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-32 pb-16">
        <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link href="/help" className="inline-flex items-center text-sm font-medium text-zaltyko-primary hover:underline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al centro de ayuda
          </Link>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-zaltyko-primary">
            {article.category}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-zaltyko-text-main sm:text-4xl">
            {article.title}
          </h1>
          <p className="mt-4 text-lg text-zaltyko-text-secondary">{article.summary}</p>

          <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-zaltyko-text-main">Pasos recomendados</h2>
            <ol className="mt-6 space-y-4">
              {article.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-zaltyko-primary" />
                  <span className="text-zaltyko-text-secondary">
                    <strong className="text-zaltyko-text-main">Paso {index + 1}:</strong> {step}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-10 rounded-2xl bg-zaltyko-primary/5 p-6">
            <h2 className="text-lg font-semibold text-zaltyko-text-main">¿Necesitas ayuda directa?</h2>
            <p className="mt-2 text-sm text-zaltyko-text-secondary">
              Escríbenos con el contexto de tu academia y te indicaremos el siguiente paso.
            </p>
            <Link
              href="/contact?type=support"
              className="mt-4 inline-flex rounded-full bg-zaltyko-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Contactar soporte
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
