/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ComparisonSection from "@/app/(site)/home/ComparisonSection";

describe("ComparisonSection accessibility contract", () => {
  it("labels each daily problem and its corresponding Zaltyko result", () => {
    const { container } = render(<ComparisonSection />);

    const comparisons = Array.from(container.querySelectorAll("article[aria-labelledby]"));
    expect(comparisons).toHaveLength(4);
    for (const comparison of comparisons) {
      const headingId = comparison.getAttribute("aria-labelledby");
      expect(headingId).toBeTruthy();
      expect(comparison.querySelector(`#${headingId}`)?.tagName).toBe("H3");
      expect(comparison.querySelector("p")?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps the visual comparison icons decorative", () => {
    const { container } = render(<ComparisonSection />);

    expect(container.querySelectorAll("article svg[aria-hidden=\"true\"]").length).toBeGreaterThan(0);
  });
});
