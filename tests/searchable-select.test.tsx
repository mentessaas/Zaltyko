/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "@/components/ui/searchable-select";

describe("SearchableSelect", () => {
  it("permite navegar opciones con teclado y seleccionar con Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchableSelect
        options={[{ value: "es", label: "España" }, { value: "mx", label: "México" }]}
        value=""
        onChange={onChange}
        placeholder="Selecciona un país"
      />
    );

    const trigger = screen.getByRole("button", { name: "Selecciona un país" });
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("mx");
  });
});
