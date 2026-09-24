/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SplitWords from "@/components/motion/SplitWords";

describe("SplitWords accessibility contract", () => {
  it("keeps an accessible text alternative for the animated words", () => {
    render(<SplitWords text="Las cuotas cobradas, los grupos montados." />);

    const accessibleText = screen.getByText("Las cuotas cobradas, los grupos montados.", {
      selector: ".sr-only",
    });

    expect(accessibleText).toBeInTheDocument();
    expect(accessibleText).not.toHaveAttribute("aria-hidden");
  });

  it("hides the visual word fragments from assistive technology", () => {
    render(<SplitWords text="Una frase animada." />);

    const fragments = document.querySelectorAll(".zk-word");
    expect(fragments).toHaveLength(3);
    fragments.forEach((fragment) => {
      expect(fragment).toHaveAttribute("aria-hidden", "true");
    });
  });
});
