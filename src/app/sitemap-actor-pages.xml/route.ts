import { db } from "@/db";
import { actorPages } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { entityTypePrefix } from "@/lib/actor-pages/seo";

/**
 * GET /sitemap-actor-pages.xml
 * Devuelve solo páginas públicas publicadas y no bloqueadas (atletas sin
 * consentimiento revocado).
 *
 * Sprint 4: primera versión. Sprint 4.5 añadirá <lastmod> por cambio real,
 * <changefreq>, <priority> por tipo.
 */
export async function GET() {
  const rows = await db
    .select({
      entityType: actorPages.entityType,
      publicSlug: actorPages.publicSlug,
      updatedAt: actorPages.updatedAt,
    })
    .from(actorPages)
    .where(
      and(
        eq(actorPages.publicVisible, true),
        sql`${actorPages.publishedAt} IS NOT NULL`,
        sql`${actorPages.blockedAt} IS NULL`,
        sql`(${actorPages.entityType} <> 'athlete' OR ${actorPages.consentStatus} <> 'revoked')`
      )
    );

  const baseUrl = "https://zaltyko.com";
  const urls = rows.map((r) => ({
    loc: `${baseUrl}/${entityTypePrefix(r.entityType as never)}/${r.publicSlug}`,
    lastmod: r.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=600",
    },
  });
}
