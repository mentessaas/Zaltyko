import type { Locale } from "@/i18n";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: string;
  excerpt: string;
  category: string;
  keywords: string[];
  relatedRoutes: string[];
  relatedPosts?: string[];
  relatedComparativas?: string[];
  content: string[];
}

export interface BlogSummary {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: string;
  excerpt: string;
  category: string;
}

const BLOG_SLUGS = [
  "migrar-excel-software-academia-gimnasia",
  "cuanto-cuesta-gestionar-academia-gimnasia",
  "errores-comunes-elegir-software-academia",
  "organizar-cobros-mensuales-academia-gimnasia",
  "ficha-federativa-rfeg-gestion",
  "elegir-gimnasia-artistica-femenina-masculina-academia",
] as const;

export type BlogSlug = (typeof BLOG_SLUGS)[number];

export function isBlogSlug(value: string): value is BlogSlug {
  return (BLOG_SLUGS as readonly string[]).includes(value);
}

export function getBlogSlugs(): string[] {
  return [...BLOG_SLUGS];
}

export async function loadBlogPost(
  locale: Locale,
  slug: string,
): Promise<BlogPost | null> {
  if (locale !== "es") return null;
  if (!isBlogSlug(slug)) return null;
  try {
    const mod = await import(`@/content/blog/${locale}/${slug}.json`);
    return mod.default as BlogPost;
  } catch {
    return null;
  }
}

export async function listBlogPosts(locale: Locale): Promise<BlogSummary[]> {
  const out: BlogSummary[] = [];
  for (const slug of BLOG_SLUGS) {
    const post = await loadBlogPost(locale, slug);
    if (!post) continue;
    out.push({
      slug: post.slug,
      title: post.title,
      description: post.description,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      author: post.author,
      excerpt: post.excerpt,
      category: post.category,
    });
  }
  // Más recientes primero.
  out.sort((a, b) => (a.datePublished < b.datePublished ? 1 : -1));
  return out;
}
