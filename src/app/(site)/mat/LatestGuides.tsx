import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { listBlogPosts } from "@/lib/seo/blog";

const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Últimas guías del blog como un índice reglado, no como tarjetas. */
export default async function LatestGuides() {
  const posts = (await listBlogPosts("es")).slice(0, 3);
  if (posts.length === 0) return null;

  return (
    <section aria-labelledby="guides-title" className="chalk-field border-t border-chalk-line">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-14 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 id="guides-title" className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] text-mat-night">
            Guías para dirigir el club
          </h2>
          <Link href="/blog" className="inline-flex min-h-11 items-center gap-2 text-base font-bold text-mat underline decoration-2 underline-offset-[6px]">
            Todas las guías
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
        <ol className="mt-10 border-t-[3px] border-mat-night">
          {posts.map((p) => (
            <li key={p.slug} className="grid gap-2 border-b border-chalk-line py-6 sm:grid-cols-[9rem_minmax(0,1fr)_8rem] sm:gap-8">
              <p className="floor-label pt-1 text-mat">{p.category}</p>
              <div>
                <h3 className="font-display text-2xl font-extrabold leading-tight text-mat-night">
                  <Link href={`/blog/${p.slug}`} className="hover:text-mat hover:underline">
                    {p.title}
                  </Link>
                </h3>
                <p className="mt-2 line-clamp-2 max-w-3xl text-ramp-600">{p.excerpt}</p>
              </div>
              <p className="tabular text-sm text-ramp-500 sm:pt-1.5 sm:text-right">
                <time dateTime={p.datePublished}>{dateFmt.format(new Date(p.datePublished))}</time>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
