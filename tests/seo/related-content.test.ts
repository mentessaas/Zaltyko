import { describe, expect, it } from "vitest";
import {
  loadBlogPostsSafe,
  loadComparisonsSafe,
  loadBlogCrossLinks,
  loadComparisonCrossLinks,
} from "@/lib/seo/related";

describe("related cross-links helpers", () => {
  describe("loadBlogPostsSafe", () => {
    it("devuelve [] para array vacio", async () => {
      expect(await loadBlogPostsSafe([])).toEqual([]);
    });

    it("carga un post existente", async () => {
      const [post] = await loadBlogPostsSafe([
        "migrar-excel-software-academia-gimnasia",
      ]);
      expect(post).not.toBeNull();
      expect(post!.title).toContain("Excel");
    });

    it("filtra slugs invalidos con fail-closed", async () => {
      const posts = await loadBlogPostsSafe([
        "migrar-excel-software-academia-gimnasia",
        "no-existe-este-slug",
        "cuanto-cuesta-gestionar-academia-gimnasia",
      ]);
      expect(posts.length).toBe(2);
      expect(posts[0].slug).toBe("migrar-excel-software-academia-gimnasia");
      expect(posts[1].slug).toBe("cuanto-cuesta-gestionar-academia-gimnasia");
    });

    it("devuelve [] cuando todos los slugs son invalidos", async () => {
      const posts = await loadBlogPostsSafe(["no-existe-1", "no-existe-2"]);
      expect(posts).toEqual([]);
    });
  });

  describe("loadComparisonsSafe", () => {
    it("carga comparativa existente", async () => {
      const [c] = await loadComparisonsSafe(["zaltyko-vs-excel"]);
      expect(c).not.toBeNull();
      expect(c!.competitor.name).toContain("Excel");
    });

    it("filtra slugs invalidos", async () => {
      const list = await loadComparisonsSafe([
        "zaltyko-vs-excel",
        "no-existe",
        "zaltyko-vs-glofox",
      ]);
      expect(list.length).toBe(2);
    });
  });

  describe("loadBlogCrossLinks", () => {
    it("carga relatedPosts y relatedComparativas del post", async () => {
      const [post] = await loadBlogPostsSafe([
        "errores-comunes-elegir-software-academia",
      ]);
      const links = await loadBlogCrossLinks(post!);
      // El post errores-comunes tiene 3 comparativas y 2 posts relacionados.
      expect(links.comparisons.length).toBe(3);
      expect(links.posts.length).toBe(2);
      // Ningun link apunta al propio post.
      expect(links.posts.every((p) => p.slug !== post!.slug)).toBe(true);
    });

    it("post sin relatedPosts devuelve {posts:[], comparisons:[]}", async () => {
      // Creamos un post sintético sin related fields
      const synthetic = {
        slug: "synthetic",
        title: "Test",
        description: "",
        datePublished: "2026-01-01",
        dateModified: "2026-01-01",
        author: "Test",
        excerpt: "",
        category: "Test",
        keywords: [],
        relatedRoutes: [],
        content: [],
      };
      const links = await loadBlogCrossLinks(synthetic);
      expect(links.posts).toEqual([]);
      expect(links.comparisons).toEqual([]);
    });
  });

  describe("loadComparisonCrossLinks", () => {
    it("carga relatedPosts de la comparativa", async () => {
      const [c] = await loadComparisonsSafe(["zaltyko-vs-excel"]);
      const links = await loadComparisonCrossLinks(c!);
      // zaltyko-vs-excel tiene 3 relatedPosts en el JSON.
      expect(links.posts.length).toBeGreaterThanOrEqual(1);
    });

    it("comparativa sin relatedPosts devuelve vacios", async () => {
      const synthetic = {
        meta: { title: "", description: "", keywords: [] },
        hero: { badge: "", headline: "", subheadline: "" },
        competitor: { name: "", tagline: "" },
        table: [],
        zaltykoPros: [],
        zaltykoContras: [],
        competitorPros: [],
        competitorContras: [],
        idealForZaltyko: [],
        idealForCompetitor: [],
        faq: [],
        verdict: "",
      };
      const links = await loadComparisonCrossLinks(synthetic);
      expect(links.posts).toEqual([]);
      expect(links.comparisons).toEqual([]);
    });
  });
});
