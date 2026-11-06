import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
}));
import Insights from "@/app/owner/insights/page";
import HealthScore from "@/app/owner/health-score/setup/page";
import ModulesLayout from "@/app/(site)/modules/layout";

describe("retired launch surfaces", () => {
  it.each([Insights, HealthScore])("does not reopen an advanced screen through a direct URL", async (page) => {
    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  });
  it("sends historical module marketing URLs to the current essential capabilities", () => {
    expect(() => ModulesLayout({ children: null })).toThrow("REDIRECT:/features");
  });
});
