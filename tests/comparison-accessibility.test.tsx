/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ComparisonSection from "@/app/(site)/home/ComparisonSection";

describe("ComparisonSection accessibility contract", () => {
  it("exposes boolean comparison values to assistive technology", () => {
    const { container } = render(<ComparisonSection />);

    const announcedValues = Array.from(container.querySelectorAll("td .sr-only")).map(
      (node) => node.textContent
    );

    expect(announcedValues).toContain("Sí");
    expect(announcedValues).toContain("No");
  });

  it("keeps the visual comparison icons decorative", () => {
    const { container } = render(<ComparisonSection />);

    expect(container.querySelectorAll("td svg[aria-hidden=\"true\"]").length).toBeGreaterThan(0);
  });
});
