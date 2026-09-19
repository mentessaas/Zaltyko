import { describe, expect, it } from "vitest";
import {
  getComparisonSlugs,
  isComparisonSlug,
  listComparisons,
  loadComparison,
} from "@/lib/seo/comparativas";

describe("comparativas", () => {
  it("getComparisonSlugs devuelve los 3 slugs registrados", () => {
    const slugs = getComparisonSlugs();
    expect(slugs.length).toBeGreaterThanOrEqual(3);
    expect(slugs).toContain("zaltyko-vs-excel");
    expect(slugs).toContain("zaltyko-vs-sportmember");
    expect(slugs).toContain("zaltyko-vs-glofox");
  });

  it("isComparisonSlug valida slugs conocidos y desconocidos", () => {
    expect(isComparisonSlug("zaltyko-vs-excel")).toBe(true);
    expect(isComparisonSlug("zaltyko-vs-glofox")).toBe(true);
    expect(isComparisonSlug("no-existe")).toBe(false);
  });

  it("loadComparison devuelve contenido para slugs válidos", async () => {
    const excel = await loadComparison("es", "zaltyko-vs-excel");
    expect(excel).not.toBeNull();
    expect(excel!.competitor.name).toBe("Microsoft Excel o Google Sheets");
    expect(excel!.table.length).toBeGreaterThan(5);
    expect(excel!.faq.length).toBe(3);
  });

  it("loadComparison devuelve null para locales no soportados", async () => {
    const out = await loadComparison("en", "zaltyko-vs-excel");
    expect(out).toBeNull();
  });

  it("listComparisons devuelve summaries con metadatos completos", async () => {
    const list = await listComparisons("es");
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const item of list) {
      expect(item.slug).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.competitorName).toBeTruthy();
    }
  });
});
