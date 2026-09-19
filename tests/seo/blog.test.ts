import { describe, expect, it } from "vitest";
import {
  getBlogSlugs,
  isBlogSlug,
  listBlogPosts,
  loadBlogPost,
} from "@/lib/seo/blog";

describe("blog", () => {
  it("getBlogSlugs devuelve los 6 posts registrados", () => {
    const slugs = getBlogSlugs();
    expect(slugs.length).toBe(6);
  });

  it("isBlogSlug valida slugs conocidos y desconocidos", () => {
    expect(isBlogSlug("migrar-excel-software-academia-gimnasia")).toBe(true);
    expect(isBlogSlug("no-existe")).toBe(false);
  });

  it("loadBlogPost devuelve contenido válido con bloques de párrafo", async () => {
    const post = await loadBlogPost("es", "migrar-excel-software-academia-gimnasia");
    expect(post).not.toBeNull();
    expect(post!.title).toContain("Excel");
    expect(post!.content.length).toBeGreaterThan(5);
    expect(post!.content.some((b) => b.startsWith("## "))).toBe(true);
  });

  it("listBlogPosts ordena por fecha descendente", async () => {
    const list = await listBlogPosts("es");
    expect(list.length).toBe(6);
    for (let i = 0; i < list.length - 1; i++) {
      const curr = new Date(list[i].datePublished).getTime();
      const next = new Date(list[i + 1].datePublished).getTime();
      expect(curr).toBeGreaterThanOrEqual(next);
    }
  });

  it("loadBlogPost devuelve null para locales no soportados", async () => {
    const out = await loadBlogPost("en", "migrar-excel-software-academia-gimnasia");
    expect(out).toBeNull();
  });
});
