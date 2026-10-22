import { loadBlogPost, type BlogPost } from "@/lib/seo/blog";
import { loadComparison, type ComparisonContent } from "@/lib/seo/comparativas";

/**
 * Carga y filtra slugs de blog posts. Slugs invalidos (typos, borrados)
 * se descartan con fail-closed: si pides 3 slugs y solo 2 existen,
 * devuelvo 2. Esto evita que el caller pinte anchors rotos.
 */
export async function loadBlogPostsSafe(
  slugs: readonly string[],
): Promise<BlogPost[]> {
  if (!slugs || slugs.length === 0) return [];
  const results = await Promise.all(
    slugs.map((slug) => loadBlogPost("es", slug)),
  );
  return results.filter((p): p is BlogPost => p !== null);
}

export async function loadComparisonsSafe(
  slugs: readonly string[],
): Promise<ComparisonContent[]> {
  if (!slugs || slugs.length === 0) return [];
  const results = await Promise.all(
    slugs.map((slug) => loadComparison("es", slug)),
  );
  return results.filter((p): p is ComparisonContent => p !== null);
}

/**
 * Resuelve enlaces cruzados para un blog post: lee relatedPosts +
 * relatedComparativas, descarta slugs que no resuelven, y devuelve los
 * objetos cargados listos para renderizar.
 */
export async function loadBlogCrossLinks(post: BlogPost): Promise<{
  posts: BlogPost[];
  comparisons: ComparisonContent[];
}> {
  const [posts, comparisons] = await Promise.all([
    loadBlogPostsSafe(post.relatedPosts ?? []),
    loadComparisonsSafe(post.relatedComparativas ?? []),
  ]);
  return { posts, comparisons };
}

/**
 * Resuelve enlaces cruzados para una comparativa: lee relatedPosts +
 * relatedComparativas, descarta slugs que no resuelven.
 */
export async function loadComparisonCrossLinks(
  content: ComparisonContent,
): Promise<{
  posts: BlogPost[];
  comparisons: ComparisonContent[];
}> {
  const [posts, comparisons] = await Promise.all([
    loadBlogPostsSafe(content.relatedPosts ?? []),
    loadComparisonsSafe(content.relatedComparativas ?? []),
  ]);
  return { posts, comparisons };
}
