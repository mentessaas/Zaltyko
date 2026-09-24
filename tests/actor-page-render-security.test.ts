import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/actor-pages/service", () => ({
  getPublicPageBySlug: vi.fn(async () => ({
    entityType: "coach", publicSlug: "test-coach", displayName: "</script><script>alert(1)</script>",
    socialLinks: {}, bioBlocks: [], theme: { primary_color: "</style><script>alert(2)</script>" },
  })),
}));
import PublicPageRenderer from "@/components/actor-page-editor/PublicPageRenderer";
it("renders malicious profile data without closing raw script or style elements", async () => {
  const html = renderToStaticMarkup(await PublicPageRenderer({ entityType: "coach", slug: "test-coach", locale: "es" }));
  expect(html).not.toContain("<script>alert(");
  expect(html.match(/<script\b/g)).toHaveLength(1);
  const json = html.match(/<script[^>]*>(.*?)<\/script>/s)?.[1];
  expect(JSON.parse(json!).name).toBe("</script><script>alert(1)</script>");
});
